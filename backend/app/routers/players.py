"""
선수 상세 API
  GET /v1/player/{player_id} — 프로필 + 시즌 기록(타자/투수) + 최근 경기 로그
"""

from datetime import date as date_cls
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import BatterStat, Game, PitcherStat, Player, Team

router = APIRouter(prefix="/player", tags=["player"])


@router.get("/{player_id}")
async def get_player_detail(player_id: int, session: AsyncSession = Depends(get_db)):
    """선수 통합 상세 — 타자/투수 자동 판별."""
    player: Optional[Player] = await session.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")

    team: Optional[Team] = await session.get(Team, player.team_id) if player.team_id else None
    season = date_cls.today().year

    # 타자/투수 시즌 기록 조회
    batter = (
        await session.execute(
            select(BatterStat).where(BatterStat.player_id == player_id, BatterStat.season == season)
        )
    ).scalar_one_or_none()

    pitcher = (
        await session.execute(
            select(PitcherStat)
            .where(
                PitcherStat.player_id == player_id,
                PitcherStat.season == season,
                PitcherStat.game_id.is_(None),
            )
            .order_by(desc(PitcherStat.id))
            .limit(1)
        )
    ).scalar_one_or_none()

    # 투수 최근 경기 로그 (game_id 있는 행)
    recent_games = []
    if pitcher:
        logs = (
            await session.execute(
                select(PitcherStat)
                .where(PitcherStat.player_id == player_id, PitcherStat.game_id.is_not(None))
                .order_by(desc(PitcherStat.id))
                .limit(10)
            )
        ).scalars().all()
        for log in logs:
            g = await session.get(Game, log.game_id) if log.game_id else None
            recent_games.append({
                "game_date": g.game_date.isoformat() if g else None,
                "opponent_name": log.opponent_name,
                "is_starter": log.is_starter,
                "innings_pitched": log.innings_pitched,
                "earned_runs": log.earned_runs,
                "strikeouts": log.strikeouts,
                "walks": log.walks,
                "hits": log.hits,
                "era": log.era,
                "result": log.game_result,
            })

    # 포지션 판정
    is_pitcher = (player.position == "P") or (pitcher is not None and batter is None)

    return {
        "id": player.id,
        "name": player.name,
        "position": player.position,
        "team_id": player.team_id,
        "team_name": team.name if team else None,
        "team_short": team.short_name if team else None,
        "injury_status": player.injury_status,
        "is_pitcher": is_pitcher,
        "season": season,
        "pitcher_stats": {
            "era": pitcher.era,
            "whip": pitcher.whip,
            "games": pitcher.games,
            "wins": pitcher.wins,
            "losses": pitcher.losses,
            "saves": pitcher.saves,
            "holds": pitcher.holds,
            "innings_pitched": pitcher.innings_pitched,
            "strikeouts": pitcher.strikeouts,
            "walks": pitcher.walks,
            "hits": pitcher.hits,
            "home_runs_allowed": pitcher.home_runs_allowed,
            "k_bb_ratio": round(pitcher.strikeouts / pitcher.walks, 2)
                if pitcher.strikeouts and pitcher.walks and pitcher.walks > 0 else None,
        } if pitcher else None,
        "batter_stats": {
            "avg": batter.avg,
            "games": batter.games,
            "plate_app": batter.plate_app,
            "at_bats": batter.at_bats,
            "hits": batter.hits,
            "doubles": batter.doubles,
            "triples": batter.triples,
            "home_runs": batter.home_runs,
            "rbi": batter.rbi,
            "runs": batter.runs,
            "walks": batter.walks,
            "strikeouts": batter.strikeouts,
            "obp": batter.obp,
            "slg": batter.slg,
            "ops": batter.ops,
        } if batter else None,
        "recent_games": recent_games,
    }
