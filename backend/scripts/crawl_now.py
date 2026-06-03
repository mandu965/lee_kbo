"""
수동 실행 스크립트 (크롤러 + 엔진).

사용법:
  python -m scripts.crawl_now --task schedule --year 2026 --month 5
  python -m scripts.crawl_now --task statiz --year 2026
  python -m scripts.crawl_now --task weather
  python -m scripts.crawl_now --task predict
  python -m scripts.crawl_now --task elo
  python -m scripts.crawl_now --task all
"""

import argparse
import asyncio
import logging
import sys
from datetime import date

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")

TASKS = ["schedule", "results", "records", "statiz", "batters", "standings", "lineup", "weather", "predict", "elo", "settle", "sync", "all"]


async def main(args: argparse.Namespace) -> None:
    task = args.task

    if task in ("schedule", "all"):
        from app.scheduler.tasks import task_crawl_schedule
        await task_crawl_schedule(args.year, args.month)

    if task in ("results", "all"):
        from app.scheduler.tasks import task_crawl_results
        await task_crawl_results()

    if task in ("records",):
        from app.scheduler.tasks import task_crawl_game_records
        await task_crawl_game_records(backfill=True)

    if task in ("statiz", "all"):
        from app.scheduler.tasks import task_crawl_statiz
        await task_crawl_statiz()

    if task in ("weather", "all"):
        from app.scheduler.tasks import task_crawl_weather
        await task_crawl_weather()

    if task in ("predict", "all"):
        from app.scheduler.tasks import task_update_predictions
        await task_update_predictions()

    if task in ("elo", "all"):
        from app.scheduler.tasks import task_update_elo
        await task_update_elo()

    if task in ("batters", "all"):
        from app.scheduler.tasks import task_crawl_batters
        await task_crawl_batters()

    if task in ("lineup", "all"):
        from app.scheduler.tasks import task_crawl_lineup
        await task_crawl_lineup()

    if task in ("standings", "all"):
        from app.scheduler.tasks import task_crawl_standings
        await task_crawl_standings()

    if task in ("settle", "all"):
        from app.scheduler.tasks import task_settle_results
        target = date(args.year, args.month, 1) if (args.year and args.month) else None
        await task_settle_results(target)

    if task in ("sync",):
        from app.sync import sync_full
        result = await sync_full()
        total = sum(v for v in result.values() if v >= 0)
        print(f"Supabase 전체 동기화 완료: {total}행 ({len(result)}테이블)")

    if task not in TASKS:
        print(f"Unknown task: {task}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="KBO Predictor 수동 실행")
    parser.add_argument("--task", choices=TASKS, required=True)
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--month", type=int, default=None)
    asyncio.run(main(parser.parse_args()))
