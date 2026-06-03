"""
수집 작업 실행 이력 기록 유틸리티.

각 스케줄러 태스크를 감싸 실행 구간·결과·건수를 collection_runs에 남긴다.

사용:
    async with collection_run("crawl_statiz") as run:
        stats = await run_pitcher_stats_all_teams(year)
        run.set_rows(len(stats))   # 0건이면 자동 warning
"""

import logging
from contextlib import asynccontextmanager
from datetime import date
from typing import Optional

from app.database import AsyncSessionLocal
from app.models import CollectionRun
from app.time_utils import now_kst

logger = logging.getLogger(__name__)


def _now_naive():
    """DB DateTime 컬럼은 naive(KST)로 저장 → tzinfo 제거."""
    return now_kst().replace(tzinfo=None)


class _RunHandle:
    """진행 중 실행 핸들. set_rows / mark_warning 로 결과 갱신."""

    def __init__(self) -> None:
        self.row_count: Optional[int] = None
        self.status: Optional[str] = None  # 명시적 override
        self.error_message: Optional[str] = None

    def set_rows(self, count: int) -> None:
        self.row_count = count

    def mark_warning(self, message: str) -> None:
        self.status = "warning"
        self.error_message = message


@asynccontextmanager
async def collection_run(task_name: str, target_date: Optional[date] = None):
    """수집 태스크 실행을 collection_runs에 기록하는 컨텍스트 매니저.

    - 정상 종료 + row_count>0  → success
    - 정상 종료 + row_count==0 → warning (파싱 0건 의심)
    - 예외 발생                → failed (예외 재전파)
    """
    handle = _RunHandle()
    run_id: Optional[int] = None

    # 1. running 행 생성
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                run = CollectionRun(
                    task_name=task_name,
                    target_date=target_date,
                    status="running",
                    started_at=_now_naive(),
                )
                session.add(run)
                await session.flush()
                run_id = run.id
    except Exception:
        logger.exception("[collection_log] failed to create run row for %s", task_name)

    error: Optional[BaseException] = None
    try:
        yield handle
    except BaseException as e:  # noqa: BLE001 — 기록 후 재전파
        error = e
        handle.error_message = f"{type(e).__name__}: {e}"[:500]

    # 2. 최종 상태 결정
    if error is not None:
        final_status = "failed"
    elif handle.status == "warning":
        final_status = "warning"
    elif handle.row_count == 0:
        final_status = "warning"
    else:
        final_status = "success"

    # 3. 행 갱신
    if run_id is not None:
        try:
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    run = await session.get(CollectionRun, run_id)
                    if run:
                        run.status = final_status
                        run.row_count = handle.row_count
                        run.error_message = handle.error_message
                        run.finished_at = _now_naive()
        except Exception:
            logger.exception("[collection_log] failed to finalize run %s", task_name)

    if error is not None:
        raise error
