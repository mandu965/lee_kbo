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

import hashlib
import json
import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.bullpen import BullpenStatus, bullpen_adjustment, calc_bullpen_fatigue
from app.engine.elo import expected_win_prob
from app.engine.lineup import LineupStrength, calc_lineup_strength, lineup_adjustment
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
from app.time_utils import today_kst, now_kst

WEIGHTS = {
    "elo":      0.38,
    "pitcher":  0.27,
    "form":     0.13,
    "home_adv": 0.08,
    "park":     0.04,
    "weather":  0.03,
    "bullpen":  0.02,
    "h2h":      0.05,
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
    starter_metrics_home: dict = field(default_factory=dict)
    starter_metrics_away: dict = field(default_factory=dict)
    # 고도화 지표
    park_info: ParkInfo | None = None
    weather_effect: WeatherEffect | None = None
    bullpen_home: BullpenStatus | None = None
    bullpen_away: BullpenStatus | None = None
    lineup_home: LineupStrength | None = None
    lineup_away: LineupStrength | None = None
    key_factors: list[str] = field(default_factory=list)
    data_completeness: float = 0.0
    missing_features: list[str] = field(default_factory=list)
    factor_contributions: list[dict] = field(default_factory=list)
    # 예측 신뢰도: 0~1 (지표들이 같은 방향을 가리키는 비율)
    confidence: float = 0.0
    # 신뢰도 레벨: "높음" / "보통" / "낮음"
    confidence_level: str = "보통"
    # 각 지표 방향 일치 여부 (home 우세 기준 True/False/None)
    indicator_votes: dict = field(default_factory=dict)
    model_version: str = "v2.4-starter-metrics"


@dataclass
class StarterMetricBundle:
    era: float | None = None
    whip: float | None = None
    avg_innings: float | None = None
    k_bb_ratio: float | None = None
    bb_per_9: float | None = None
    hr_per_9: float | None = None

    def as_dict(self) -> dict:
        return {
            "era": self.era,
            "whip": self.whip,
            "avg_innings": self.avg_innings,
            "k_bb_ratio": self.k_bb_ratio,
            "bb_per_9": self.bb_per_9,
            "hr_per_9": self.hr_per_9,
        }


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
                PitcherStat.game_id.is_(None),
                PitcherStat.is_starter == True,
            )
            .order_by(desc(PitcherStat.id))
            .limit(1)
        )
    ).scalar_one_or_none()
    if stat is None:
        return None, None
    return stat.era, stat.whip


async def _get_starter_metric_bundle(
    session: AsyncSession, player_id: Optional[int], season: int
) -> StarterMetricBundle:
    if player_id is None:
        return StarterMetricBundle()

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
    if stat is None:
        return StarterMetricBundle()

    innings = stat.innings_pitched or 0.0
    walks = stat.walks or 0
    strikeouts = stat.strikeouts or 0
    home_runs = stat.home_runs_allowed or 0
    games = stat.games or 0

    return StarterMetricBundle(
        era=stat.era,
        whip=stat.whip,
        avg_innings=round(innings / games, 3) if games > 0 and innings > 0 else None,
        k_bb_ratio=round(strikeouts / walks, 3) if walks > 0 else (float(strikeouts) if strikeouts > 0 else None),
        bb_per_9=round((walks / innings) * 9, 3) if innings > 0 else None,
        hr_per_9=round((home_runs / innings) * 9, 3) if innings > 0 else None,
    )


async def _has_bullpen_game_logs(
    session: AsyncSession, before_date: date, team_ids: list[int], days: int = 3
) -> bool:
    """최근 불펜 계산 구간에 양 팀의 경기별 투수 로그가 있는지 확인."""
    from app.models import PitcherStat as PS
    count = await session.scalar(
        select(func.count(func.distinct(Player.team_id)))
        .select_from(PS)
        .join(Game, PS.game_id == Game.id)
        .join(Player, PS.player_id == Player.id)
        .where(
            PS.game_id.is_not(None),
            PS.is_starter == False,
            Player.team_id.in_(team_ids),
            Game.game_date >= before_date - timedelta(days=days),
            Game.game_date < before_date,
            Game.status == "final",
        )
    )
    return count == len(set(team_ids))


