"""블로그 초안 즉시 생성 — python run_blog_now.py [YYYY-MM-DD]"""
import asyncio
import sys
from datetime import date

sys.path.insert(0, ".")

from app.scheduler.tasks import task_generate_blog
from app.time_utils import today_kst


async def main():
    if len(sys.argv) > 1:
        target = date.fromisoformat(sys.argv[1])
    else:
        target = today_kst()
    print(f"[run_blog_now] target={target}")
    await task_generate_blog(target)
    print("[run_blog_now] done")


asyncio.run(main())
