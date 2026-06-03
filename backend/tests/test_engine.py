"""예측 엔진 순수 로직 테스트 — DB 불필요."""

from datetime import date

import pytest

from app.engine.elo import (
    expected_win_prob,
    get_k_factor,
    season_reset,
    update_elo,
)
from app.engine.form_calculator import pitcher_score, pitcher_adjustment
from app.engine.weather_adjuster import calc_weather_effect, weather_home_adjustment
from app.engine.metrics import brier_score, log_loss


# ── ELO ──────────────────────────────────────────────────────

def test_expected_win_prob_equal_ratings_is_half():
    assert expected_win_prob(1500, 1500) == pytest.approx(0.5)


def test_expected_win_prob_higher_rating_favored():
    assert expected_win_prob(1600, 1400) > 0.5
    assert expected_win_prob(1400, 1600) < 0.5


def test_expected_win_prob_symmetry():
    # 두 팀 기대승률 합은 1
    a = expected_win_prob(1550, 1480)
    b = expected_win_prob(1480, 1550)
    assert a + b == pytest.approx(1.0)


def test_k_factor_higher_early_season():
    assert get_k_factor(date(2026, 4, 15)) == 32.0
    assert get_k_factor(date(2026, 7, 15)) == 20.0


def test_update_elo_zero_sum():
    """승자 상승분 == 패자 하락분 (제로섬)."""
    nw, nl = update_elo(1500, 1500, date(2026, 5, 1))
    assert nw > 1500 and nl < 1500
    assert (nw - 1500) == pytest.approx(1500 - nl, abs=1e-3)


def test_update_elo_upset_bigger_swing():
    """약팀이 강팀을 이기면 변동폭이 더 크다."""
    # 약팀(1400)이 강팀(1600) 격파
    up_w, up_l = update_elo(1400, 1600, date(2026, 5, 1))
    # 강팀(1600)이 약팀(1400) 격파 (예상된 결과)
    ex_w, ex_l = update_elo(1600, 1400, date(2026, 5, 1))
    assert (up_w - 1400) > (ex_w - 1600)


def test_season_reset_regresses_to_mean():
    # 1600 → 1500 방향으로 33% 회귀
    assert season_reset(1600) == pytest.approx(1600 + 0.33 * (1500 - 1600))
    # 평균(1500)은 변하지 않음
    assert season_reset(1500) == pytest.approx(1500)


# ── 투수 점수 ─────────────────────────────────────────────────

def test_pitcher_score_better_era_higher():
    """ERA 낮을수록 점수 높음."""
    assert pitcher_score(2.0, 1.0) > pitcher_score(5.0, 1.5)


def test_pitcher_score_none_uses_league_avg():
    """None은 리그 평균으로 대체되어 발산하지 않음."""
    s = pitcher_score(None, None)
    assert 0 < s < 1


def test_pitcher_score_zero_era_no_division_error():
    """ERA 0.0이어도 division 에러 없이 리그평균 처리."""
    s = pitcher_score(0.0, 0.0)
    assert s > 0


def test_pitcher_adjustment_bounded():
    """투수 보정값은 ±0.15 범위."""
    assert -0.15 <= pitcher_adjustment(1.0, 0.0) <= 0.15
    assert -0.15 <= pitcher_adjustment(0.0, 1.0) <= 0.15


def test_pitcher_adjustment_sign():
    """홈 투수가 더 좋으면 양수."""
    assert pitcher_adjustment(0.5, 0.3) > 0
    assert pitcher_adjustment(0.3, 0.5) < 0


# ── 날씨 보정 ─────────────────────────────────────────────────

def test_weather_dome_no_effect():
    """돔 구장(고척)은 날씨 영향 없음."""
    eff = calc_weather_effect(35.0, "맑음", "고척스카이돔")
    assert eff.offense_adj == 0.0


def test_weather_offense_positive_returns_neutral_home_adj():
    """득점 유리 날씨(offense_adj>=0)는 홈 보정 중립."""
    eff = calc_weather_effect(32.0, "맑음", "잠실야구장")
    # 고온 → 타자 유리(offense_adj >= 0) → 홈 투수 보정 0
    assert weather_home_adjustment(eff, 3.0, 4.5) == 0.0


def test_weather_home_adjustment_bounded():
    """날씨 홈 보정은 ±0.03 범위."""
    eff = calc_weather_effect(5.0, "흐림", "잠실야구장")  # 저온 → 투수 유리
    adj = weather_home_adjustment(eff, 2.0, 5.0)
    assert -0.03 <= adj <= 0.03


# ── 성과 지표 ─────────────────────────────────────────────────

def test_brier_perfect_prediction_is_zero():
    """100% 예측이 적중하면 Brier 0."""
    assert brier_score(1.0, home_won=True) == 0.0
    assert brier_score(0.0, home_won=False) == 0.0


def test_brier_worst_prediction_is_one():
    """100% 확신했는데 빗나가면 Brier 1."""
    assert brier_score(1.0, home_won=False) == 1.0


def test_brier_coin_flip():
    """50% 예측은 결과와 무관하게 0.25."""
    assert brier_score(0.5, home_won=True) == 0.25
    assert brier_score(0.5, home_won=False) == 0.25


def test_log_loss_penalizes_confident_wrong():
    """확신한 오답의 Log Loss가 애매한 오답보다 크다."""
    confident_wrong = log_loss(0.95, home_won=False)
    unsure_wrong = log_loss(0.55, home_won=False)
    assert confident_wrong > unsure_wrong
