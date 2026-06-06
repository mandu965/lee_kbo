"""
관리자용 운영 상태 API
  GET /v1/admin/collection-status — 태스크별 마지막 수집 이력
  GET /v1/admin/collection-runs?task=&limit= — 최근 실행 이력
  GET /v1/admin/content-drafts — 오늘 블로그 초안 목록
  GET /v1/admin/content-drafts/{content_type}/naver — 네이버 본문
  GET /v1/admin/content-drafts/{content_type}/tistory — 티스토리 본문
  GET /v1/admin/content-drafts/{content_type}/download/{platform} — 파일 다운로드
"""

from datetime import date as date_cls, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CollectionRun, Game, Prediction, VisitorDailyStat, VisitorDailyUnique
from app.scheduler.main import scheduler
from app.time_utils import today_kst

router = APIRouter(prefix="/admin", tags=["admin"])

TRACKED_TASKS = ["crawl_schedule", "crawl_results", "crawl_statiz", "crawl_batters", "crawl_standings"]

SCHEDULER_TASK_LABELS = {
    "midnight_batch": "자정 통합 배치",
    "crawl_statiz": "투수 기록",
    "crawl_batters": "타자 기록",
    "crawl_standings": "팀 순위",
    "crawl_lineup": "선발/타순",
    "crawl_lineup_1st": "선발/타순 1차",
    "crawl_lineup_2nd": "선발/타순 2차",
    "crawl_lineup_3rd": "선발/타순 3차",
    "crawl_weather": "날씨",
    "update_predictions": "예측 생성",
    "generate_blog": "블로그 초안",
    "crawl_results": "경기 결과",
    "settle_results": "예측 정산",
}

JOB_TO_RUN_TASK = {
    "crawl_lineup_1st": "crawl_lineup",
    "crawl_lineup_2nd": "crawl_lineup",
    "crawl_lineup_3rd": "crawl_lineup",
}


def _iso_or_none(value):
    return value.isoformat() if value else None


@router.get("/collection-status")
async def collection_status(session: AsyncSession = Depends(get_db)):
    """태스크별 마지막 실행 상태 + 오늘 운영 요약."""
    statuses = []
    for task in TRACKED_TASKS:
        last = (
            await session.execute(
                select(CollectionRun)
                .where(CollectionRun.task_name == task)
                .order_by(desc(CollectionRun.started_at))
                .limit(1)
            )
        ).scalar_one_or_none()
        # 마지막 성공
        last_success = (
            await session.execute(
                select(CollectionRun.finished_at)
                .where(CollectionRun.task_name == task, CollectionRun.status == "success")
                .order_by(desc(CollectionRun.finished_at))
                .limit(1)
            )
        ).scalar_one_or_none()
        statuses.append({
            "task_name": task,
            "last_status": last.status if last else None,
            "last_run_at": last.started_at if last else None,
            "last_row_count": last.row_count if last else None,
            "last_error": last.error_message if last else None,
            "last_success_at": last_success,
        })

    # 오늘 운영 요약
    today = date_cls.today()
    today_games = await session.scalar(
        select(func.count()).select_from(Game).where(Game.game_date == today)
    )
    today_final = await session.scalar(
        select(func.count()).select_from(Game).where(Game.game_date == today, Game.status == "final")
    )
    today_predicted = await session.scalar(
        select(func.count(func.distinct(Prediction.game_id)))
        .select_from(Prediction).join(Game, Prediction.game_id == Game.id)
        .where(Game.game_date == today)
    )
    today_settled = await session.scalar(
        select(func.count()).select_from(Prediction).join(Game, Prediction.game_id == Game.id)
        .where(Game.game_date == today, Prediction.settlement_status == "settled")
    )

    return {
        "tasks": statuses,
        "today": {
            "date": today.isoformat(),
            "games": today_games or 0,
            "final": today_final or 0,
            "predicted": today_predicted or 0,
            "settled": today_settled or 0,
        },
    }


