"""
백테스팅 CLI

사용법:
  cd backend
  python -m scripts.backtest                          # 전체 시즌
  python -m scripts.backtest --start 2026-04-01 --end 2026-04-30
  python -m scripts.backtest --csv results/backtest.csv
"""

import argparse
import asyncio
import csv
import logging
from datetime import date
from pathlib import Path

from app.database import AsyncSessionLocal
from app.engine.backtester import BacktestEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger(__name__)


def parse_date(s: str) -> date:
    return date.fromisoformat(s)


async def main(start: date, end: date, csv_path: str | None):
    logger.info("백테스팅 시작: %s ~ %s", start, end)

    engine = BacktestEngine()

    async with AsyncSessionLocal() as session:
        report = await engine.run(session, start, end)

    report.print_report()

    # CSV 저장
    if csv_path:
        out = Path(csv_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "game_id", "game_date", "home_team", "away_team",
                "home_win_prob", "predicted_winner", "actual_winner",
                "is_correct", "elo_diff", "confidence",
            ])
            writer.writeheader()
            for p in report.predictions:
                writer.writerow({
                    "game_id": p.game_id,
                    "game_date": p.game_date,
                    "home_team": p.home_team,
                    "away_team": p.away_team,
                    "home_win_prob": p.home_win_prob,
                    "predicted_winner": p.predicted_winner,
                    "actual_winner": p.actual_winner,
                    "is_correct": p.is_correct,
                    "elo_diff": p.elo_diff,
                    "confidence": p.confidence,
                })
        logger.info("CSV 저장 완료: %s", out)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="KBO Predictor 백테스팅")
    parser.add_argument("--start", type=parse_date, default=date(2026, 4, 1))
    parser.add_argument("--end",   type=parse_date, default=date.today())
    parser.add_argument("--csv",   type=str,        default=None,
                        help="결과 CSV 저장 경로 (예: results/backtest.csv)")
    args = parser.parse_args()
    asyncio.run(main(args.start, args.end, args.csv))
