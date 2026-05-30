"""
날씨 변수 보정 엔진

기온·강수 조건이 경기 결과에 미치는 영향을 정량화합니다.

근거:
- 기온 낮음(< 10°C): 투수 유리 (손 감각, 타구 감소) → 득점↓
- 기온 높음(> 28°C): 타자 유리 (공 잘 날아감) → 득점↑
- 비: 우천 취소 가능성, 그라운드 컨디션 악화
- 강풍(추후): 타구 방향 변화
"""

from dataclasses import dataclass


RAIN_CONDITIONS = {"비", "소나기", "강한 비", "뇌우", "강한 뇌우", "보통 비", "가벼운 비",
                   "이슬비", "강한 이슬비", "보통 이슬비", "가벼운 이슬비"}
DOME_STADIUMS = {"고척스카이돔"}   # 돔 구장은 날씨 영향 없음


@dataclass
class WeatherEffect:
    temperature: float | None
    condition: str | None
    rain_risk: bool             # 우천 취소 가능성
    offense_adj: float          # 공격 보정 (-0.05 ~ +0.05), 양수 = 득점↑
    description: str            # 예측 근거 문장


def calc_weather_effect(
    temperature: float | None,
    condition: str | None,
    stadium: str | None,
) -> WeatherEffect:
    """
    기온·날씨 조건 → WeatherEffect 반환.

    Args:
        temperature: 기온 (°C), None이면 미수집
        condition:   WMO 날씨 코드 기반 한국어 설명
        stadium:     구장명 (돔 구장 판별용)
    """
    is_dome = any(d in (stadium or "") for d in DOME_STADIUMS)

    # 돔 구장은 날씨 영향 없음
    if is_dome:
        return WeatherEffect(
            temperature=temperature,
            condition=condition,
            rain_risk=False,
            offense_adj=0.0,
            description="돔 구장 — 날씨 영향 없음",
        )

    rain_risk = condition in RAIN_CONDITIONS if condition else False
    offense_adj = 0.0
    parts: list[str] = []

    # 기온 보정
    if temperature is not None:
        if temperature < 10:
            offense_adj -= 0.03
            parts.append(f"저온({temperature:.0f}°C) 투수 유리")
        elif temperature < 15:
            offense_adj -= 0.01
            parts.append(f"서늘({temperature:.0f}°C) 소폭 투수 유리")
        elif temperature > 30:
            offense_adj += 0.02
            parts.append(f"고온({temperature:.0f}°C) 타자 유리")
        elif temperature > 25:
            offense_adj += 0.01
            parts.append(f"더위({temperature:.0f}°C) 소폭 타자 유리")

    # 강수 보정
    if rain_risk:
        offense_adj -= 0.02
        parts.append(f"우천({condition}) 취소/지연 가능성")
    elif condition and condition not in ("맑음", "대체로 맑음", "부분적 구름"):
        parts.append(f"날씨: {condition}")

    description = " / ".join(parts) if parts else "날씨 영향 미미"

    return WeatherEffect(
        temperature=temperature,
        condition=condition,
        rain_risk=rain_risk,
        offense_adj=round(max(-0.05, min(0.05, offense_adj)), 4),
        description=description,
    )


def weather_home_adjustment(effect: WeatherEffect, home_era: float, away_era: float) -> float:
    """
    날씨 보정값을 홈/원정 투수 상대적 유불리로 변환.

    투수 친화 날씨(offense_adj < 0) 에서는 ERA 좋은 팀이 더 이득.
    결과: 홈팀 유불리 보정값 (-0.03 ~ +0.03)
    """
    if effect.offense_adj >= 0:
        return 0.0   # 득점 유리 날씨는 중립 처리

    era_diff = away_era - home_era  # 양수 = 홈 투수가 더 좋음
    adj = era_diff * abs(effect.offense_adj) * 0.5
    return round(max(-0.03, min(0.03, adj)), 4)