@router.get("/scheduler-status")
async def scheduler_status(session: AsyncSession = Depends(get_db)):
    """Scheduler jobs, last run status, and next scheduled fire time."""
    jobs = sorted(scheduler.get_jobs(), key=lambda job: str(job.next_run_time or ""))
    job_ids = [job.id for job in jobs]
    run_task_names = sorted(set(JOB_TO_RUN_TASK.get(job_id, job_id) for job_id in job_ids))

    latest_runs: dict[str, CollectionRun] = {}
    latest_success: dict[str, CollectionRun] = {}

    if run_task_names:
        rows = (await session.execute(
            select(CollectionRun)
            .where(CollectionRun.task_name.in_(run_task_names))
            .order_by(desc(CollectionRun.started_at), desc(CollectionRun.id))
        )).scalars().all()
        for row in rows:
            latest_runs.setdefault(row.task_name, row)
            if row.status == "success":
                latest_success.setdefault(row.task_name, row)

    items = []
    active_count = 0
    failed_count = 0
    running_count = 0

    for job in jobs:
        task_name = JOB_TO_RUN_TASK.get(job.id, job.id)
        last = latest_runs.get(task_name)
        success = latest_success.get(task_name)
        status = last.status if last else "not_recorded"
        if job.next_run_time:
            active_count += 1
        if status == "failed":
            failed_count += 1
        if status == "running":
            running_count += 1

        items.append({
            "job_id": job.id,
            "task_name": task_name,
            "label": SCHEDULER_TASK_LABELS.get(job.id)
                or SCHEDULER_TASK_LABELS.get(task_name)
                or job.name
                or job.id,
            "status": status,
            "last_started_at": _iso_or_none(last.started_at) if last else None,
            "last_finished_at": _iso_or_none(last.finished_at) if last else None,
            "last_success_at": _iso_or_none(success.finished_at) if success else None,
            "last_row_count": last.row_count if last else None,
            "last_error": last.error_message if last else None,
            "next_run_at": _iso_or_none(job.next_run_time),
        })

    return {
        "scheduler": {
            "running": scheduler.running,
            "job_count": len(jobs),
            "active_count": active_count,
            "running_count": running_count,
            "failed_count": failed_count,
            "timezone": str(scheduler.timezone),
        },
        "data_policy": {
            "source": "local_db",
            "replica": "web_db",
            "description": "로컬 DB가 운영 원본이고 웹 DB는 조회용 복제본입니다.",
        },
        "jobs": items,
    }


@router.get("/collection-runs")
async def collection_runs(
    task: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=200),
    session: AsyncSession = Depends(get_db),
):
    """최근 수집 실행 이력 (필터: 태스크명)."""
    stmt = select(CollectionRun).order_by(desc(CollectionRun.started_at)).limit(limit)
    if task:
        stmt = stmt.where(CollectionRun.task_name == task)
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "task_name": r.task_name,
            "target_date": r.target_date,
            "status": r.status,
            "row_count": r.row_count,
            "error_message": r.error_message,
            "started_at": r.started_at,
            "finished_at": r.finished_at,
        }
        for r in rows
    ]


@router.get("/model-versions")
async def model_version_stats(session: AsyncSession = Depends(get_db)):
    """모델 버전별 성과 요약."""
    from app.models import PredictionRun
    from sqlalchemy import case

    rows = (await session.execute(
        select(
            PredictionRun.model_version,
            func.count().label("total"),
            func.sum(case((PredictionRun.is_correct == True, 1), else_=0)).label("correct"),
            func.avg(PredictionRun.brier_score).label("avg_brier"),
        )
        .where(PredictionRun.settlement_status == "settled", PredictionRun.is_published == True)
        .group_by(PredictionRun.model_version)
        .order_by(desc("total"))
    )).all()

    return [
        {
            "model_version": r.model_version,
            "total": r.total,
            "accuracy": round(r.correct / r.total, 4) if r.total else 0,
            "avg_brier": round(float(r.avg_brier), 4) if r.avg_brier else None,
        }
        for r in rows
    ]


