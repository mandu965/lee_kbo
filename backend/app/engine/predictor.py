"""
복합 예측 모델 v2

가중치:
  ELO 기대 승률       40%
  선발 투수 보정      28%
  최근 10경기 흐름    14%
  홈 이점 보정         8%
  파크팩터             5%
  날씨 보정            3%
  불펜 소진도          2%
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.bullpen import BullpenStatus, bullpen_adjustment, calc_bullpen_fatigue
from app.engine.elo import expected_win_prob
from app.engine.form_calculator import (
    GameResult,
    calc_recent_form,
    form_to_string,
    pitcher_adjustment,
    pitcher_score,
)
from app.engine.park_factor import ParkInfo, get_park_info, park_adjustment
from app.engine.weather_adjuster import WeatherEffect, calc_weather_effect, weather_home_adjustment
from app.models import Game, PitcherStat, Player, Prediction, PredictionRun, Team

WEIGHTS = {
    "elo":      0.40,
    "pitcher":  0.28,
    "form":     0.14,
    "home_adv": 0.08,
    "park":     0.05,
    "weather":  0.03,
    "bullpen":  0.02,
}

HOME_ADVANTAGE = 0.03


@dataclass
class PredictionResult:
    game_id: int
    home_win_prob: float
    away_win_prob: float
    predicted_winner_id: int
    # 기본 지표
    elo_diff: float
    pitcher_score_home: float
    pitcher_score_away: float
    recent_form_home: float
    recent_form_away: float
    # 고도화 지표
    park_info: ParkInfo | None = None
    weather_effect: WeatherEffect | None = None
    bullpen_home: BullpenStatus | None = None
    bullpen_away: BullpenStatus | None = None
    key_factors: list[str] = field(default_factory=list)
    model_version: str = "v2.0"


# ── DB 헬퍼 ──────────────────────────────────────────────────

async def _get_recent_results(
    session: AsyncSession, team_id: int, before_date: date, n: int = 10
) -> list[GameResult]:
    stmt = (
        select(Game)
        .where(
            Game.status == "final",
            Game.game_date < before_date,
            (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
        )
        .order_by(desc(Game.game_date))
        .limit(n)
    )
    rows = (await session.execute(stmt)).scalars().all()
    results: list[GameResult] = []
    for g in rows:
        if g.home_score is None or g.away_score is None:
            continue
        is_home = g.home_team_id == team_id
        my = g.home_score if is_home else g.away_score
        opp = g.away_score if is_home else g.home_score
        results.append(GameResult(team_won=my > opp, score_diff=my - opp))
    return results


async def _get_starter_era_whip(
    session: AsyncSession, player_id: Optional[int], season: int
) -> tuple[Optional[float], Optional[float]]:
    if player_id is None:
        return None, None
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
    if stat is None:
        return None, None
    return stat.era, stat.whip


def _build_key_factors(
    home_team: Team,
    away_team: Team,
    elo_diff: float,
    ps_home: float,
    ps_away: float,
    form_home: float,
    form_away: float,
    home_form_str: str,
    away_form_str: str,
    park: ParkInfo | None,
    weather: WeatherEffect | None,
    bp_home: BullpenStatus | None,
    bp_away: BullpenStatus | None,
) -> list[str]:
    factors: list[str] = []

    hn = home_team.short_name or home_team.name
    an = away_team.short_name or away_team.name

    # ELO
    if abs(elo_diff) >= 15:
        factors.append(f"ELO 레이팅 {elo_diff:+.0f} ({'홈' if elo_diff > 0 else '원정'} 우위)")

    # 투수
    if abs(ps_home - ps_away) > 0.001:
        better = hn if ps_home > ps_away else an
        factors.append(f"선발 투수 지표 {better} 우위 ({ps_home:.3f} vs {ps_away:.3f})")

    # 최근 흐름
    hw = home_form_str.count("W")
    aw = away_form_str.count("W")
    factors.append(f"최근 5경기 {hn} {hw}승 / {an} {aw}승")

    # 파크팩터
    if park and park.factor != 1.0:
        tag = "타자 친화" if park.factor > 1.0 else "투수 친화"
        factors.append(f"구장({park.stadium}) — {tag} ({park.factor:.2f})")

    # 날씨
    if weather and weather.description not in ("날씨 영향 미미", "돔 구장 — 날씨 영향 없음"):
        prefix = "⚠️ " if weather.rain_risk else ""
        factors.append(f"{prefix}날씨: {weather.description}")

    # 불펜
    for team_name, bp, side in [(hn, bp_home, "홈"), (an, bp_away, "원정")]:
        if bp and bp.level in ("경고", "소진"):
            factors.append(f"{team_name} 불펜 {bp.level} ({bp.recent_innings}이닝/3일)")

    return factors[:5]


# ── 메인 예측 함수 ────────────────────────────────────────────

async def predict_game(session: AsyncSession, game_id: int) -> Optional[PredictionResult]:
    game: Optional[Game] = await session.get(Game, game_id)
    if game is None:
        return None

    home_team: Optional[Team] = await session.get(Team, game.home_team_id)
    away_team: Optional[Team] = await session.get(Team, game.away_team_id)
    if home_team is None or away_team is None:
        return None

    season = game.game_date.year

    # ── 1. ELO ───────────────────────────────────────────────
    elo_home_win = expected_win_prob(home_team.elo_rating, away_team.elo_rating)
    elo_diff = round(home_team.elo_rating - away_team.elo_rating, 2)

    # ── 2. 선발 투수 ──────────────────────────────────────────
    era_h, whip_h = await _get_starter_era_whip(session, game.home_starter_id, season)
    era_a, whip_a = await _get_starter_era_whip(session, game.away_starter_id, season)
    ps_home = pitcher_score(era_h, whip_h)
    ps_away = pitcher_score(era_a, whip_a)
    adj_pitcher = pitcher_adjustment(ps_home, ps_away)

    # ── 3. 최근 흐름 ──────────────────────────────────────────
    home_results = await _get_recent_results(session, home_team.id, game.game_date)
    away_results = await _get_recent_results(session, away_team.id, game.game_date)
    form_home = calc_recent_form(home_results)
    form_away = calc_recent_form(away_results)
    adj_form = (form_home - form_away) * 0.3

    # ── 4. 홈 이점 ────────────────────────────────────────────
    adj_home = HOME_ADVANTAGE

    # ── 5. 파크팩터 ───────────────────────────────────────────
    park = get_park_info(game.stadium)
    adj_park = park_adjustment(game.stadium)

    # ── 6. 날씨 ──────────────────────────────────────────────
    weather = calc_weather_effect(game.weather_temp, game.weather_cond, game.stadium)
    era_home_safe = era_h or 4.5
    era_away_safe = era_a or 4.5
    adj_weather = weather_home_adjustment(weather, era_home_safe, era_away_safe)

    # ── 7. 불펜 소진도 ────────────────────────────────────────
    bp_home = await calc_bullpen_fatigue(session, home_team.id, game.game_date)
    bp_away = await calc_bullpen_fatigue(session, away_team.id, game.game_date)
    adj_bullpen = bullpen_adjustment(bp_home.fatigue_score, bp_away.fatigue_score)

    # ── 8. 가중 합산 ──────────────────────────────────────────
    raw_prob = (
        WEIGHTS["elo"]      * elo_home_win
        + WEIGHTS["pitcher"]  * (0.5 + adj_pitcher)
        + WEIGHTS["form"]     * (0.5 + adj_form)
        + WEIGHTS["home_adv"] * (0.5 + adj_home)
        + WEIGHTS["park"]     * (0.5 + adj_park)
        + WEIGHTS["weather"]  * (0.5 + adj_weather)
        + WEIGHTS["bullpen"]  * (0.5 + adj_bullpen)
    )
    home_prob = round(max(0.05, min(0.95, raw_prob)), 4)
    away_prob = round(1.0 - home_prob, 4)
    predicted_winner_id = home_team.id if home_prob >= 0.5 else away_team.id

    home_form_str = form_to_string(home_results, 5)
    away_form_str = form_to_string(away_results, 5)

    key_factors = _build_key_factors(
        home_team, away_team,
        elo_diff, ps_home, ps_away,
        form_home, form_away,
        home_form_str, away_form_str,
        park, weather, bp_home, bp_away,
    )

    return PredictionResult(
        game_id=game_id,
        home_win_prob=home_prob,
        away_win_prob=away_prob,
        predicted_winner_id=predicted_winner_id,
        elo_diff=elo_diff,
        pitcher_score_home=round(ps_home, 4),
        pitcher_score_away=round(ps_away, 4),
        recent_form_home=form_home,
        recent_form_away=form_away,
        park_info=park,
        weather_effect=weather,
        bullpen_home=bp_home,
        bullpen_away=bp_away,
        key_factors=key_factors,
    )


async def save_prediction(
    session: AsyncSession,
    result: PredictionResult,
    prediction_type: str = "final",
) -> Prediction:
    """predictions(최신 캐시) 업서트 + prediction_runs(불변 스냅샷) 삽입."""
    from datetime import datetime as dt

    # ── 1. predictions 캐시 업서트 ──────────────────────────────
    existing = (
        await session.execute(
            select(Prediction).where(Prediction.game_id == result.game_id)
        )
    ).scalar_one_or_none()

    pred = existing or Prediction(game_id=result.game_id)
    if not existing:
        session.add(pred)

    pred.home_win_prob = result.home_win_prob
    pred.away_win_prob = result.away_win_prob
    pred.predicted_winner_id = result.predicted_winner_id
    pred.elo_diff = result.elo_diff
    pred.pitcher_score_home = result.pitcher_score_home
    pred.pitcher_score_away = result.pitcher_score_away
    pred.recent_form_home = result.recent_form_home
    pred.recent_form_away = result.recent_form_away
    pred.model_version = result.model_version

    # ── 2. prediction_runs 스냅샷 삽입 (불변) ────────────────────
    feature_snapshot = {
        "elo_diff": result.elo_diff,
        "pitcher_score_home": result.pitcher_score_home,
        "pitcher_score_away": result.pitcher_score_away,
        "recent_form_home": result.recent_form_home,
        "recent_form_away": result.recent_form_away,
        "park": {"stadium": result.park_info.stadium, "factor": result.park_info.factor}
            if result.park_info else None,
        "weather": {"temp": result.weather_effect.temperature, "desc": result.weather_effect.description}
            if result.weather_effect else None,
    }
    run = PredictionRun(
        game_id=result.game_id,
        prediction_type=prediction_type,
        model_version=result.model_version,
        generated_at=dt.utcnow(),
        published_at=dt.utcnow(),
        is_published=True,
        home_win_prob=result.home_win_prob,
        away_win_prob=result.away_win_prob,
        predicted_winner_id=result.predicted_winner_id,
        feature_snapshot=feature_snapshot,
        key_factors=result.key_factors,
    )
    session.add(run)

    return pred


async def predict_today(session: AsyncSession) -> list[PredictionResult]:
    from datetime import date as date_cls
    today = date_cls.today()
    stmt = select(Game).where(Game.game_date == today, Game.status == "scheduled")
    games = (await session.execute(stmt)).scalars().all()

    results: list[PredictionResult] = []
    for game in games:
        result = await predict_game(session, game.id)
        if result:
            await save_prediction(session, result)
            results.append(result)

    await session.commit()
    return results
