"""
APScheduler 설정 — FastAPI lifespan 에 통합
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.scheduler.tasks import (
    task_crawl_results,
    task_crawl_schedule,
    task_crawl_statiz,
    task_crawl_standings,
    task_crawl_batters,
    task_crawl_lineup,
    task_crawl_weather,
    task_update_elo,
    task_update_predictions,
    task_settle_results,
)

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="Asia/Seoul")


def setup_scheduler() -> AsyncIOScheduler:
    """스케줄 등록 후 scheduler 인스턴스 반환."""

    scheduler.add_job(
        task_crawl_schedule,
        CronTrigger(hour=6, minute=0),
        id="crawl_schedule",
        replace_existing=True,
        name="KBO 경기 일정 수집",
    )
    scheduler.add_job(
        task_crawl_statiz,
        CronTrigger(hour=7, minute=0),
        id="crawl_statiz",
        replace_existing=True,
        name="KBO 투수 성적 수집",
    )
    scheduler.add_job(
        task_crawl_batters,
        CronTrigger(hour=7, minute=15),
        id="crawl_batters",
        replace_existing=True,
        name="KBO 타자 성적 수집",
    )
    scheduler.add_job(
        task_crawl_standings,
        CronTrigger(hour=7, minute=30),
        id="crawl_standings",
        replace_existing=True,
        name="KBO 팀 순위 수집",
    )
    scheduler.add_job(
        task_crawl_lineup,
        CronTrigger(hour=14, minute=0),
        id="crawl_lineup",
        replace_existing=True,
        name="선발 라인업 수집 (네이버 스포츠)",
    )
    scheduler.add_job(
        task_crawl_weather,
        CronTrigger(hour=12, minute=0),
        id="crawl_weather",
        replace_existing=True,
        name="날씨 수집",
    )
    scheduler.add_job(
        task_crawl_results,
        CronTrigger(hour=23, minute=30),
        id="crawl_results",
        replace_existing=True,
        name="KBO 경기 결과 업데이트",
    )
    scheduler.add_job(
        task_update_predictions,
        CronTrigger(hour=15, minute=0),
        id="update_predictions",
        replace_existing=True,
        name="경기 예측 생성/갱신",
    )
    scheduler.add_job(
        task_update_elo,
        CronTrigger(hour=0, minute=0),
        id="update_elo",
        replace_existing=True,
        name="ELO 레이팅 업데이트",
    )
    # 결과 수집(23:30) 직후 정산 실행
    scheduler.add_job(
        task_settle_results,
        CronTrigger(hour=23, minute=50),
        id="settle_results",
        replace_existing=True,
        name="경기 결과 정산 (적중률/Brier Score)",
    )

    logger.info("Scheduler jobs registered: %d", len(scheduler.get_jobs()))
    return scheduler