@router.get("/visitors")
async def visitor_stats(
    days: int = Query(default=30, ge=1, le=90),
    session: AsyncSession = Depends(get_db),
):
    """Anonymous visitor trend for the operations dashboard."""
    end_date = today_kst()
    start_date = end_date - timedelta(days=days - 1)

    view_rows = (await session.execute(
        select(
            VisitorDailyStat.visit_date,
            func.sum(VisitorDailyStat.page_views).label("page_views"),
        )
        .where(VisitorDailyStat.visit_date >= start_date)
        .group_by(VisitorDailyStat.visit_date)
    )).all()
    unique_rows = (await session.execute(
        select(
            VisitorDailyUnique.visit_date,
            func.count(func.distinct(VisitorDailyUnique.visitor_hash)).label("unique_visitors"),
        )
        .where(VisitorDailyUnique.visit_date >= start_date)
        .group_by(VisitorDailyUnique.visit_date)
    )).all()
    path_rows = (await session.execute(
        select(
            VisitorDailyStat.path,
            func.sum(VisitorDailyStat.page_views).label("page_views"),
        )
        .where(VisitorDailyStat.visit_date >= start_date)
        .group_by(VisitorDailyStat.path)
        .order_by(desc("page_views"))
        .limit(10)
    )).all()
    period_unique = await session.scalar(
        select(func.count(func.distinct(VisitorDailyUnique.visitor_hash)))
        .where(VisitorDailyUnique.visit_date >= start_date)
    )

    views_by_date = {row.visit_date: int(row.page_views or 0) for row in view_rows}
    uniques_by_date = {row.visit_date: int(row.unique_visitors or 0) for row in unique_rows}
    trend = [
        {
            "date": (start_date + timedelta(days=offset)).isoformat(),
            "page_views": views_by_date.get(start_date + timedelta(days=offset), 0),
            "unique_visitors": uniques_by_date.get(start_date + timedelta(days=offset), 0),
        }
        for offset in range(days)
    ]
    today = trend[-1]

    return {
        "days": days,
        "today": today,
        "period": {
            "page_views": sum(row["page_views"] for row in trend),
            "unique_visitors": int(period_unique or 0),
        },
        "trend": trend,
        "top_paths": [
            {"path": row.path, "page_views": int(row.page_views or 0)}
            for row in path_rows
        ],
    }


# ── 블로그 초안 API ────────────────────────────────────────────

@router.get("/content-drafts")
async def list_content_drafts(
    target_date: Optional[date_cls] = Query(default=None, description="조회 날짜 (기본: 오늘)"),
    session: AsyncSession = Depends(get_db),
):
    """오늘(또는 지정 날짜)의 블로그 초안 목록."""
    from app.models.content_draft import ContentDraft
    dt = target_date or today_kst()
    rows = (await session.execute(
        select(ContentDraft)
        .where(ContentDraft.source_date == dt)
        .order_by(ContentDraft.content_type)
    )).scalars().all()
    return [
        {
            "id": r.id,
            "content_type": r.content_type,
            "source_date": r.source_date.isoformat(),
            "title": r.title,
            "naver_chars": len(r.content_naver),
            "tistory_chars": len(r.content_tistory),
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


@router.get("/content-drafts/{content_type}/naver", response_class=PlainTextResponse)
async def get_draft_naver(
    content_type: str,
    target_date: Optional[date_cls] = Query(default=None),
    session: AsyncSession = Depends(get_db),
):
    """네이버 본문 plain text 반환."""
    from app.models.content_draft import ContentDraft
    dt = target_date or today_kst()
    row = (await session.execute(
        select(ContentDraft).where(
            ContentDraft.content_type == content_type.upper(),
            ContentDraft.source_date == dt,
        )
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"{content_type} draft not found for {dt}")
    return row.content_naver


@router.get("/content-drafts/{content_type}/tistory", response_class=PlainTextResponse)
async def get_draft_tistory(
    content_type: str,
    target_date: Optional[date_cls] = Query(default=None),
    session: AsyncSession = Depends(get_db),
):
    """티스토리 본문 markdown 반환."""
    from app.models.content_draft import ContentDraft
    dt = target_date or today_kst()
    row = (await session.execute(
        select(ContentDraft).where(
            ContentDraft.content_type == content_type.upper(),
            ContentDraft.source_date == dt,
        )
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"{content_type} draft not found for {dt}")
    return row.content_tistory


@router.get("/content-drafts/{content_type}/download/{platform}")
async def download_draft(
    content_type: str,
    platform: str,
    target_date: Optional[date_cls] = Query(default=None),
    session: AsyncSession = Depends(get_db),
):
    """파일 다운로드 (.txt 또는 .md)."""
    from app.models.content_draft import ContentDraft
    from fastapi.responses import Response
    dt = target_date or today_kst()
    if platform not in ("naver", "tistory"):
        raise HTTPException(status_code=400, detail="platform must be naver or tistory")
    row = (await session.execute(
        select(ContentDraft).where(
            ContentDraft.content_type == content_type.upper(),
            ContentDraft.source_date == dt,
        )
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"{content_type} draft not found for {dt}")

    content = row.content_naver if platform == "naver" else row.content_tistory
    ext = "txt" if platform == "naver" else "md"
    filename = f"{dt}_{content_type.upper()}_{platform}.{ext}"
    return Response(
        content=content.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
