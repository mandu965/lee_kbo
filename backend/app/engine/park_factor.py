"""
구장별 파크팩터 (Park Factor)

파크팩터 > 1.0 : 타자 친화적 구장 (득점↑)
파크팩터 < 1.0 : 투수 친화적 구장 (득점↓)
기준값 1.0 = 리그 평균

출처: KBO 구장별 득점 환경 분석 (추정값, 실제 데이터 수집 후 보정 필요)
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ParkInfo:
    stadium: str
    factor: float       # 득점 파크팩터
    hr_factor: float    # 홈런 파크팩터
    notes: str = ""


# KBO 10개 구장 파크팩터
PARK_FACTORS: dict[str, ParkInfo] = {
    "잠실야구장": ParkInfo(
        stadium="잠실야구장", factor=1.05, hr_factor=1.02,
        notes="대형 구장이나 LG·두산 타선이 강해 득점 많음",
    ),
    "고척스카이돔": ParkInfo(
        stadium="고척스카이돔", factor=0.94, hr_factor=0.88,
        notes="돔 구장, 넓은 외야, 투수 친화적",
    ),
    "수원KT위즈파크": ParkInfo(
        stadium="수원KT위즈파크", factor=1.02, hr_factor=1.05,
        notes="좌·우 담장이 가깝고 바람 영향 큼",
    ),
    "인천SSG랜더스필드": ParkInfo(
        stadium="인천SSG랜더스필드", factor=0.98, hr_factor=0.95,
        notes="해풍 영향, 평균에 근접",
    ),
    "대전한화생명볼파크": ParkInfo(
        stadium="대전한화생명볼파크", factor=1.08, hr_factor=1.12,
        notes="2024 신축, 작은 파울존·좁은 외야, 타자 친화",
    ),
    "창원NC파크": ParkInfo(
        stadium="창원NC파크", factor=0.97, hr_factor=0.93,
        notes="해안 도시, 바람 영향 가변적",
    ),
    "부산사직야구장": ParkInfo(
        stadium="부산사직야구장", factor=1.03, hr_factor=1.04,
        notes="바다 인접, 습도 높아 타구 잘 날아감",
    ),
    "광주기아챔피언스필드": ParkInfo(
        stadium="광주기아챔피언스필드", factor=1.01, hr_factor=1.00,
        notes="리그 평균에 근접한 중립 구장",
    ),
    "대구삼성라이온즈파크": ParkInfo(
        stadium="대구삼성라이온즈파크", factor=0.99, hr_factor=0.97,
        notes="내륙 분지, 여름 고온으로 타구 유리하나 구장이 큼",
    ),
}

# 구장명 단축 alias 매핑
_ALIASES: dict[str, str] = {
    "잠실": "잠실야구장",
    "고척": "고척스카이돔",
    "수원": "수원KT위즈파크",
    "인천": "인천SSG랜더스필드",
    "문학": "인천SSG랜더스필드",
    "대전": "대전한화생명볼파크",
    "창원": "창원NC파크",
    "사직": "부산사직야구장",
    "부산": "부산사직야구장",
    "광주": "광주기아챔피언스필드",
    "대구": "대구삼성라이온즈파크",
}

LEAGUE_AVG_FACTOR = 1.00


def get_park_info(stadium: str | None) -> ParkInfo:
    """구장명(전체 또는 단축)으로 ParkInfo 반환. 미등록 구장은 리그 평균."""
    if stadium is None:
        return ParkInfo(stadium="unknown", factor=LEAGUE_AVG_FACTOR, hr_factor=LEAGUE_AVG_FACTOR)

    if stadium in PARK_FACTORS:
        return PARK_FACTORS[stadium]

    for alias, full in _ALIASES.items():
        if alias in stadium:
            return PARK_FACTORS[full]

    return ParkInfo(stadium=stadium, factor=LEAGUE_AVG_FACTOR, hr_factor=LEAGUE_AVG_FACTOR)


def park_adjustment(stadium: str | None, home_ops: float = 0.700, away_ops: float = 0.700) -> float:
    """
    파크팩터 기반 홈팀 유·불리 보정값 (-0.05 ~ +0.05).

    타자 친화 구장일수록 홈팀 타선 유리 → 양수.
    투수 친화 구장일수록 투수전 → 선발이 좋은 팀 유리 (별도 반영).
    """
    info = get_park_info(stadium)
    # 파크팩터 1.0 기준 편차 × 홈 이점 가중치
    raw = (info.factor - LEAGUE_AVG_FACTOR) * 0.25
    # OPS 차이로 추가 가중 (타선 강한 팀이 타자 구장에서 더 유리)
    ops_diff = (home_ops - away_ops) * (info.factor - LEAGUE_AVG_FACTOR) * 0.5
    return round(max(-0.05, min(0.05, raw + ops_diff)), 4)
