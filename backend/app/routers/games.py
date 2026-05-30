from datetime import date as date_cls, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.engine.park_factor import get_park_info
from app.engine.weather_adjuster import calc_weather_effect
from app.models import Game, PitcherStat, Player, Prediction, Team
from app.schemas.game import (
    BullpenInfo, GameListResponse, GameResponse, ParkFactorInfo,
    PredictionInGame, StarterInfo, StartersInGame, TeamInGame, WeatherInfo,
)

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


async def _starter_info(session: AsyncSession, player_id: Optional[int], season: int) -> Optional[StarterInfo]:
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
                PitcherStat.is_starter == True,
            )
            .order_by(desc(PitcherStat.id))
            .limit(1)
        )
    ).scalar_one_or_none()
    return StarterInfo(
        id=player.id,
        name=player.name,
        era=stat.era if stat else None,
        whip=stat.whip if stat else None,
        is_confirmed=True,
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
    return StarterInfo(id=player.id, name=player.name, era=stat.era, whip=stat.whip, is_confirmed=False)


def _prediction_schema(pred: Optional[Prediction]) -> Optional[PredictionInGame]:
    if pred is None:
        return None
    return PredictionInGame(
        home_win_prob=pred.home_win_prob,
        away_win_prob=pred.away_win_prob,
        key_factors=[],        # 상세 엔드포인트에서 별도 제공
    )


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

    home_starter = await _starter_info(session, game.home_starter_id, season)
    away_starter = await _starter_info(session, game.away_starter_id, season)
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
            name=home_team.name,
            short_name=home_team.short_name,
            elo_rating=home_team.elo_rating,
            recent_form=home_form,
        ),
        away_team=TeamInGame(
            id=away_team.id,
            name=away_team.name,
            short_name=away_team.short_name,
            elo_rating=away_team.elo_rating,
            recent_form=away_form,
        ),
        home_score=game.home_score,
        away_score=game.away_score,
        prediction=_prediction_schema(pred),
        starters=StartersInGame(home=home_starter, away=away_starter),
    )


# ── 엔드포인트 ────────────────────────────────────────────────

@router.get("/today", response_model=GameListResponse)
async def get_today_games(session: AsyncSession = Depends(get_db)):
    """오늘 경기 목록 + 예측."""
    today = date_cls.today()
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

    key_factors = [
        f"ELO 차이 {pred.elo_diff:+.1f} ({'홈팀' if (pred.elo_diff or 0) > 0 else '원정팀'} 우위)",
        f"홈 선발 투수 점수 {pred.pitcher_score_home:.3f} vs 원정 {pred.pitcher_score_away:.3f}",
        f"홈 최근 흐름 {pred.recent_form_home:.2f} vs 원정 {pred.recent_form_away:.2f}",
        f"구장 파크팩터 {park.factor:.2f} ({'타자' if park.factor > 1.0 else '투수'} 친화)",
    ]
    if weather and weather.description not in ("날씨 영향 미미", "돔 구장 — 날씨 영향 없음"):
        key_factors.append(f"날씨: {weather.description}")

    return PredictionInGame(
        home_win_prob=pred.home_win_prob,
        away_win_prob=pred.away_win_prob,
        key_factors=key_factors[:5],
        park=park_schema,
        weather=weather_schema,
    )
