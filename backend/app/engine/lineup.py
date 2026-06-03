"""Confirmed batting-order strength based on season OPS."""

from dataclasses import dataclass, field

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BatterStat, GameLineup, Player

BAT_ORDER_WEIGHTS = {
    1: 1.00,
    2: 0.98,
    3: 1.08,
    4: 1.12,
    5: 1.06,
    6: 1.00,
    7: 0.94,
    8: 0.90,
    9: 0.86,
}
MIN_OPS_PLAYERS = 6
MAX_LINEUP_ADJUSTMENT = 0.03


@dataclass
class LineupPlayerImpact:
    player_id: int
    name: str
    ops: float | None = None


@dataclass
class LineupStrength:
    available: bool = False
    is_confirmed: bool = False
    player_count: int = 0
    ops_player_count: int = 0
    weighted_ops: float | None = None
    baseline_ops: float | None = None
    strength_ratio: float | None = None
    player_ops: dict[int, float] = field(default_factory=dict)
    excluded_regulars: list[LineupPlayerImpact] = field(default_factory=list)
    replacements: list[LineupPlayerImpact] = field(default_factory=list)


def _weighted_average(items: list[tuple[int, float]]) -> float | None:
    if not items:
        return None
    total_weight = sum(BAT_ORDER_WEIGHTS.get(order, 1.0) for order, _ in items)
    if total_weight <= 0:
        return None
    return sum(BAT_ORDER_WEIGHTS.get(order, 1.0) * value for order, value in items) / total_weight


def _compare_expected_lineup(
    expected: list[LineupPlayerImpact],
    actual: list[LineupPlayerImpact],
) -> tuple[list[LineupPlayerImpact], list[LineupPlayerImpact]]:
    expected_ids = {player.player_id for player in expected}
    actual_ids = {player.player_id for player in actual}
    excluded = [player for player in expected if player.player_id not in actual_ids]
    replacements = [player for player in actual if player.player_id not in expected_ids]
    return excluded, replacements


async def calc_lineup_strength(
    session: AsyncSession, game_id: int, team_id: int, season: int
) -> LineupStrength:
    lineup = list((
        await session.execute(
            select(GameLineup)
            .where(
                GameLineup.game_id == game_id,
                GameLineup.team_id == team_id,
                GameLineup.is_starter.is_(True),
            )
            .order_by(GameLineup.bat_order, GameLineup.id)
        )
    ).scalars().all())
    if not lineup:
        return LineupStrength()

    player_ids = [row.player_id for row in lineup if row.player_id is not None]
    stats = list((
        await session.execute(
            select(BatterStat)
            .where(
                BatterStat.player_id.in_(player_ids),
                BatterStat.season == season,
                BatterStat.ops.is_not(None),
            )
        )
    ).scalars().all()) if player_ids else []
    player_ops = {stat.player_id: stat.ops for stat in stats if stat.ops is not None}

    expected_rows = list((
        await session.execute(
            select(BatterStat, Player)
            .join(Player, BatterStat.player_id == Player.id)
            .where(
                Player.team_id == team_id,
                BatterStat.season == season,
                BatterStat.ops.is_not(None),
            )
            .order_by(desc(BatterStat.plate_app), desc(BatterStat.ops))
            .limit(9)
        )
    ).all())
    expected = [
        LineupPlayerImpact(player_id=player.id, name=player.name, ops=stat.ops)
        for stat, player in expected_rows
    ]
    baseline = _weighted_average([
        (order, player.ops)
        for order, player in enumerate(expected, start=1)
        if player.ops is not None
    ])

    known = [
        (row.bat_order, player_ops[row.player_id])
        for row in lineup
        if row.player_id is not None and row.player_id in player_ops
    ]
    weighted_ops = _weighted_average(known)
    actual = [
        LineupPlayerImpact(
            player_id=row.player_id,
            name=row.player_name,
            ops=player_ops.get(row.player_id),
        )
        for row in lineup
        if row.player_id is not None
    ]
    excluded_regulars, replacements = _compare_expected_lineup(expected, actual)
    confirmed = len(lineup) >= 9 and all(row.is_confirmed for row in lineup)
    available = (
        confirmed
        and len(known) >= MIN_OPS_PLAYERS
        and baseline is not None
        and baseline > 0
        and weighted_ops is not None
    )
    return LineupStrength(
        available=available,
        is_confirmed=confirmed,
        player_count=len(lineup),
        ops_player_count=len(known),
        weighted_ops=round(weighted_ops, 3) if weighted_ops is not None else None,
        baseline_ops=round(baseline, 3) if baseline is not None else None,
        strength_ratio=round(weighted_ops / baseline, 3) if available and weighted_ops is not None and baseline else None,
        player_ops={player_id: round(ops, 3) for player_id, ops in player_ops.items()},
        excluded_regulars=excluded_regulars,
        replacements=replacements,
    )


def lineup_adjustment(home: LineupStrength, away: LineupStrength) -> float:
    """Return an additive home-win probability adjustment, capped at +/-3%p."""
    if not home.available or not away.available:
        return 0.0
    raw = ((home.strength_ratio or 1.0) - (away.strength_ratio or 1.0)) * 0.12
    return round(max(-MAX_LINEUP_ADJUSTMENT, min(MAX_LINEUP_ADJUSTMENT, raw)), 4)