async def _get_starter_recent_avg(
    session: AsyncSession, player_id: Optional[int], season: int, before_date: date
) -> float:
    """선발 최근 5경기 ERA → 0~1 정규화 점수 (높을수록 좋음).
    ERA 4.5(리그 평균) → 0.5, 낮을수록 1에 가까움."""
    if player_id is None:
        return 0.5
    stats = (
        await session.execute(
            select(PitcherStat)
            .join(Game, PitcherStat.game_id == Game.id)
            .where(
                PitcherStat.player_id == player_id,
                PitcherStat.season == season,
                PitcherStat.game_id.is_not(None),
                PitcherStat.is_starter == True,
                Game.game_date < before_date,
                Game.status == "final",
            )
            .order_by(desc(Game.game_date))
            .limit(5)
        )
    ).scalars().all()
    if not stats:
        return 0.5
    total_ip = sum(s.innings_pitched or 0.0 for s in stats)
    total_er = sum(s.earned_runs or 0 for s in stats)
    if total_ip <= 0:
        return 0.5
    recent_era = (total_er / total_ip) * 9
    return round(1.0 / (1.0 + math.exp((recent_era - 4.5) / 1.5)), 4)


async def _get_h2h_record(
    session: AsyncSession, home_team_id: int, away_team_id: int,
    before_date: date, n: int = 20,
) -> tuple[float, int]:
    """최근 N경기 상대전적 — (오늘 홈팀 기준 승률 0~1, 유효 경기 수)."""
    stmt = (
        select(Game)
        .where(
            Game.status == "final",
            Game.game_date < before_date,
            Game.home_score.is_not(None),
            Game.away_score.is_not(None),
            (
                (Game.home_team_id == home_team_id) & (Game.away_team_id == away_team_id)
            ) | (
                (Game.home_team_id == away_team_id) & (Game.away_team_id == home_team_id)
            ),
        )
        .order_by(desc(Game.game_date))
        .limit(n)
    )
    games = (await session.execute(stmt)).scalars().all()
    wins, total = 0, 0
    for g in games:
        if g.home_score == g.away_score:
            continue
        total += 1
        if g.home_team_id == home_team_id and g.home_score > g.away_score:
            wins += 1
        elif g.away_team_id == home_team_id and g.away_score > g.home_score:
            wins += 1
    if total < 5:
        return 0.5, total
    return round(wins / total, 4), total


