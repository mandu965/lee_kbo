"""
최근 흐름 계산

최근 N 경기 승률(70%) + 평균 득실차(30%) 복합 지표
"""

import math
from dataclasses import dataclass
from typing import Sequence


@dataclass
class GameResult:
    """DB Game 모델에서 변환해 사용하는 경량 데이터 클래스."""
    team_won: bool
    score_diff: int   # 해당 팀 기준 득점 - 실점 (양수 = 이김)


def calc_recent_form(results: Sequence[GameResult], last_n: int = 10) -> float:
    """
    최근 N 경기 복합 흐름 점수 (0~1).

    Args:
        results: 최신순으로 정렬된 경기 결과 리스트
        last_n:  대상 경기 수 (기본 10)

    Returns:
        0.0(최악) ~ 1.0(최고) 범위의 흐름 점수
    """
    sample = list(results)[:last_n]
    if not sample:
        return 0.5  # 데이터 없음 → 중립

    win_rate = sum(1 for g in sample if g.team_won) / len(sample)

    avg_diff = sum(g.score_diff for g in sample) / len(sample)
    # 득실차를 -10~+10 구간에서 0~1 로 정규화 (시그모이드 유사)
    norm_diff = 1.0 / (1.0 + math.exp(-avg_diff / 3.0))

    return round(win_rate * 0.7 + norm_diff * 0.3, 4)


def form_to_string(results: Sequence[GameResult], last_n: int = 5) -> str:
    """
    최근 N 경기를 'WWLWL' 문자열로 반환 (오른쪽이 최신).

    예: 최근 5경기 결과 → 'LWWWL'
    """
    sample = list(reversed(list(results)[:last_n]))  # 오래된 순으로 뒤집기
    return "".join("W" if g.team_won else "L" for g in sample)


def pitcher_score(era: float | None, whip: float | None, recent_avg: float = 0.5) -> float:
    """
    선발 투수 보정 점수 (높을수록 좋은 투수).

    공식: (1/ERA)*0.5 + (1/WHIP)*0.3 + recent_5_avg*0.2
    ERA/WHIP 이 0 이거나 None 이면 리그 평균으로 대체.
    """
    ERA_LEAGUE_AVG = 4.50
    WHIP_LEAGUE_AVG = 1.40

    safe_era = era if (era and era > 0) else ERA_LEAGUE_AVG
    safe_whip = whip if (whip and whip > 0) else WHIP_LEAGUE_AVG

    score = (1.0 / safe_era) * 0.5 + (1.0 / safe_whip) * 0.3 + recent_avg * 0.2
    return round(score, 6)


def pitcher_adjustment(home_score: float, away_score: float) -> float:
    """
    홈/원정 투수 점수 차를 -0.15 ~ +0.15 범위 보정값으로 변환.
    양수 → 홈팀 유리, 음수 → 원정팀 유리.
    """
    raw = home_score - away_score
    # 시그모이드로 범위 제한
    bounded = 0.3 / (1.0 + math.exp(-raw * 10)) - 0.15
    return round(bounded, 4)
