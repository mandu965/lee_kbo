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
    pitchers: list["BullpenPitcherStatus"]
    injured_pitchers: list["InjuredPitcher"]


@dataclass
class BullpenAppearance:
    game_date: date
    opponent_name: str
    innings_pitched: float
    batters_faced: int | None
    hits: int | None
    walks: int | None
    strikeouts: int | None
    runs: int | None
    earned_runs: int | None


@dataclass
class BullpenPitcherStatus:
    player_id: int
    name: str
    recent_innings: float
    appearances: int
    consecutive_days: int
    availability: str
    saves: int
    holds: int
    season_games: int
    logs: list[BullpenAppearance]


@dataclass
class InjuredPitcher:
    player_id: int
    name: str
    status: str


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
        select(PitcherStat, Player, Game)
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
    recent_rows = (await session.execute(stmt)).all()
    stats = [row[0] for row in recent_rows]

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

    recent_by_player: dict[int, list[tuple[PitcherStat, Game]]] = {}
    player_names: dict[int, str] = {}
    for stat, player, game in recent_rows:
        if stat.player_id is None:
            continue
        recent_by_player.setdefault(stat.player_id, []).append((stat, game))
        player_names[stat.player_id] = player.name

    season_rows = (
        await session.execute(
            select(PitcherStat, Player)
            .join(Player, PitcherStat.player_id == Player.id)
            .where(
                Player.team_id == team_id,
                PitcherStat.game_id.is_(None),
                PitcherStat.season == before_date.year,
            )
        )
    ).all()
    season_by_player = {stat.player_id: stat for stat, _ in season_rows if stat.player_id is not None}
    candidate_ids = set(recent_by_player)
    ranked = sorted(
        season_rows,
        key=lambda row: (
            (row[0].saves or 0) + (row[0].holds or 0),
            row[0].games or 0,
        ),
        reverse=True,
    )
    candidate_ids.update(
        stat.player_id for stat, _ in ranked[:8] if stat.player_id is not None
    )
    player_names.update(
        {stat.player_id: player.name for stat, player in season_rows if stat.player_id is not None}
    )

    pitchers: list[BullpenPitcherStatus] = []
    for player_id in candidate_ids:
        logs = sorted(recent_by_player.get(player_id, []), key=lambda row: row[1].game_date, reverse=True)
        unique_dates = sorted({game.game_date for _, game in logs}, reverse=True)
        consecutive_days = 0
        cursor = before_date - timedelta(days=1)
        for appearance_date in unique_dates:
            if appearance_date == cursor:
                consecutive_days += 1
                cursor -= timedelta(days=1)
            elif appearance_date < cursor:
                break
        innings = round(sum(stat.innings_pitched or 0 for stat, _ in logs), 1)
        appearances = len(logs)
        if consecutive_days >= 2 or innings >= 3.0:
            availability = "휴식 권장"
        elif appearances >= 2 or innings >= 2.0:
            availability = "주의"
        else:
            availability = "가용"
        season_stat = season_by_player.get(player_id)
        pitchers.append(BullpenPitcherStatus(
            player_id=player_id,
            name=player_names[player_id],
            recent_innings=innings,
            appearances=appearances,
            consecutive_days=consecutive_days,
            availability=availability,
            saves=season_stat.saves or 0 if season_stat else 0,
            holds=season_stat.holds or 0 if season_stat else 0,
            season_games=season_stat.games or 0 if season_stat else 0,
            logs=[
                BullpenAppearance(
                    game_date=game.game_date,
                    opponent_name=stat.opponent_name or "",
                    innings_pitched=stat.innings_pitched or 0,
                    batters_faced=stat.batters_faced,
                    hits=stat.hits,
                    walks=stat.walks,
                    strikeouts=stat.strikeouts,
                    runs=stat.runs,
                    earned_runs=stat.earned_runs,
                )
                for stat, game in logs
            ],
        ))
    pitchers.sort(key=lambda pitcher: (
        pitcher.availability != "휴식 권장",
        -pitcher.recent_innings,
        -(pitcher.saves + pitcher.holds),
    ))

    injured_pitchers = [
        InjuredPitcher(player_id=player.id, name=player.name, status=player.injury_status)
        for player in (
            await session.execute(
                select(Player).where(
                    Player.team_id == team_id,
                    Player.position == "P",
                    Player.injury_status.is_not(None),
                )
            )
        ).scalars().all()
        if player.injury_status
    ]

    return BullpenStatus(
        team_id=team_id,
        team_name=team_name,
        recent_innings=round(total_innings, 1),
        fatigue_score=round(fatigue, 3),
        level=level,
        description=desc,
        pitchers=pitchers,
        injured_pitchers=injured_pitchers,
    )


def bullpen_adjustment(home_fatigue: float, away_fatigue: float) -> float:
    """
    홈/원정 불펜 소진도 차이 → 홈팀 유불리 보정값 (-0.03 ~ +0.03).
    홈 불펜이 더 소진됐으면 음수(홈팀 불리).
    """
    diff = away_fatigue - home_fatigue   # 원정이 더 소진 → 홈 유리
    adj = diff * 0.06
    return round(max(-0.03, min(0.03, adj)), 4)
