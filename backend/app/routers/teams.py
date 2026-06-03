from datetime import date as date_cls
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import EloHistory, Game, Team, TeamSeasonStandings
from app.schemas.team import EloHistoryItem, RecentGameItem, TeamDetail, TeamInRanking
from app.time_utils import today_kst

router = APIRouter(prefix="/teams", tags=["teams"])


async def _calc_record(session: AsyncSession, team_id: int, season: int) -> tuple[int, int, int]:
    """(wins, losses, draws) 반환."""
    stmt = select(Game).where(
        Game.status == "final",
        func.extract("year", Game.game_date) == season,
        or_(Game.home_team_id == team_id, Game.away_team_id == team_id),
    )
    games = (await session.execute(stmt)).scalars().all()
    wins = losses = draws = 0
    for g in games:
        if g.home_score is None or g.away_score is None:
            continue
        is_home = g.home_team_id == team_id
        my = g.home_score if is_home else g.away_score
        opp = g.away_score if is_home else g.home_score
        if my > opp:
            wins += 1
        elif my < opp:
            losses += 1
        else:
            draws += 1
    return wins, losses, draws


async def _recent_form_str(session: AsyncSession, team_id: int, n: int = 5) -> str:
    today = today_kst()
    stmt = (
        select(Game)
        .where(
            Game.status == "final",
            Game.game_date < today,
            or_(Game.home_team_id == team_id, Game.away_team_id == team_id),
        )
        .order_by(desc(Game.game_date))
        .limit(n)
    )
    games = (await session.execute(stmt)).scalars().all()
    chars = []
    for g in reversed(games):
        if g.home_score is None:
            continue
        is_home = g.home_team_id == team_id
        my = g.home_score if is_home else g.away_score
        opp = g.away_score if is_home else g.home_score
        chars.append("W" if my > opp else ("D" if my == opp else "L"))
    return "".join(chars)


@router.get("", response_model=list[TeamInRanking])
async def get_teams(session: AsyncSession = Depends(get_db)):
    """전체 팀 목록 + 순위. TeamSeasonStandings 우선 사용, 없으면 DB 집계 폴백."""
    season = today_kst().year
    teams = (await session.execute(select(Team))).scalars().all()

    # standings 캐시 조회
    standings_map: dict[int, TeamSeasonStandings] = {}
    rows = (await session.execute(
        select(TeamSeasonStandings).where(TeamSeasonStandings.season == season)
    )).scalars().all()
    for s in rows:
        standings_map[s.team_id] = s

    result: list[TeamInRanking] = []
    for t in teams:
        st = standings_map.get(t.id)
        if st:
            w, l, d = st.wins or 0, st.losses or 0, st.draws or 0
            form = await _recent_form_str(session, t.id)
            result.append(TeamInRanking(
                id=t.id, code=t.code, name=t.name, short_name=t.short_name,
                elo_rating=t.elo_rating,
                rank=st.rank,
                wins=w, losses=l, draws=d,
                games_played=st.games_played or (w + l + d),
                win_rate=st.win_pct or 0.0,
                games_behind=st.games_behind,
                recent_form=form,
                last10=st.last10,
                streak=st.streak,
                home_record=st.home_record,
                away_record=st.away_record,
            ))
        else:
            w, l, d = await _calc_record(session, t.id, season)
            played = w + l + d
            form = await _recent_form_str(session, t.id)
            result.append(TeamInRanking(
                id=t.id, code=t.code, name=t.name, short_name=t.short_name,
                elo_rating=t.elo_rating,
                wins=w, losses=l, draws=d,
                games_played=played,
                win_rate=round(w / played, 4) if played else 0.0,
                recent_form=form,
            ))

    result.sort(key=lambda x: (x.rank or 99, -x.wins))
    return result


@router.get("/{team_id}", response_model=TeamDetail)
async def get_team(team_id: int, session: AsyncSession = Depends(get_db)):
    """팀 상세."""
    team: Optional[Team] = await session.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    season = today_kst().year
    w, l, d = await _calc_record(session, team_id, season)
    played = w + l + d
    return TeamDetail(
        id=team.id, code=team.code, name=team.name,
        short_name=team.short_name, stadium=team.stadium,
        elo_rating=team.elo_rating,
        wins=w, losses=l, draws=d,
        win_rate=round(w / played, 4) if played else 0.0,
    )


