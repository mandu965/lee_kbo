"""
PostgreSQL advisory lock 기반 분산 락.

같은 배치 작업이 동시에 두 번 실행되는 것을 방지한다.
(자정 통합 배치 + 수동 실행 중첩, 또는 인스턴스 2개 이상 환경 대비)

사용:
    async with try_lock("crawl_results:2026-05-31") as acquired:
        if not acquired:
            logger.info("skipped: lock held")
            return
        ...작업...
"""

import hashlib
import logging
from contextlib import asynccontextmanager

from sqlalchemy import text

from app.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


def _lock_key(name: str) -> int:
    """문자열 → 64bit 정수 키 (advisory lock 인자)."""
    h = hashlib.sha256(name.encode()).digest()[:8]
    # signed 64bit 범위로 변환
    val = int.from_bytes(h, "big", signed=True)
    return val


@asynccontextmanager
async def try_lock(name: str):
    """비차단 advisory lock. 획득 성공 시 True, 이미 점유 시 False.

    별도 세션에서 세션 수준 락을 잡고, 종료 시 해제한다.
    """
    key = _lock_key(name)
    session = AsyncSessionLocal()
    acquired = False
    try:
        result = await session.execute(
            text("SELECT pg_try_advisory_lock(:k)"), {"k": key}
        )
        acquired = bool(result.scalar())
        yield acquired
    finally:
        try:
            if acquired:
                await session.execute(
                    text("SELECT pg_advisory_unlock(:k)"), {"k": key}
                )
                await session.commit()
        except Exception:
            logger.warning("[lock] failed to release advisory lock for %s", name)
        finally:
            await session.close()