def _factor_contribution(key: str, label: str, value: float, available: bool = True) -> dict:
    return {
        "key": key,
        "label": label,
        "contribution_pp": round(value * 100, 2),
        "available": available,
    }


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
    lineup_home: LineupStrength | None,
    lineup_away: LineupStrength | None,
    h2h_win_rate: float = 0.5,
    h2h_count: int = 0,
) -> list[str]:
    factors: list[str] = []

    hn = home_team.short_name or home_team.name
    an = away_team.short_name or away_team.name

    # ELO
    if abs(elo_diff) >= 15:
        factors.append(f"ELO 레이팅 {elo_diff:+.0f} ({'홈' if elo_diff > 0 else '원정'} 우위)")

    # 투수 — 우위 팀의 (더 높은) 점수를 먼저 표기해 이름·숫자 순서를 일치시킴
    if abs(ps_home - ps_away) > 0.001:
        home_better = ps_home > ps_away
        better = hn if home_better else an
        better_val, worse_val = (ps_home, ps_away) if home_better else (ps_away, ps_home)
        factors.append(f"선발 투수 지표 {better} 우위 ({better_val:.3f} vs {worse_val:.3f})")

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

    # 확정 타순
    if (
        lineup_home and lineup_away
        and lineup_home.available and lineup_away.available
        and lineup_home.strength_ratio is not None and lineup_away.strength_ratio is not None
    ):
        home_better = lineup_home.strength_ratio > lineup_away.strength_ratio
        better = hn if home_better else an
        better_ratio, worse_ratio = (
            (lineup_home.strength_ratio, lineup_away.strength_ratio)
            if home_better
            else (lineup_away.strength_ratio, lineup_home.strength_ratio)
        )
        factors.append(
            f"확정 타순 강도 {better} 우위 "
            f"({better_ratio:.3f} vs {worse_ratio:.3f})"
        )

    # 상대전적
    if h2h_count >= 5 and abs(h2h_win_rate - 0.5) >= 0.1:
        dominant = hn if h2h_win_rate >= 0.5 else an
        pct = round(max(h2h_win_rate, 1 - h2h_win_rate) * 100)
        factors.append(f"상대전적 {dominant} 우세 ({pct}%, 최근 {h2h_count}경기)")

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

    # ── 1. ELO (홈/원정 분리 ELO 우선, 없으면 통합 ELO) ──────
    home_elo_val = getattr(home_team, "home_elo", None) or home_team.elo_rating
    away_elo_val = getattr(away_team, "away_elo", None) or away_team.elo_rating
    elo_home_win = expected_win_prob(home_elo_val, away_elo_val)
    elo_diff = round(home_elo_val - away_elo_val, 2)

    # ── 2. 선발 투수 ──────────────────────────────────────────
    starter_metrics_h = await _get_starter_metric_bundle(session, game.home_starter_id, season)
    starter_metrics_a = await _get_starter_metric_bundle(session, game.away_starter_id, season)
    era_h, whip_h = starter_metrics_h.era, starter_metrics_h.whip
    era_a, whip_a = starter_metrics_a.era, starter_metrics_a.whip
    recent_avg_h = await _get_starter_recent_avg(session, game.home_starter_id, season, game.game_date)
    recent_avg_a = await _get_starter_recent_avg(session, game.away_starter_id, season, game.game_date)
    ps_home = pitcher_score(
        era_h,
        whip_h,
        recent_avg_h,
        starter_metrics_h.avg_innings,
        starter_metrics_h.k_bb_ratio,
        starter_metrics_h.bb_per_9,
        starter_metrics_h.hr_per_9,
    )
    ps_away = pitcher_score(
        era_a,
        whip_a,
        recent_avg_a,
        starter_metrics_a.avg_innings,
        starter_metrics_a.k_bb_ratio,
        starter_metrics_a.bb_per_9,
        starter_metrics_a.hr_per_9,
    )
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
    # 예비 추정치 — 2~3시즌 검증 후 재활성화 예정
    # 화면 참고 지표로만 표시하고 예측 승률에는 반영하지 않음
    park = get_park_info(game.stadium)
    adj_park = 0.0  # park_adjustment(game.stadium) — 비활성

    # ── 6. 날씨 ──────────────────────────────────────────────
    weather = calc_weather_effect(game.weather_temp, game.weather_cond, game.stadium)
    # ERA 0.00(무실점)은 유효값이므로 None일 때만 리그 평균(4.5)으로 폴백
    era_home_safe = era_h if era_h is not None else 4.5
    era_away_safe = era_a if era_a is not None else 4.5
    adj_weather = weather_home_adjustment(weather, era_home_safe, era_away_safe)

    # ── 7. 불펜 소진도 ────────────────────────────────────────
    bullpen_available = await _has_bullpen_game_logs(
        session, game.game_date, [home_team.id, away_team.id]
    )
    if bullpen_available:
        bp_home = await calc_bullpen_fatigue(session, home_team.id, game.game_date)
        bp_away = await calc_bullpen_fatigue(session, away_team.id, game.game_date)
        adj_bullpen = bullpen_adjustment(bp_home.fatigue_score, bp_away.fatigue_score)
    else:
        bp_home = bp_away = None
        adj_bullpen = 0.0

    # ── 8. 확정 타순 강도 ─────────────────────────────────────
    lineup_home = await calc_lineup_strength(session, game.id, home_team.id, season)
    lineup_away = await calc_lineup_strength(session, game.id, away_team.id, season)
    lineup_available = lineup_home.available and lineup_away.available
    adj_lineup = lineup_adjustment(lineup_home, lineup_away)

    # ── 9. 상대전적 ───────────────────────────────────────────
    h2h_win_rate, h2h_count = await _get_h2h_record(
        session, home_team.id, away_team.id, game.game_date
    )
    h2h_available = h2h_count >= 5

    # ── 10. 가중 합산 ─────────────────────────────────────────
    raw_prob = (
        WEIGHTS["elo"]      * elo_home_win
        + WEIGHTS["pitcher"]  * (0.5 + adj_pitcher)
        + WEIGHTS["form"]     * (0.5 + adj_form)
        + WEIGHTS["home_adv"] * (0.5 + adj_home)
        + WEIGHTS["park"]     * 0.5   # 파크팩터 비활성 — 항상 중립(0.5)
        + WEIGHTS["weather"]  * (0.5 + adj_weather)
        + WEIGHTS["bullpen"]  * (0.5 + adj_bullpen)
        + WEIGHTS["h2h"]      * h2h_win_rate
        + adj_lineup
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
        park, weather, bp_home, bp_away, lineup_home, lineup_away,
        h2h_win_rate, h2h_count,
    )

    starter_available = all([
        game.home_starter_id, game.away_starter_id,
        era_h, whip_h, era_a, whip_a,
    ])
    recent_form_available = len(home_results) >= 5 and len(away_results) >= 5
    weather_available = game.weather_temp is not None or game.weather_cond is not None

    missing_features: list[str] = []
    completeness = 20.0  # ELO + 홈 이점
    if starter_available:
        completeness += 25.0
    else:
        missing_features.append("선발 투수 세부 기록")
    if recent_form_available:
        completeness += 15.0
    else:
        missing_features.append("최근 팀 경기 표본")
    if weather_available:
        completeness += 10.0
    else:
        missing_features.append("경기 날씨")
    if bullpen_available:
        completeness += 15.0
    else:
        missing_features.append("투수 경기별 로그 기반 불펜 가용성")
    completeness += 5.0  # 예비 파크팩터
    if lineup_available:
        completeness += 5.0
    else:
        missing_features.append("확정 타순 기반 라인업 강도")
    if h2h_available:
        completeness += 5.0
    else:
        missing_features.append(f"상대전적 (현재 {h2h_count}경기, 5경기 이상 필요)")

    factor_contributions = [
        _factor_contribution("elo", "ELO 전력", WEIGHTS["elo"] * (elo_home_win - 0.5)),
        _factor_contribution("starter", "선발 투수", WEIGHTS["pitcher"] * adj_pitcher, bool(starter_available)),
        _factor_contribution("form", "최근 흐름", WEIGHTS["form"] * adj_form, recent_form_available),
        _factor_contribution("home_adv", "홈 이점", WEIGHTS["home_adv"] * adj_home),
        _factor_contribution("park", "파크팩터(검증대기)", 0.0, available=False),
        _factor_contribution("weather", "날씨", WEIGHTS["weather"] * adj_weather, weather_available),
        _factor_contribution("bullpen", "불펜 가용성", WEIGHTS["bullpen"] * adj_bullpen, bullpen_available),
        _factor_contribution("lineup", "확정 타순 강도", adj_lineup, lineup_available),
        _factor_contribution("h2h", "상대전적", WEIGHTS["h2h"] * (h2h_win_rate - 0.5), h2h_available),
    ]

    # ── 9. 예측 신뢰도 계산 ───────────────────────────────────────
    # 각 지표가 홈팀 우세(True) / 원정팀 우세(False) / 중립(None) 방향 판정
    home_favored = home_prob >= 0.5
    indicator_votes: dict[str, bool | None] = {
        "ELO":   elo_diff > 0,          # 양수면 홈 우세
        "선발":   (ps_home > ps_away) if starter_available else None,
        "최근흐름": form_home > form_away,
        "홈이점": True,                 # 항상 홈 우세
        "파크":   None,  # 비활성 — 신뢰도 계산에서 제외
        "날씨":   adj_weather >= 0 if weather_available else None,
        "불펜":   adj_bullpen >= 0 if bullpen_available else None,
        "타순":   adj_lineup >= 0 if lineup_available else None,
        "상대전적": h2h_win_rate >= 0.5 if h2h_available else None,
    }
    valid_votes = {k: v for k, v in indicator_votes.items() if v is not None}
    if valid_votes:
        # 예측 방향과 일치하는 지표 비율
        matching = sum(1 for v in valid_votes.values() if v == home_favored)
        confidence = round(matching / len(valid_votes), 2)
    else:
        confidence = 0.5

    if confidence >= 0.75:
        confidence_level = "높음"
    elif confidence >= 0.5:
        confidence_level = "보통"
    else:
        confidence_level = "낮음"

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
        starter_metrics_home=starter_metrics_h.as_dict(),
        starter_metrics_away=starter_metrics_a.as_dict(),
        park_info=park,
        weather_effect=weather,
        bullpen_home=bp_home,
        bullpen_away=bp_away,
        lineup_home=lineup_home,
        lineup_away=lineup_away,
        key_factors=key_factors,
        data_completeness=round(completeness, 1),
        missing_features=missing_features,
        factor_contributions=factor_contributions,
        confidence=confidence,
        confidence_level=confidence_level,
        indicator_votes=indicator_votes,
    )


