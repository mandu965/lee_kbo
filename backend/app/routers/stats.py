"""
선수 기록 순위 API
  GET /v1/stats/batters?season=2026&team=LG&sort=ops&limit=30
  GET /v1/stats/pitchers?season=2026&team=LG&sort=era&limit=30
"""

from datetime import date as date_cls
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import BatterStat, PitcherStat, Player, Team
from app.time_utils import today_kst

router = APIRouter(prefix="/stats", tags=["stats"])


# ─── 타자 순위 ────────────────────────────────────────────────

BATTER_SORT_MAP = {
    "avg": BatterStat.avg, "hr": BatterStat.home_runs,
    "rbi": BatterStat.rbi, "ops": BatterStat.ops,
    "obp": BatterStat.obp, "slg": BatterStat.slg,
    "hits": BatterStat.hits, "runs": BatterStat.runs,
    "sb": None,  # 도루 — 현재 미수집
}


@router.get("/batters")
async def get_batter_rankings(
    season: int = Query(default=None),
    team: Optional[str] = Query(default=None),
    sort: str = Query(default="ops"),
    order: Optional[str] = Query(default=None),
    limit: int = Query(default=30, le=100),
    session: AsyncSession = Depends(get_db),
):
    """타자 시즌 기록 순위."""
    season = season or today_kst().year
    sort_col = BATTER_SORT_MAP.get(sort, BatterStat.ops)
    if sort_col is None:
        sort_col = BatterStat.ops

    stmt = (
        select(BatterStat, Player, Team)
        .join(Player, BatterStat.player_id == Player.id)
        .join(Team, Player.team_id == Team.id)
        .where(BatterStat.season == season)
    )
    if team:
        # 팀 필터: 해당 팀 전원 표시 (이닝/타석 제한 없음)
        stmt = stmt.where(Team.code == team)
    else:
        # 전체 순위: 규정 타석 이상만 (PA ≥ 50)
        stmt = stmt.where(BatterStat.plate_app >= 50)
    effective_order = order if order in ("asc", "desc") else "desc"
    if effective_order == "asc":
        stmt = stmt.order_by(asc(sort_col).nulls_last())
    else:
        stmt = stmt.order_by(desc(sort_col).nulls_last())
    stmt = stmt.limit(limit)

    rows = (await session.execute(stmt)).all()
    result = []
    for rank_i, (stat, player, team_obj) in enumerate(rows, 1):
        result.append({
            "rank": rank_i,
            "player_id": player.id,
            "name": player.name,
            "team_code": team_obj.code,
            "team_name": team_obj.short_name or team_obj.name,
            "games": stat.games,
            "avg": stat.avg,
            "plate_app": stat.plate_app,
            "at_bats": stat.at_bats,
            "runs": stat.runs,
            "hits": stat.hits,
            "doubles": stat.doubles,
            "triples": stat.triples,
            "home_runs": stat.home_runs,
            "rbi": stat.rbi,
            "walks": stat.walks,
            "strikeouts": stat.strikeouts,
            "obp": stat.obp,
            "slg": stat.slg,
            "ops": stat.ops,
        })
    return result


# ─── 투수 순위 ────────────────────────────────────────────────

PITCHER_SORT_MAP = {
    "era": (PitcherStat.era, "asc"),
    "whip": (PitcherStat.whip, "asc"),
    "wins": (PitcherStat.wins, "desc"),
    "saves": (PitcherStat.saves, "desc"),
    "holds": (PitcherStat.holds, "desc"),
    "strikeouts": (PitcherStat.strikeouts, "desc"),
    "ip": (PitcherStat.innings_pitched, "desc"),
    "hits": (PitcherStat.hits, "asc"),
    "hr": (PitcherStat.home_runs_allowed, "asc"),
    "runs": (PitcherStat.runs, "asc"),
    "earned_runs": (PitcherStat.earned_runs, "asc"),
    "walks": (PitcherStat.walks, "asc"),
    "hbp": (PitcherStat.hbp, "asc"),
}


@router.get("/pitchers")
async def get_pitcher_rankings(
    season: int = Query(default=None),
    team: Optional[str] = Query(default=None),
    sort: str = Query(default="era"),
    order: Optional[str] = Query(default=None),
    limit: int = Query(default=30, le=100),
    session: AsyncSession = Depends(get_db),
):
    """투수 시즌 기록 순위."""
    season = season or today_kst().year
    col, default_order = PITCHER_SORT_MAP.get(sort, (PitcherStat.era, "asc"))
    effective_order = order if order in ("asc", "desc") else default_order

    stmt = (
        select(PitcherStat, Player, Team)
        .join(Player, PitcherStat.player_id == Player.id)
        .join(Team, Player.team_id == Team.id)
        .where(
            PitcherStat.season == season,
            PitcherStat.game_id.is_(None),
        )
    )
    if team:
        # 팀 필터: 해당 팀 전원 표시 (이닝 제한 없음)
        stmt = stmt.where(Team.code == team)
    else:
        # 전체 순위: ERA/WHIP/IP 정렬은 선발 기준(30이닝↑), 나머지는 10이닝↑
        min_ip = 30.0 if sort in ("era", "whip", "ip") else 10.0
        stmt = stmt.where(PitcherStat.innings_pitched >= min_ip)

    if effective_order == "asc":
        stmt = stmt.order_by(asc(col).nulls_last())
    else:
        stmt = stmt.order_by(desc(col).nulls_last())
    stmt = stmt.limit(limit)

    rows = (await session.execute(stmt)).all()
    result = []
    for rank_i, (stat, player, team_obj) in enumerate(rows, 1):
        result.append({
            "rank": rank_i,
            "player_id": player.id,
            "name": player.name,
            "team_code": team_obj.code,
            "team_name": team_obj.short_name or team_obj.name,
            "games": stat.games,
            "wins": stat.wins,
            "losses": stat.losses,
            "saves": stat.saves,
            "holds": stat.holds,
            "era": stat.era,
            "innings_pitched": stat.innings_pitched,
            "hits": stat.hits,
            "home_runs_allowed": stat.home_runs_allowed,
            "runs": stat.runs,
            "earned_runs": stat.earned_runs,
            "walks": stat.walks,
            "hbp": stat.hbp,
            "strikeouts": stat.strikeouts,
            "whip": stat.whip,
        })
    return result
