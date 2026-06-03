"""
APScheduler 설정 — FastAPI lifespan 에 통합

KBO 선발 발표 시각: 보통 당일 오전 11시~오후 1시 (경기 3~4시간 전)
KBO 경기 시간: 주로 14:00 / 17:00 / 18:00

전체 일일 스케줄 (KST):
  00:10  자정 통합 배치 — 전날 결과 마무리 + 익일 준비
         (결과 재확인 → 박스스코어·타순 → 정산 → ELO → 일정 → 투수·타자·순위 → 예측 초안)
  07:00  투수 시즌 성적 갱신
  07:15  타자 시즌 성적 갱신
  07:30  팀 순위 갱신
  11:30  선발 라인업 1차 수집 (선발 발표 직후)
  12:00  날씨 수집
  13:00  선발 라인업 2차 수집 (미발표팀 재시도)
  15:00  최종 예측 생성/갱신 (라인업 확정 후)
  17:00  선발 라인업 3차 수집 (경기 직전 최종 확인)
  23:30  당일 경기 결과 수집
  23:50  결과 정산 (is_correct, Brier Score)
"""

import logging
from zoneinfo import ZoneInfo

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
    task_midnight_batch,
    task_generate_blog,
)

logger = logging.getLogger(__name__)

KST = ZoneInfo("Asia/Seoul")
scheduler = AsyncIOScheduler(timezone=KST)


def _kst_cron(*, hour: int, minute: int) -> CronTrigger:
    """컨테이너의 시스템 시간대와 무관하게 KST 기준 cron을 생성한다."""
    return CronTrigger(hour=hour, minute=minute, timezone=KST)


def setup_scheduler() -> AsyncIOScheduler:
    """스케줄 등록 후 scheduler 인스턴스 반환."""

    # ── 00:10 자정 통합 배치 ─────────────────────────────────────
    # 전날 결과 마무리 + 익일 준비를 한 번에 처리
    scheduler.add_job(
        task_midnight_batch,
        _kst_cron(hour=0, minute=10),
        id="midnight_batch",
        replace_existing=True,
        name="자정 통합 배치 (결과→박스스코어·타순→정산→ELO→일정→기록·순위→예측초안)",
    )

    # ── 07:00~07:30 성적/순위 갱신 ──────────────────────────────
    scheduler.add_job(
        task_crawl_statiz,
        _kst_cron(hour=7, minute=0),
        id="crawl_statiz",
        replace_existing=True,
        name="KBO 투수 성적 갱신",
    )
    scheduler.add_job(
        task_crawl_batters,
        _kst_cron(hour=7, minute=15),
        id="crawl_batters",
        replace_existing=True,
        name="KBO 타자 성적 갱신",
    )
    scheduler.add_job(
        task_crawl_standings,
        _kst_cron(hour=7, minute=30),
        id="crawl_standings",
        replace_existing=True,
        name="KBO 팀 순위 갱신",
    )

    # ── 선발 라인업 3회 수집 ─────────────────────────────────────
    # KBO 선발은 보통 오전 11시~오후 1시 발표
    scheduler.add_job(
        task_crawl_lineup,
        _kst_cron(hour=11, minute=30),
        id="crawl_lineup_1st",
        replace_existing=True,
        name="선발 라인업 1차 (11:30, 발표 직후)",
    )
    scheduler.add_job(
        task_crawl_lineup,
        _kst_cron(hour=13, minute=0),
        id="crawl_lineup_2nd",
        replace_existing=True,
        name="선발 라인업 2차 (13:00, 미발표팀 재시도)",
    )
    scheduler.add_job(
        task_crawl_lineup,
        _kst_cron(hour=17, minute=0),
        id="crawl_lineup_3rd",
        replace_existing=True,
        name="선발 라인업 3차 (17:00, 경기 직전 최종)",
    )

    # ── 날씨 수집 ────────────────────────────────────────────────
    scheduler.add_job(
        task_crawl_weather,
        _kst_cron(hour=12, minute=0),
        id="crawl_weather",
        replace_existing=True,
        name="날씨 수집",
    )

    # ── 예측 생성 (라인업 확정 후) ──────────────────────────────
    scheduler.add_job(
        task_update_predictions,
        _kst_cron(hour=15, minute=0),
        id="update_predictions",
        replace_existing=True,
        name="최종 예측 생성/갱신 (선발 확정 후)",
    )

    # ── 블로그 초안 생성 (예측 완료 30분 후) ────────────────────
    scheduler.add_job(
        task_generate_blog,
        _kst_cron(hour=15, minute=30),
        id="generate_blog",
        replace_existing=True,
        name="블로그 초안 생성 (TYPE_A/B/C)",
    )

    # ── 23:30 경기 결과 수집 ─────────────────────────────────────
    scheduler.add_job(
        task_crawl_results,
        _kst_cron(hour=23, minute=30),
        id="crawl_results",
        replace_existing=True,
        name="KBO 경기 결과 수집",
    )

    # ── 23:50 당일 정산 ──────────────────────────────────────────
    scheduler.add_job(
        task_settle_results,
        _kst_cron(hour=23, minute=50),
        id="settle_results",
        replace_existing=True,
        name="경기 결과 정산 (적중률/Brier Score)",
    )

    logger.info("Scheduler jobs registered: %d", len(scheduler.get_jobs()))
    return scheduler