@router.get("/{team_id}/recent", response_model=list[RecentGameItem])
async def get_team_recent(
    team_id: int,
    n: int = 10,
    session: AsyncSession = Depends(get_db),
):
    """최근 N경기 결과."""
    team: Optional[Team] = await session.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    stmt = (
        select(Game)
        .where(
            Game.status == "final",
            or_(Game.home_team_id == team_id, Game.away_team_id == team_id),
        )
        .order_by(desc(Game.game_date))
        .limit(n)
    )
    games = (await session.execute(stmt)).scalars().all()

    items: list[RecentGameItem] = []
    for g in games:
        is_home = g.home_team_id == team_id
        opp_id = g.away_team_id if is_home else g.home_team_id
        opp: Optional[Team] = await session.get(Team, opp_id)
        my = (g.home_score if is_home else g.away_score)
        opp_score = (g.away_score if is_home else g.home_score)
        result = None
        if my is not None and opp_score is not None:
            result = "W" if my > opp_score else ("D" if my == opp_score else "L")
        items.append(
            RecentGameItem(
                game_date=g.game_date,
                opponent_name=opp.name if opp else "Unknown",
                is_home=is_home,
                my_score=my,
                opp_score=opp_score,
                result=result,
                stadium=g.stadium,
            )
        )
    return items


@router.get("/{team_id}/elo-history", response_model=list[EloHistoryItem])
async def get_elo_history(
    team_id: int,
    limit: int = 30,
    session: AsyncSession = Depends(get_db),
):
    """ELO 변동 히스토리."""
    team: Optional[Team] = await session.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    stmt = (
        select(EloHistory)
        .where(EloHistory.team_id == team_id)
        .order_by(desc(EloHistory.game_date))
        .limit(limit)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        EloHistoryItem(
            game_date=r.game_date,
            elo_before=r.elo_before,
            elo_after=r.elo_after,
            elo_change=r.elo_change,
        )
        for r in reversed(rows)
    ]


@router.get("/{team_id}/roster")
async def get_team_roster(team_id: int, session: AsyncSession = Depends(get_db)):
    """팀 로스터 + 시즌 기록 집계."""
    from app.models import Player, PitcherStat, BatterStat
    from sqlalchemy import func as sqlfunc

    team: Optional[Team] = await session.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    season = today_kst().year

    # 선수 목록
    players = (await session.execute(
        select(Player).where(Player.team_id == team_id, Player.is_active == True)
    )).scalars().all()

    pitchers, batters = [], []
    for p in players:
        stat_p = (await session.execute(
            select(PitcherStat)
            .where(PitcherStat.player_id == p.id, PitcherStat.season == season, PitcherStat.game_id.is_(None))
            .limit(1)
        )).scalar_one_or_none()
        stat_b = (await session.execute(
            select(BatterStat)
            .where(BatterStat.player_id == p.id, BatterStat.season == season)
            .limit(1)
        )).scalar_one_or_none()

        base = {"id": p.id, "name": p.name, "position": p.position, "injury": p.injury_status}
        if stat_p:
            pitchers.append({**base,
                "era": stat_p.era, "whip": stat_p.whip,
                "games": stat_p.games, "wins": stat_p.wins, "losses": stat_p.losses,
                "saves": stat_p.saves, "holds": stat_p.holds,
                "innings_pitched": stat_p.innings_pitched, "strikeouts": stat_p.strikeouts,
                "k_bb": round(stat_p.strikeouts / stat_p.walks, 2)
                    if stat_p.strikeouts and stat_p.walks and stat_p.walks > 0 else None,
            })
        elif stat_b:
            batters.append({**base,
                "avg": stat_b.avg, "ops": stat_b.ops, "obp": stat_b.obp, "slg": stat_b.slg,
                "games": stat_b.games, "home_runs": stat_b.home_runs,
                "rbi": stat_b.rbi, "hits": stat_b.hits, "plate_app": stat_b.plate_app,
            })

    # 팀 집계
    pit_rows = (await session.execute(
        select(PitcherStat).where(PitcherStat.player_id.in_([p.id for p in players]),
                                   PitcherStat.season == season, PitcherStat.game_id.is_(None))
    )).scalars().all()
    bat_rows = (await session.execute(
        select(BatterStat).where(BatterStat.player_id.in_([p.id for p in players]),
                                  BatterStat.season == season)
    )).scalars().all()

    def safe_avg(vals): return round(sum(vals)/len(vals), 3) if vals else None

    eras = [r.era for r in pit_rows if r.era is not None]
    whips = [r.whip for r in pit_rows if r.whip is not None]
    ops_list = [r.ops for r in bat_rows if r.ops is not None]
    avgs = [r.avg for r in bat_rows if r.avg is not None]

    return {
        "team_id": team_id,
        "team_name": team.name,
        "season": season,
        "pitchers": sorted(pitchers, key=lambda x: x.get("era") or 99),
        "batters": sorted(batters, key=lambda x: -(x.get("ops") or 0)),
        "team_stats": {
            "avg_era": safe_avg(eras),
            "avg_whip": safe_avg(whips),
            "team_ops": safe_avg(ops_list),
            "team_avg": safe_avg(avgs),
        },
    }
