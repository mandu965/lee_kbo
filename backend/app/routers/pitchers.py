from datetime import date as date_cls
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Game, PitcherStat, Player, Team
from app.schemas.player import PitcherDetail, PitcherStatResponse, PlayerBase
from app.time_utils import today_kst

router = APIRouter(tags=["pitchers"])


async def _latest_season_stat(
    session: AsyncSession, player_id: int, season: int
) -> Optional[PitcherStat]:
    return (
        await session.execute(
            select(PitcherStat)
            .where(
                PitcherStat.player_id == player_id,
                PitcherStat.season == season,
                PitcherStat.game_id.is_(None),
            )
            .order_by(desc(PitcherStat.id))
            .limit(1)
        )
    ).scalar_one_or_none()


@router.get("/players/{player_id}", response_model=PlayerBase)
async def get_player(player_id: int, session: AsyncSession = Depends(get_db)):
    """선수 기본 정보."""
    player: Optional[Player] = await session.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return PlayerBase(id=player.id, name=player.name, position=player.position, team_id=player.team_id)


@router.get("/players/{player_id}/stats", response_model=PitcherDetail)
async def get_player_stats(player_id: int, session: AsyncSession = Depends(get_db)):
    """투수 시즌 성적."""
    player: Optional[Player] = await session.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")

    season = today_kst().year
    stat = await _latest_season_stat(session, player_id, season)

    team_name = None
    if player.team_id:
        team: Optional[Team] = await session.get(Team, player.team_id)
        team_name = team.name if team else None

    return PitcherDetail(
        id=player.id,
        name=player.name,
        position=player.position,
        team_id=player.team_id,
        team_name=team_name,
        season_stats=PitcherStatResponse(
            season=season,
            era=stat.era if stat else None,
            whip=stat.whip if stat else None,
            innings_pitched=stat.innings_pitched if stat else None,
            strikeouts=stat.strikeouts if stat else None,
            walks=stat.walks if stat else None,
        ) if stat else None,
    )


@router.get("/pitchers/today", response_model=list[PitcherDetail])
async def get_today_starters(session: AsyncSession = Depends(get_db)):
    """오늘 선발 투수 목록 — 한 번의 JOIN으로 N+1 없이 조회."""
    today = today_kst()
    season = today.year

    # 오늘 경기에서 starter_id 전부 수집
    games = (
        await session.execute(select(Game).where(Game.game_date == today))
    ).scalars().all()

    player_ids: list[int] = []
    seen: set[int] = set()
    for g in games:
        for pid in (g.home_starter_id, g.away_starter_id):
            if pid and pid not in seen:
                seen.add(pid)
                player_ids.append(pid)

    if not player_ids:
        return []

    # 선수 + 팀 + 시즌 성적 한 번에 조회
    rows = (
        await session.execute(
            select(Player, Team, PitcherStat)
            .join(Team, Player.team_id == Team.id)
            .outerjoin(
                PitcherStat,
                (PitcherStat.player_id == Player.id)
                & (PitcherStat.season == season)
                & (PitcherStat.game_id.is_(None)),
            )
            .where(Player.id.in_(player_ids))
        )
    ).all()

    # player_id별 최신 성적만 유지 (outerjoin이라 중복 가능)
    stat_map: dict[int, PitcherStat | None] = {}
    player_map: dict[int, tuple[Player, Team]] = {}
    for player, team, stat in rows:
        player_map[player.id] = (player, team)
        if player.id not in stat_map or (stat and (stat_map[player.id] is None)):
            stat_map[player.id] = stat

    results = []
    for pid in player_ids:
        if pid not in player_map:
            continue
        player, team = player_map[pid]
        stat = stat_map.get(pid)
        results.append(
            PitcherDetail(
                id=player.id,
                name=player.name,
                position=player.position,
                team_id=player.team_id,
                team_name=team.name,
                season_stats=PitcherStatResponse(
                    season=season,
                    era=stat.era if stat else None,
                    whip=stat.whip if stat else None,
                    innings_pitched=stat.innings_pitched if stat else None,
                    strikeouts=stat.strikeouts if stat else None,
                    walks=stat.walks if stat else None,
                ) if stat else None,
            )
        )

    results.sort(key=lambda p: p.season_stats.era if p.season_stats and p.season_stats.era else 99.0)
    return results
