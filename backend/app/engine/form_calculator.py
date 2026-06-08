"""Recent form and starter-quality scoring helpers."""

import math
from dataclasses import dataclass
from typing import Sequence


@dataclass
class GameResult:
    """Lightweight team result used for recent-form scoring."""

    team_won: bool
    score_diff: int


def calc_recent_form(results: Sequence[GameResult], last_n: int = 10) -> float:
    """Return a 0..1 recent-form score from win rate and run differential."""
    sample = list(results)[:last_n]
    if not sample:
        return 0.5

    win_rate = sum(1 for game in sample if game.team_won) / len(sample)
    avg_diff = sum(game.score_diff for game in sample) / len(sample)
    norm_diff = 1.0 / (1.0 + math.exp(-avg_diff / 3.0))

    return round(win_rate * 0.7 + norm_diff * 0.3, 4)


def form_to_string(results: Sequence[GameResult], last_n: int = 5) -> str:
    """Return recent results as a compact string such as WWLWL."""
    sample = list(reversed(list(results)[:last_n]))
    return "".join("W" if game.team_won else "L" for game in sample)


def _higher_is_better(value: float | None, midpoint: float, scale: float, default: float = 0.5) -> float:
    if value is None:
        return default
    return 1.0 / (1.0 + math.exp(-(value - midpoint) / scale))


def _lower_is_better(value: float | None, midpoint: float, scale: float, default: float = 0.5) -> float:
    if value is None:
        return default
    return 1.0 / (1.0 + math.exp((value - midpoint) / scale))


def pitcher_score(
    era: float | None,
    whip: float | None,
    recent_avg: float = 0.5,
    avg_innings: float | None = None,
    k_bb_ratio: float | None = None,
    bb_per_9: float | None = None,
    hr_per_9: float | None = None,
) -> float:
    """Return starter score. Extra metrics are accepted for experiments.

    Backtesting showed the first expanded formulas underperformed the existing
    ERA/WHIP/recent-form score, so the production score remains conservative
    while callers can still collect the extra starter metrics in snapshots.
    """
    era_avg = 4.50
    whip_avg = 1.40
    safe_era = era if era and era > 0 else era_avg
    safe_whip = whip if whip and whip > 0 else whip_avg

    score = (1.0 / safe_era) * 0.5 + (1.0 / safe_whip) * 0.3 + recent_avg * 0.2
    return round(score, 6)


def pitcher_adjustment(home_score: float, away_score: float) -> float:
    """Convert starter-score difference into a bounded win-probability adjustment."""
    raw = home_score - away_score
    bounded = 0.3 / (1.0 + math.exp(-raw * 10)) - 0.15
    return round(bounded, 4)
