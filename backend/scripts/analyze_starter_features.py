"""Analyze starter-pitcher feature usefulness with pre-game data only.

Usage:
  python -m scripts.analyze_starter_features --start 2026-04-01 --end 2026-06-08
"""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from datetime import date
from typing import Iterable

from sqlalchemy import desc, select

from app.database import AsyncSessionLocal
from app.models import Game, PitcherStat, Player, Team


@dataclass
class StarterFeatureLine:
    games: int
    innings: float
    era: float | None
    whip: float | None
    avg_innings: float | None
    k_bb_ratio: float | None
    bb_per_9: float | None
    hr_per_9: float | None


@dataclass
class MetricResult:
    name: str
    total: int = 0
    correct: int = 0
    skipped: int = 0

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0


METRICS: dict[str, str] = {
    "era": "lower",
    "whip": "lower",
    "avg_innings": "higher",
    "k_bb_ratio": "higher",
    "bb_per_9": "lower",
    "hr_per_9": "lower",
}


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def safe_div(num: float, den: float) -> float | None:
    return num / den if den else None


def feature_from_stats(stats: Iterable[PitcherStat]) -> StarterFeatureLine | None:
    rows = list(stats)
    if not rows:
        return None

    innings = sum(row.innings_pitched or 0.0 for row in rows)
    earned_runs = sum(row.earned_runs or 0 for row in rows)
    hits = sum(row.hits or 0 for row in rows)
    walks = sum(row.walks or 0 for row in rows)
    strikeouts = sum(row.strikeouts or 0 for row in rows)
    home_runs = sum(row.home_runs_allowed or 0 for row in rows)
    games = len(rows)

    return StarterFeatureLine(
        games=games,
        innings=innings,
        era=round((earned_runs / innings) * 9, 3) if innings > 0 else None,
        whip=round((hits + walks) / innings, 3) if innings > 0 else None,
        avg_innings=round(innings / games, 3) if games else None,
        k_bb_ratio=round(strikeouts / walks, 3) if walks > 0 else (float(strikeouts) if strikeouts > 0 else None),
        bb_per_9=round((walks / innings) * 9, 3) if innings > 0 else None,
        hr_per_9=round((home_runs / innings) * 9, 3) if innings > 0 else None,
    )


async def starter_features(session, player_id: int | None, before: date, recent_n: int | None = None) -> StarterFeatureLine | None:
    if not player_id:
        return None

    stmt = (
        select(PitcherStat)
        .join(Game, PitcherStat.game_id == Game.id)
        .where(
            PitcherStat.player_id == player_id,
            PitcherStat.game_id.is_not(None),
            PitcherStat.is_starter == True,
            Game.status == "final",
            Game.game_date < before,
        )
        .order_by(desc(Game.game_date), desc(PitcherStat.id))
    )
    if recent_n:
        stmt = stmt.limit(recent_n)

    rows = (await session.execute(stmt)).scalars().all()
    return feature_from_stats(rows)


def metric_pick_home(metric: str, home: StarterFeatureLine, away: StarterFeatureLine) -> bool | None:
    home_value = getattr(home, metric)
    away_value = getattr(away, metric)
    if home_value is None or away_value is None or home_value == away_value:
        return None

    if METRICS[metric] == "higher":
        return home_value > away_value
    return home_value < away_value


def update_metric(result: MetricResult, pick_home: bool | None, actual_home_win: bool) -> None:
    if pick_home is None:
        result.skipped += 1
        return
    result.total += 1
    if pick_home == actual_home_win:
        result.correct += 1


async def main(start: date, end: date, min_starts: int) -> None:
    metric_results = {name: MetricResult(name) for name in METRICS}
    recent3_results = {f"recent3_{name}": MetricResult(f"recent3_{name}") for name in METRICS}
    vote_result = MetricResult("starter_metric_majority")

    total_games = 0
    usable_games = 0

    async with AsyncSessionLocal() as session:
        games = (
            await session.execute(
                select(Game)
                .where(
                    Game.status == "final",
                    Game.game_date >= start,
                    Game.game_date <= end,
                    Game.home_score.is_not(None),
                    Game.away_score.is_not(None),
                    Game.home_score != Game.away_score,
                    Game.home_starter_id.is_not(None),
                    Game.away_starter_id.is_not(None),
                )
                .order_by(Game.game_date, Game.id)
            )
        ).scalars().all()

        for game in games:
            total_games += 1
            actual_home_win = (game.home_score or 0) > (game.away_score or 0)

            home = await starter_features(session, game.home_starter_id, game.game_date)
            away = await starter_features(session, game.away_starter_id, game.game_date)
            if not home or not away or home.games < min_starts or away.games < min_starts:
                continue

            usable_games += 1
            votes: list[bool] = []
            for metric, result in metric_results.items():
                pick_home = metric_pick_home(metric, home, away)
                update_metric(result, pick_home, actual_home_win)
                if pick_home is not None:
                    votes.append(pick_home)

            if votes:
                home_votes = sum(1 for vote in votes if vote)
                away_votes = len(votes) - home_votes
                majority = None if home_votes == away_votes else home_votes > away_votes
                update_metric(vote_result, majority, actual_home_win)

            recent_home = await starter_features(session, game.home_starter_id, game.game_date, recent_n=3)
            recent_away = await starter_features(session, game.away_starter_id, game.game_date, recent_n=3)
            if recent_home and recent_away:
                for metric, result in recent3_results.items():
                    base_metric = metric.replace("recent3_", "", 1)
                    pick_home = metric_pick_home(base_metric, recent_home, recent_away)
                    update_metric(result, pick_home, actual_home_win)

    print("\nStarter Feature Analysis")
    print("=" * 72)
    print(f"Period       : {start} ~ {end}")
    print(f"Games        : {total_games}")
    print(f"Usable games : {usable_games} (both starters had >= {min_starts} prior starts)")
    print("-" * 72)
    print("Season-to-date starter metrics")
    for result in sorted(metric_results.values(), key=lambda item: item.accuracy, reverse=True):
        print(f"{result.name:18s} {result.correct:3d}/{result.total:<3d} {result.accuracy*100:5.1f}%  skipped {result.skipped}")
    print("-" * 72)
    print(f"{vote_result.name:18s} {vote_result.correct:3d}/{vote_result.total:<3d} {vote_result.accuracy*100:5.1f}%  skipped {vote_result.skipped}")
    print("-" * 72)
    print("Recent 3 starts")
    for result in sorted(recent3_results.values(), key=lambda item: item.accuracy, reverse=True):
        print(f"{result.name:18s} {result.correct:3d}/{result.total:<3d} {result.accuracy*100:5.1f}%  skipped {result.skipped}")
    print("=" * 72)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Analyze starter feature predictive usefulness.")
    parser.add_argument("--start", type=parse_date, default=date(2026, 4, 1))
    parser.add_argument("--end", type=parse_date, default=date.today())
    parser.add_argument("--min-starts", type=int, default=3)
    args = parser.parse_args()
    asyncio.run(main(args.start, args.end, args.min_starts))
