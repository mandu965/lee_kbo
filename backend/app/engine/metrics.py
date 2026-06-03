"""예측 성과 지표 계산 (순수 함수)."""

import math


def brier_score(home_win_prob: float, home_won: bool) -> float:
    """단일 경기 Brier Score = (예측확률 - 실제결과)^2.

    home_won=True → outcome 1, False → 0. 낮을수록 정확.
    """
    outcome = 1.0 if home_won else 0.0
    return round((home_win_prob - outcome) ** 2, 6)


def log_loss(home_win_prob: float, home_won: bool, eps: float = 1e-15) -> float:
    """단일 경기 Log Loss. 과도하게 확신한 오답에 큰 패널티."""
    p = min(1 - eps, max(eps, home_win_prob))
    outcome = 1.0 if home_won else 0.0
    return round(-(outcome * math.log(p) + (1 - outcome) * math.log(1 - p)), 6)
