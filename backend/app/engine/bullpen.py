"""
불펜 소진도 지표

최근 3일간 불펜 투수가 던진 이닝 수를 기반으로
불펜 소진도(0.0 ~ 1.0)를 계산합니다.

소진도 높음 → 해당 팀 불펜 신뢰도 낮음 → 선발 의존도 증가
"""

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Game, PitcherStat, Player, Team


# 3일간 불펜 이닝 임계값
BULLPEN_THRESHOLD_INNINGS = 9.0   # 이 이상이면 소진 상태
BULLPEN_WARNING_INNINGS = 6.0     # 이 이상이면 경고


@dataclass
class BullpenStatus:
    team_id: int
    team_name: str
    recent_innings: float           # 최근 3일 불펜 투구 이닝
    fatigue_score: float            # 0.0(여유) ~ 1.0(완전 소진)
    level: str                      # "여유" / "경고" / "소진"
    description: str


async def calc_bullpen_fatigue(
    session: AsyncSession,
    team_id: int,
    before_date: date,
    days: int = 3,
) -> BullpenStatus:
    """
    팀의 최근 N일간 불펜 소진도 계산.

    선발 투수가 아닌(is_starter=False) 투수의 이닝 합산.
    """
    team: Team | None = await session.get(Team, team_id)
    team_name = team.name if team else str(team_id)

    since = before_date - timedelta(days=days)

    # 최근 N일 불펜 이닝 조회
    stmt = (
        select(PitcherStat)
        .join(Game, PitcherStat.game_id == Game.id)
        .join(Player, PitcherStat.player_id == Player.id)
        .where(
            and_(
                Player.team_id == team_id,
                PitcherStat.is_starter == False,
                Game.game_date >= since,
                Game.game_date < before_date,
                Game.status == "final",
            )
        )
    )
    stats = (await session.execute(stmt)).scalars().all()

    total_innings = sum(s.innings_pitched or 0 for s in stats)

    if total_innings >= BULLPEN_THRESHOLD_INNINGS:
        fatigue = min(1.0, total_innings / (BULLPEN_THRESHOLD_INNINGS * 1.5))
        level = "소진"
        desc = f"불펜 {total_innings:.1f}이닝 — 소진 상태"
    elif total_innings >= BULLPEN_WARNING_INNINGS:
        fatigue = total_innings / BULLPEN_THRESHOLD_INNINGS
        level = "경고"
        desc = f"불펜 {total_innings:.1f}이닝 — 피로 경고"
    else:
        fatigue = total_innings / BULLPEN_THRESHOLD_INNINGS
        level = "여유"
        desc = f"불펜 {total_innings:.1f}이닝 — 여유 있음"

    return BullpenStatus(
        team_id=team_id,
        team_name=team_name,
        recent_innings=round(total_innings, 1),
        fatigue_score=round(fatigue, 3),
        level=level,
        description=desc,
    )


def bullpen_adjustment(home_fatigue: float, away_fatigue: float) -> float:
    """
    홈/원정 불펜 소진도 차이 → 홈팀 유불리 보정값 (-0.03 ~ +0.03).
    홈 불펜이 더 소진됐으면 음수(홈팀 불리).
    """
    diff = away_fatigue - home_fatigue   # 원정이 더 소진 → 홈 유리
    adj = diff * 0.06
    return round(max(-0.03, min(0.03, adj)), 4)