async def save_prediction(
    session: AsyncSession,
    result: PredictionResult,
    prediction_type: str | None = None,
) -> Prediction:
    """predictions(최신 캐시) 업서트 + prediction_runs(불변 스냅샷) 삽입.

    동일 입력값(input_hash) 이 직전 공개 스냅샷과 같으면 새 스냅샷을 생성하지 않는다.
    """
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
        "starter_metrics": {
            "home": result.starter_metrics_home,
            "away": result.starter_metrics_away,
        },
        "recent_form_home": result.recent_form_home,
        "recent_form_away": result.recent_form_away,
        "park": {"stadium": result.park_info.stadium, "factor": result.park_info.factor}
            if result.park_info else None,
        "weather": {"temp": result.weather_effect.temperature, "desc": result.weather_effect.description}
            if result.weather_effect else None,
        "lineup": {
            "home": {
                "weighted_ops": result.lineup_home.weighted_ops,
                "baseline_ops": result.lineup_home.baseline_ops,
                "strength_ratio": result.lineup_home.strength_ratio,
                "ops_player_count": result.lineup_home.ops_player_count,
                "excluded_regulars": [player.name for player in result.lineup_home.excluded_regulars],
                "replacements": [player.name for player in result.lineup_home.replacements],
            },
            "away": {
                "weighted_ops": result.lineup_away.weighted_ops,
                "baseline_ops": result.lineup_away.baseline_ops,
                "strength_ratio": result.lineup_away.strength_ratio,
                "ops_player_count": result.lineup_away.ops_player_count,
                "excluded_regulars": [player.name for player in result.lineup_away.excluded_regulars],
                "replacements": [player.name for player in result.lineup_away.replacements],
            },
        } if result.lineup_home and result.lineup_away else None,
        "data_completeness": result.data_completeness,
        "missing_features": result.missing_features,
    }
    is_manual = prediction_type == "manual"
    if prediction_type is None:
        if "확정 타순 기반 라인업 강도" not in result.missing_features:
            prediction_type = "lineup_confirmed"
        elif "선발 투수 세부 기록" not in result.missing_features:
            prediction_type = "starter_confirmed"
        else:
            prediction_type = "baseline"

    # 신뢰도 정보를 feature_snapshot에 포함
    feature_snapshot["confidence"] = result.confidence
    feature_snapshot["confidence_level"] = result.confidence_level
    feature_snapshot["indicator_votes"] = {
        k: v for k, v in result.indicator_votes.items() if v is not None
    }

    # ── 입력값 정규화 해시 ──────────────────────────────────────
    # 확률(소수4) + 예측승자 + 모델버전 + 타입을 정규화해 해시
    hash_payload = {
        "home": round(result.home_win_prob, 4),
        "away": round(result.away_win_prob, 4),
        "winner": result.predicted_winner_id,
        "model": result.model_version,
        "type": prediction_type,
    }
    input_hash = hashlib.sha256(
        json.dumps(hash_payload, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()

    # 직전 공개 스냅샷과 동일 입력이면 새 스냅샷 생략 (수동 실행은 항상 기록)
    if not is_manual:
        last_run = (
            await session.execute(
                select(PredictionRun)
                .where(
                    PredictionRun.game_id == result.game_id,
                    PredictionRun.is_published == True,
                )
                .order_by(desc(PredictionRun.generated_at), desc(PredictionRun.id))
                .limit(1)
            )
        ).scalar_one_or_none()
        if last_run and last_run.input_hash == input_hash:
            return pred  # 변화 없음 → 스냅샷 생략

    run = PredictionRun(
        game_id=result.game_id,
        prediction_type=prediction_type,
        model_version=result.model_version,
        generated_at=now_kst(),
        published_at=now_kst(),
        is_published=True,
        input_hash=input_hash,
        home_win_prob=result.home_win_prob,
        away_win_prob=result.away_win_prob,
        predicted_winner_id=result.predicted_winner_id,
        feature_snapshot=feature_snapshot,
        key_factors=result.key_factors,
        data_completeness=result.data_completeness,
        missing_features=result.missing_features,
        factor_contributions=result.factor_contributions,
    )
    session.add(run)

    return pred


async def predict_today(session: AsyncSession) -> list[PredictionResult]:
    today = today_kst()
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
