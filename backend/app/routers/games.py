from datetime import date as date_cls, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.engine.bullpen import calc_bullpen_fatigue
from app.engine.lineup import calc_lineup_strength
from app.engine.park_factor import get_park_info
from app.engine.weather_adjuster import calc_weather_effect
from app.models import (
    BatterStat, Game, GameLineup, PitcherStat, Player, Prediction, PredictionRun,
    Team, TeamGameStat, TeamSeasonStandings,
)
from app.schemas.game import (
    BullpenInfo, DataFreshnessItem, FactorContribution, GameListResponse, GameResponse, ParkFactorInfo,
    PredictionInGame, PredictionTrendItem, StarterAppearanceInfo, StarterInfo,
    StarterRecentSummary, StartersInGame, TeamInGame, TeamRecentGameInfo,
    LineupPlayerImpactInfo, LineupPlayerInfo, TeamLineupInfo, TeamRecentTrendInfo, WeatherInfo,
)
from app.time_utils import today_kst, now_kst

router = APIRouter(prefix="/games", tags=["games"])


# ── 공통 헬퍼 ────────────────────────────────────────────────

async def _recent_form(session: AsyncSession, team_id: int, before: date_cls, n: int = 5) -> str:
    stmt = (
        select(Game)
        .where(
            Game.status == "final",
            Game.game_date < before,
            (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
        )
        .order_by(desc(Game.game_date))
        .limit(n)
    )
    games = (await session.execute(stmt)).scalars().all()
    chars = []
    for g in reversed(games):
        if g.home_score is None or g.away_score is None:
            continue
        if g.home_team_id == team_id:
            chars.append("W" if g.home_score > g.away_score else "L")
        else:
            chars.append("W" if g.away_score > g.home_score else "L")
    return "".join(chars)


async def _starter_recent_form(
    session: AsyncSession, player_id: int, before: date_cls, n: int = 5
) -> tuple[StarterRecentSummary | None, list[StarterAppearanceInfo]]:
    rows = (
        await session.execute(
            select(PitcherStat, Game)
            .join(Game, PitcherStat.game_id == Game.id)
            .where(
                PitcherStat.player_id == player_id,
                PitcherStat.game_id.is_not(None),
                PitcherStat.is_starter == True,
                Game.game_date < before,
                Game.status == "final",
            )
            .order_by(desc(Game.game_date), desc(Game.id))
            .limit(n)
        )
    ).all()
    if not rows:
        return None, []
    innings = round(sum(stat.innings_pitched or 0 for stat, _ in rows), 1)
    earned_runs = sum(stat.earned_runs or 0 for stat, _ in rows)
    hits = sum(stat.hits or 0 for stat, _ in rows)
    walks = sum(stat.walks or 0 for stat, _ in rows)
    summary = StarterRecentSummary(
        games=len(rows),
        innings_pitched=innings,
        era=round(earned_runs * 9 / innings, 2) if innings else None,
        whip=round((hits + walks) / innings, 2) if innings else None,
        avg_innings=round(innings / len(rows), 1),
    )
    games = [
        StarterAppearanceInfo(
            game_date=game.game_date,
            opponent_name=stat.opponent_name or "",
            game_result=stat.game_result,
            innings_pitched=stat.innings_pitched or 0,
            hits=stat.hits or 0,
            walks=stat.walks or 0,
            strikeouts=stat.strikeouts or 0,
            runs=stat.runs or 0,
            earned_runs=stat.earned_runs or 0,
        )
        for stat, game in rows
    ]
    return summary, games


def _per_9(count: int | None, innings: float | None) -> float | None:
    """이닝당 9이닝 환산 비율 (K/9, BB/9, HR/9). 이닝이 0이거나 값이 없으면 None."""
    if count is None or not innings:
        return None
    return round(count * 9 / innings, 2)


async def _starter_info(
    session: AsyncSession,
    player_id: Optional[int],
    season: int,
    before: date_cls,
    include_recent: bool = True,
) -> Optional[StarterInfo]:
    if player_id is None:
        return None
    player: Optional[Player] = await session.get(Player, player_id)
    if player is None:
        return None
    stat = (
        await session.execute(
            select(PitcherStat)
            .where(
                PitcherStat.player_id == player_id,
                PitcherStat.season == season,
                PitcherStat.game_id.is_(None),
                PitcherStat.is_starter == True,
            )
            .order_by(desc(PitcherStat.id))
            .limit(1)
        )
    ).scalar_one_or_none()
    k_bb = None
    if stat and stat.strikeouts and stat.walks and stat.walks > 0:
        k_bb = round(stat.strikeouts / stat.walks, 2)
    recent_summary = None
    recent_games: list[StarterAppearanceInfo] = []
    if include_recent:
        recent_summary, recent_games = await _starter_recent_form(session, player_id, before)
    return StarterInfo(
        id=player.id,
        name=player.name,
        era=stat.era if stat else None,
        whip=stat.whip if stat else None,
        k_bb_ratio=k_bb,
        wins=stat.wins if stat else None,
        losses=stat.losses if stat else None,
        innings_pitched=stat.innings_pitched if stat else None,
        games=stat.games if stat else None,
        k_per_9=_per_9(stat.strikeouts, stat.innings_pitched) if stat else None,
        bb_per_9=_per_9(stat.walks, stat.innings_pitched) if stat else None,
        hr_per_9=_per_9(stat.home_runs_allowed, stat.innings_pitched) if stat else None,
        recent_summary=recent_summary,
        recent_games=recent_games,
        is_confirmed=True,
    )


async def _team_recent_trend(
    session: AsyncSession, team_id: int, before: date_cls, n: int = 7
) -> TeamRecentTrendInfo | None:
    games = (
        await session.execute(
            select(Game)
            .where(
                Game.status == "final",
                Game.game_date < before,
                (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
            )
            .order_by(desc(Game.game_date), desc(Game.id))
            .limit(n)
        )
    ).scalars().all()
    if not games:
        return None
    recent_games: list[TeamRecentGameInfo] = []
    wins = losses = draws = runs_for = runs_against = 0
    for game in games:
        is_home = game.home_team_id == team_id
        my_score = game.home_score if is_home else game.away_score
        opp_score = game.away_score if is_home else game.home_score
        opponent_id = game.away_team_id if is_home else game.home_team_id
        opponent = await session.get(Team, opponent_id)
        if my_score is None or opp_score is None:
            continue
        result = "W" if my_score > opp_score else "L" if my_score < opp_score else "D"
        wins += int(result == "W")
        losses += int(result == "L")
        draws += int(result == "D")
        runs_for += my_score
        runs_against += opp_score
        recent_games.append(TeamRecentGameInfo(
            game_date=game.game_date,
            opponent_name=(opponent.short_name or opponent.name) if opponent else "",
            result=result,
            runs_for=my_score,
            runs_against=opp_score,
        ))
    count = len(recent_games)
    if not count:
        return None
    ops_rows = (
        await session.execute(
            select(TeamGameStat.team_ops)
            .join(Game, TeamGameStat.game_id == Game.id)
            .where(
                TeamGameStat.team_id == team_id,
                TeamGameStat.team_ops.is_not(None),
                Game.game_date < before,
            )
            .order_by(desc(Game.game_date), desc(Game.id))
            .limit(n)
        )
    ).scalars().all()

    stat_rows = (
        await session.execute(
            select(
                TeamGameStat.hits,
                TeamGameStat.home_runs,
                TeamGameStat.walks,
                TeamGameStat.strikeouts,
            )
            .join(Game, TeamGameStat.game_id == Game.id)
            .where(
                TeamGameStat.team_id == team_id,
                Game.game_date < before,
            )
            .order_by(desc(Game.game_date), desc(Game.id))
            .limit(n)
        )
    ).all()
    stat_count = len(stat_rows)
    total_hits = sum(row.hits or 0 for row in stat_rows)
    total_home_runs = sum(row.home_runs or 0 for row in stat_rows)
    total_walks = sum(row.walks or 0 for row in stat_rows)
    total_strikeouts = sum(row.strikeouts or 0 for row in stat_rows)

    return TeamRecentTrendInfo(
        games=count,
        wins=wins,
        losses=losses,
        draws=draws,
        runs_for=runs_for,
        runs_against=runs_against,
        avg_runs_for=round(runs_for / count, 1),
        avg_runs_against=round(runs_against / count, 1),
        run_diff=runs_for - runs_against,
        avg_ops=round(sum(ops_rows) / len(ops_rows), 3) if ops_rows else None,
        ops_games=len(ops_rows),
        avg_hits=round(total_hits / stat_count, 1) if stat_count else None,
        avg_home_runs=round(total_home_runs / stat_count, 1) if stat_count else None,
        avg_walks=round(total_walks / stat_count, 1) if stat_count else None,
        avg_strikeouts=round(total_strikeouts / stat_count, 1) if stat_count else None,
        walk_strikeout_ratio=round(total_walks / total_strikeouts, 2) if total_strikeouts else None,
        stat_games=stat_count,
        recent_games=recent_games,
    )


async def _team_lineup(
    session: AsyncSession, game_id: int, team_id: int, season: int
) -> TeamLineupInfo | None:
    rows = (
        await session.execute(
            select(GameLineup)
            .where(
                GameLineup.game_id == game_id,
                GameLineup.team_id == team_id,
                GameLineup.is_starter == True,
            )
            .order_by(GameLineup.bat_order, GameLineup.id)
        )
    ).scalars().all()
    if not rows:
        return None
    strength = await calc_lineup_strength(session, game_id, team_id, season)
    return TeamLineupInfo(
        is_confirmed=all(row.is_confirmed for row in rows),
        strength_available=strength.available,
        weighted_ops=strength.weighted_ops,
        baseline_ops=strength.baseline_ops,
        strength_ratio=strength.strength_ratio,
        ops_player_count=strength.ops_player_count,
        excluded_regulars=[
            LineupPlayerImpactInfo(player_id=player.player_id, name=player.name, ops=player.ops)
            for player in strength.excluded_regulars
        ],
        replacements=[
            LineupPlayerImpactInfo(player_id=player.player_id, name=player.name, ops=player.ops)
            for player in strength.replacements
        ],
        players=[
            LineupPlayerInfo(
                player_id=row.player_id,
                name=row.player_name,
                bat_order=row.bat_order,
                position=row.position,
                ops=strength.player_ops.get(row.player_id) if row.player_id is not None else None,
            )
            for row in rows
        ],
    )


async def _team_ace(session: AsyncSession, team_id: int, season: int) -> Optional[StarterInfo]:
    """선발 미등록 시 팀의 시즌 ERA 상위(이닝 많은) 투수를 반환. is_starter=True."""
    stmt = (
        select(PitcherStat, Player)
        .join(Player, PitcherStat.player_id == Player.id)
        .where(
            Player.team_id == team_id,
            PitcherStat.season == season,
            PitcherStat.game_id.is_(None),
            PitcherStat.innings_pitched >= 20,
        )
        .order_by(PitcherStat.innings_pitched.desc())
        .limit(1)
    )
    row = (await session.execute(stmt)).first()
    if row is None:
        return None
    stat, player = row
    k_bb = None
    if stat.strikeouts and stat.walks and stat.walks > 0:
        k_bb = round(stat.strikeouts / stat.walks, 2)
    return StarterInfo(
        id=player.id, name=player.name,
        era=stat.era, whip=stat.whip,
        k_bb_ratio=k_bb,
        wins=stat.wins, losses=stat.losses,
        innings_pitched=stat.innings_pitched,
        games=stat.games,
        k_per_9=_per_9(stat.strikeouts, stat.innings_pitched),
        bb_per_9=_per_9(stat.walks, stat.innings_pitched),
        hr_per_9=_per_9(stat.home_runs_allowed, stat.innings_pitched),
        is_confirmed=False,
    )


def _change_pp(current: PredictionRun | None, previous: PredictionRun | None) -> float | None:
    if current is None or previous is None:
        return None
    return round((current.home_win_prob - previous.home_win_prob) * 100, 2)


def _prediction_schema(
    pred: Optional[Prediction],
    latest_run: PredictionRun | None = None,
    previous_run: PredictionRun | None = None,
) -> Optional[PredictionInGame]:
    if pred is None:
        return None
    # feature_snapshot에서 신뢰도 추출
    snapshot = (latest_run.feature_snapshot or {}) if latest_run else {}
    confidence = snapshot.get("confidence", 0.0)
    confidence_level = snapshot.get("confidence_level", "보통")
    indicator_votes = snapshot.get("indicator_votes", {})

    return PredictionInGame(
        home_win_prob=pred.home_win_prob,
        away_win_prob=pred.away_win_prob,
        key_factors=(latest_run.key_factors or [])[:3] if latest_run else [],
        model_version=latest_run.model_version if latest_run else pred.model_version,
        generated_at=latest_run.generated_at if latest_run else pred.updated_at,
        prediction_type=latest_run.prediction_type if latest_run else None,
        data_completeness=latest_run.data_completeness if latest_run else None,
        missing_features=latest_run.missing_features or [] if latest_run else [],
        factor_contributions=latest_run.factor_contributions or [] if latest_run else [],
        change_from_previous_pp=_change_pp(latest_run, previous_run),
        confidence=confidence,
        confidence_level=confidence_level,
        indicator_votes=indicator_votes,
    )


async def _latest_prediction_runs(
    session: AsyncSession, game_id: int, limit: int = 2
) -> list[PredictionRun]:
    return list((
        await session.execute(
            select(PredictionRun)
            .where(
                PredictionRun.game_id == game_id,
                PredictionRun.is_published == True,
            )
            .order_by(desc(PredictionRun.generated_at), desc(PredictionRun.id))
            .limit(limit)
        )
    ).scalars().all())


async def _build_data_freshness(
    session: AsyncSession, game: Game, season: int, pred: Prediction | None
) -> list[DataFreshnessItem]:
    """경기 입력 데이터별 기준 시각·원천·갱신 지연 여부를 집계."""
    now = now_kst()
    STALE_HOURS = 26  # 26시간 이상 미갱신이면 지연 표시

    def to_aware(dt):
        if dt is None:
            return None
        # DB는 naive(KST 저장)로 보관 → KST tz 부여
        return dt.replace(tzinfo=now.tzinfo) if dt.tzinfo is None else dt

    def stale(dt) -> bool:
        a = to_aware(dt)
        return a is not None and (now - a).total_seconds() > STALE_HOURS * 3600

    items: list[DataFreshnessItem] = []

    # 투수 시즌 기록 (양 팀 중 최신)
    pit_dt = await session.scalar(
        select(func.max(PitcherStat.updated_at))
        .where(PitcherStat.season == season, PitcherStat.game_id.is_(None))
    )
    items.append(DataFreshnessItem(
        key="pitcher", label="투수 기록", updated_at=to_aware(pit_dt),
        source="KBO 공식 기록실", is_stale=stale(pit_dt),
        note=None if pit_dt else "미수집",
    ))

    # 타자 시즌 기록
    bat_dt = await session.scalar(
        select(func.max(BatterStat.updated_at)).where(BatterStat.season == season)
    )
    items.append(DataFreshnessItem(
        key="batter", label="타자 기록", updated_at=to_aware(bat_dt),
        source="KBO 공식 기록실", is_stale=stale(bat_dt),
        note=None if bat_dt else "미수집",
    ))

    # 팀 순위
    std_dt = await session.scalar(
        select(func.max(TeamSeasonStandings.updated_at)).where(TeamSeasonStandings.season == season)
    )
    items.append(DataFreshnessItem(
        key="standings", label="팀 순위", updated_at=to_aware(std_dt),
        source="KBO 공식 기록실", is_stale=stale(std_dt),
        note=None if std_dt else "미수집",
    ))

    # 라인업 (해당 경기)
    lineup_dt = await session.scalar(
        select(func.max(GameLineup.updated_at)).where(GameLineup.game_id == game.id)
    )
    items.append(DataFreshnessItem(
        key="lineup", label="확정 타순", updated_at=to_aware(lineup_dt),
        source="네이버 스포츠", is_stale=False,
        note=None if lineup_dt else "미발표",
    ))

    # 날씨
    items.append(DataFreshnessItem(
        key="weather", label="날씨", updated_at=None,
        source="Open-Meteo", is_stale=False,
        note=None if game.weather_temp is not None else "미수집",
    ))

    # 예측
    items.append(DataFreshnessItem(
        key="prediction", label="예측", updated_at=to_aware(pred.updated_at) if pred else None,
        source="자체 모델", is_stale=False,
        note=None if pred else "미생성",
    ))

    return items


async def _build_game_response(session: AsyncSession, game: Game) -> GameResponse:
    home_team: Team = await session.get(Team, game.home_team_id)
    away_team: Team = await session.get(Team, game.away_team_id)
    season = game.game_date.year

    home_form = await _recent_form(session, home_team.id, game.game_date)
    away_form = await _recent_form(session, away_team.id, game.game_date)

    pred = (
        await session.execute(
            select(Prediction).where(Prediction.game_id == game.id)
        )
    ).scalar_one_or_none()
    runs = await _latest_prediction_runs(session, game.id)

    home_starter = await _starter_info(session, game.home_starter_id, season, game.game_date)
    away_starter = await _starter_info(session, game.away_starter_id, season, game.game_date)
    # 선발 미등록 시 팀의 이닝 최다 투수로 폴백
    if home_starter is None and home_team:
        home_starter = await _team_ace(session, home_team.id, season)
    if away_starter is None and away_team:
        away_starter = await _team_ace(session, away_team.id, season)

    return GameResponse(
        id=game.id,
        game_date=game.game_date,
        start_time=game.start_time,
        stadium=game.stadium,
        status=game.status,
        home_team=TeamInGame(
            id=home_team.id,
            code=home_team.code,
            name=home_team.name,
            short_name=home_team.short_name,
            elo_rating=home_team.elo_rating,
            home_elo=home_team.home_elo,
            away_elo=home_team.away_elo,
            recent_form=home_form,
        ),
        away_team=TeamInGame(
            id=away_team.id,
            code=away_team.code,
            name=away_team.name,
            short_name=away_team.short_name,
            elo_rating=away_team.elo_rating,
            home_elo=away_team.home_elo,
            away_elo=away_team.away_elo,
            recent_form=away_form,
        ),
        home_score=game.home_score,
        away_score=game.away_score,
        prediction=_prediction_schema(pred, runs[0] if runs else None, runs[1] if len(runs) > 1 else None),
        starters=StartersInGame(home=home_starter, away=away_starter),
        home_trend=await _team_recent_trend(session, home_team.id, game.game_date),
        away_trend=await _team_recent_trend(session, away_team.id, game.game_date),
        home_lineup=await _team_lineup(session, game.id, home_team.id, season),
        away_lineup=await _team_lineup(session, game.id, away_team.id, season),
        data_freshness=await _build_data_freshness(session, game, season, pred),
    )


async def _build_game_summary_response(session: AsyncSession, game: Game) -> GameResponse:
    home_team: Team = await session.get(Team, game.home_team_id)
    away_team: Team = await session.get(Team, game.away_team_id)
    season = game.game_date.year

    home_form = await _recent_form(session, home_team.id, game.game_date)
    away_form = await _recent_form(session, away_team.id, game.game_date)

    pred = (
        await session.execute(
            select(Prediction).where(Prediction.game_id == game.id)
        )
    ).scalar_one_or_none()
    runs = await _latest_prediction_runs(session, game.id)

    home_starter = await _starter_info(
        session, game.home_starter_id, season, game.game_date, include_recent=False
    )
    away_starter = await _starter_info(
        session, game.away_starter_id, season, game.game_date, include_recent=False
    )
    if home_starter is None and home_team:
        home_starter = await _team_ace(session, home_team.id, season)
    if away_starter is None and away_team:
        away_starter = await _team_ace(session, away_team.id, season)

    prediction_summary = _prediction_schema(
        pred, runs[0] if runs else None, runs[1] if len(runs) > 1 else None
    )

    if prediction_summary is not None:
        bullpen_team_count = await session.scalar(
            select(func.count(func.distinct(Player.team_id)))
            .select_from(PitcherStat)
            .join(Game, PitcherStat.game_id == Game.id)
            .join(Player, PitcherStat.player_id == Player.id)
            .where(
                PitcherStat.game_id.is_not(None),
                PitcherStat.is_starter == False,
                Player.team_id.in_([game.home_team_id, game.away_team_id]),
                Game.game_date >= game.game_date - timedelta(days=3),
                Game.game_date < game.game_date,
                Game.status == "final",
            )
        )
        if bullpen_team_count == 2:
            bp_home = await calc_bullpen_fatigue(session, game.home_team_id, game.game_date)
            bp_away = await calc_bullpen_fatigue(session, game.away_team_id, game.game_date)
            prediction_summary.bullpen_home = BullpenInfo.model_validate(bp_home)
            prediction_summary.bullpen_away = BullpenInfo.model_validate(bp_away)

    return GameResponse(
        id=game.id,
        game_date=game.game_date,
        start_time=game.start_time,
        stadium=game.stadium,
        status=game.status,
        home_team=TeamInGame(
            id=home_team.id,
            code=home_team.code,
            name=home_team.name,
            short_name=home_team.short_name,
            elo_rating=home_team.elo_rating,
            home_elo=home_team.home_elo,
            away_elo=home_team.away_elo,
            recent_form=home_form,
        ),
        away_team=TeamInGame(
            id=away_team.id,
            code=away_team.code,
            name=away_team.name,
            short_name=away_team.short_name,
            elo_rating=away_team.elo_rating,
            home_elo=away_team.home_elo,
            away_elo=away_team.away_elo,
            recent_form=away_form,
        ),
        home_score=game.home_score,
        away_score=game.away_score,
        prediction=prediction_summary,
        starters=StartersInGame(home=home_starter, away=away_starter),
        home_trend=None,
        away_trend=None,
        home_lineup=None,
        away_lineup=None,
        data_freshness=[],
    )


# ── 엔드포인트 ────────────────────────────────────────────────

@router.get("/today", response_model=GameListResponse)
async def get_today_games(session: AsyncSession = Depends(get_db)):
    """오늘 경기 목록 + 예측."""
    today = today_kst()
    return await get_games_by_date(today, session)


@router.get("", response_model=GameListResponse)
async def get_games_by_date_query(
    date: date_cls = Query(default_factory=date_cls.today),
    session: AsyncSession = Depends(get_db),
):
    """날짜별 경기 목록 (?date=2026-05-29)."""
    return await get_games_by_date(date, session)


async def get_games_by_date(target_date: date_cls, session: AsyncSession) -> GameListResponse:
    stmt = select(Game).where(Game.game_date == target_date).order_by(Game.start_time)
    games = (await session.execute(stmt)).scalars().all()

    if not games:
        return GameListResponse(date=target_date, total=0, games=[])

    # 팀 전체를 한 번에 로드 — 이후 _build_game_response 에서 session.get() 캐시 히트
    team_ids = set()
    for g in games:
        team_ids.add(g.home_team_id)
        team_ids.add(g.away_team_id)
    await session.execute(select(Team).where(Team.id.in_(team_ids)))

    responses = [await _build_game_response(session, g) for g in games]
    return GameListResponse(date=target_date, total=len(responses), games=responses)


@router.get("/{game_id}/summary", response_model=GameResponse)
async def get_game_summary(game_id: int, session: AsyncSession = Depends(get_db)):
    """경기 상세 첫 화면용 요약 데이터."""
    game: Optional[Game] = await session.get(Game, game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return await _build_game_summary_response(session, game)


@router.get("/{game_id}", response_model=GameResponse)
async def get_game_detail(game_id: int, session: AsyncSession = Depends(get_db)):
    """경기 상세."""
    game: Optional[Game] = await session.get(Game, game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return await _build_game_response(session, game)


@router.get("/{game_id}/prediction", response_model=PredictionInGame)
async def get_game_prediction(game_id: int, session: AsyncSession = Depends(get_db)):
    """경기 예측 상세 (파크팩터·날씨·불펜 포함)."""
    pred = (
        await session.execute(
            select(Prediction).where(Prediction.game_id == game_id)
        )
    ).scalar_one_or_none()
    if pred is None:
        raise HTTPException(status_code=404, detail="Prediction not found")

    game: Optional[Game] = await session.get(Game, game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    runs = list((
        await session.execute(
            select(PredictionRun)
            .where(
                PredictionRun.game_id == game_id,
                PredictionRun.is_published == True,
            )
            .order_by(PredictionRun.generated_at, PredictionRun.id)
        )
    ).scalars().all())
    latest_run = runs[-1] if runs else None
    previous_run = runs[-2] if len(runs) > 1 else None

    # 파크팩터
    park = get_park_info(game.stadium)
    park_schema = ParkFactorInfo(
        stadium=park.stadium,
        factor=park.factor,
        hr_factor=park.hr_factor,
        notes=park.notes,
    )

    # 날씨
    weather = calc_weather_effect(game.weather_temp, game.weather_cond, game.stadium)
    weather_schema = WeatherInfo(
        temperature=weather.temperature,
        condition=weather.condition,
        rain_risk=weather.rain_risk,
        offense_adj=weather.offense_adj,
        description=weather.description,
    ) if weather else None

    key_factors = list(latest_run.key_factors) if latest_run and latest_run.key_factors else [
        f"ELO 차이 {pred.elo_diff:+.1f} ({'홈팀' if (pred.elo_diff or 0) > 0 else '원정팀'} 우위)",
        f"홈 선발 투수 점수 {pred.pitcher_score_home:.3f} vs 원정 {pred.pitcher_score_away:.3f}",
        f"홈 최근 흐름 {pred.recent_form_home:.2f} vs 원정 {pred.recent_form_away:.2f}",
        f"구장 파크팩터 {park.factor:.2f} ({'타자' if park.factor > 1.0 else '투수'} 친화)",
    ]
    if weather and weather.description not in ("날씨 영향 미미", "돔 구장 — 날씨 영향 없음"):
        key_factors.append(f"날씨: {weather.description}")

    bullpen_home = bullpen_away = None
    bullpen_team_count = await session.scalar(
        select(func.count(func.distinct(Player.team_id)))
        .select_from(PitcherStat)
        .join(Game, PitcherStat.game_id == Game.id)
        .join(Player, PitcherStat.player_id == Player.id)
        .where(
            PitcherStat.game_id.is_not(None),
            PitcherStat.is_starter == False,
            Player.team_id.in_([game.home_team_id, game.away_team_id]),
            Game.game_date >= game.game_date - timedelta(days=3),
            Game.game_date < game.game_date,
            Game.status == "final",
        )
    )
    if bullpen_team_count == 2:
        bp_home = await calc_bullpen_fatigue(session, game.home_team_id, game.game_date)
        bp_away = await calc_bullpen_fatigue(session, game.away_team_id, game.game_date)
        bullpen_home = BullpenInfo.model_validate(bp_home)
        bullpen_away = BullpenInfo.model_validate(bp_away)

    trend: list[PredictionTrendItem] = []
    prior_prob: float | None = None
    for run in runs:
        change = round((run.home_win_prob - prior_prob) * 100, 2) if prior_prob is not None else None
        trend.append(PredictionTrendItem(
            generated_at=run.generated_at,
            prediction_type=run.prediction_type,
            home_win_prob=run.home_win_prob,
            change_pp=change,
            data_completeness=run.data_completeness,
        ))
        prior_prob = run.home_win_prob

    return PredictionInGame(
        home_win_prob=pred.home_win_prob,
        away_win_prob=pred.away_win_prob,
        key_factors=key_factors[:5],
        park=park_schema,
        weather=weather_schema,
        bullpen_home=bullpen_home,
        bullpen_away=bullpen_away,
        model_version=latest_run.model_version if latest_run else pred.model_version,
        generated_at=latest_run.generated_at if latest_run else pred.updated_at,
        prediction_type=latest_run.prediction_type if latest_run else None,
        data_completeness=latest_run.data_completeness if latest_run else None,
        missing_features=latest_run.missing_features or [] if latest_run else [],
        factor_contributions=latest_run.factor_contributions or [] if latest_run else [],
        change_from_previous_pp=_change_pp(latest_run, previous_run),
        trend=trend,
    )
