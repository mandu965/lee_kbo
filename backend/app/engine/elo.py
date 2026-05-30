"""
ELO 레이팅 시스템

- 초기 레이팅: 1500
- K 팩터: 시즌 초반(4월) 32, 이후 20
- 시즌 리셋: 전 시즌 ELO 와 1500 의 중간값으로 회귀 (평균 회귀)
"""

from datetime import date


# K 팩터: 시즌 초반에 높게 설정해 빠른 수렴 유도
def get_k_factor(game_date: date) -> float:
    return 32.0 if game_date.month <= 4 else 20.0


def expected_win_prob(rating_a: float, rating_b: float) -> float:
    """팀 A 의 기대 승률 (0~1)."""
    return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / 400.0))


def update_elo(
    winner_rating: float,
    loser_rating: float,
    game_date: date,
) -> tuple[float, float]:
    """
    경기 결과 반영 후 (새 승자 ELO, 새 패자 ELO) 반환.

    Returns:
        (new_winner_rating, new_loser_rating)
    """
    k = get_k_factor(game_date)
    expected = expected_win_prob(winner_rating, loser_rating)
    new_winner = winner_rating + k * (1.0 - expected)
    new_loser = loser_rating + k * (0.0 - (1.0 - expected))
    return round(new_winner, 4), round(new_loser, 4)


def season_reset(prev_elo: float, base: float = 1500.0, reversion: float = 0.33) -> float:
    """
    시즌 오프시즌 평균 회귀.
    전 시즌 ELO 를 기준값(1500) 방향으로 33% 당깁니다.
    """
    return round(prev_elo + reversion * (base - prev_elo), 4)
