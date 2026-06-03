"""Anonymous visitor analytics API.

Visitor statistics are web-only data. They are written directly to the
deployed database and must not be copied from the local crawler database.
"""

import hashlib

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import VisitorDailyStat, VisitorDailyUnique
from app.time_utils import today_kst

router = APIRouter(prefix="/analytics", tags=["analytics"])


class VisitRequest(BaseModel):
    visitor_id: str = Field(min_length=8, max_length=128)
    path: str = Field(default="/", max_length=255)


def _normalize_path(path: str) -> str:
    clean = path.split("?", 1)[0].split("#", 1)[0].strip()
    return ("/" + clean.lstrip("/"))[:255] or "/"


@router.post("/visit", status_code=status.HTTP_204_NO_CONTENT)
async def record_visit(
    payload: VisitRequest,
    session: AsyncSession = Depends(get_db),
) -> Response:
    """Record a page view and one daily unique visit per browser and path."""
    visit_date = today_kst()
    path = _normalize_path(payload.path)
    visitor_hash = hashlib.sha256(payload.visitor_id.encode("utf-8")).hexdigest()

    unique_stmt = (
        insert(VisitorDailyUnique)
        .values(visit_date=visit_date, path=path, visitor_hash=visitor_hash)
        .on_conflict_do_nothing(
            constraint="uq_visitor_daily_uniques_date_path_hash",
        )
        .returning(VisitorDailyUnique.id)
    )
    is_new_unique = (await session.execute(unique_stmt)).scalar_one_or_none() is not None

    stat_stmt = (
        insert(VisitorDailyStat)
        .values(
            visit_date=visit_date,
            path=path,
            page_views=1,
            unique_visitors=int(is_new_unique),
        )
        .on_conflict_do_update(
            constraint="uq_visitor_daily_stats_date_path",
            set_={
                "page_views": VisitorDailyStat.page_views + 1,
                "unique_visitors": VisitorDailyStat.unique_visitors + int(is_new_unique),
                "updated_at": func.now(),
            },
        )
    )
    await session.execute(stat_stmt)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
