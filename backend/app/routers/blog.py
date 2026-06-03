from datetime import date as date_cls

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.content_draft import ContentDraft

router = APIRouter(prefix="/blog", tags=["blog"])

_SLUG_TO_DB = {"type-a": "TYPE_A", "type-b": "TYPE_B", "type-c": "TYPE_C"}
_DB_TO_LABEL = {
    "TYPE_A": "오늘의 경기 예측",
    "TYPE_B": "KBO ELO 팀 순위 분석",
    "TYPE_C": "예측 적중률 주간 리포트",
}


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        end = text.find("---", 3)
        if end != -1:
            return text[end + 3:].lstrip("\n")
    return text


@router.get("/posts")
async def list_posts(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    session: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * limit
    base_stmt = select(ContentDraft).order_by(
        desc(ContentDraft.source_date), ContentDraft.content_type
    )
    total = await session.scalar(select(func.count()).select_from(base_stmt.subquery()))
    rows = (await session.execute(base_stmt.offset(offset).limit(limit))).scalars().all()
    return {
        "total": total or 0,
        "page": page,
        "limit": limit,
        "posts": [
            {
                "date": r.source_date.isoformat(),
                "slug": r.content_type.lower().replace("_", "-"),
                "title": r.title,
                "category": _DB_TO_LABEL.get(r.content_type, r.content_type),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.get("/posts/{post_date}/{slug}")
async def get_post(
    post_date: date_cls,
    slug: str,
    session: AsyncSession = Depends(get_db),
):
    db_type = _SLUG_TO_DB.get(slug.lower())
    if not db_type:
        raise HTTPException(status_code=404, detail="Invalid content type")
    row = (
        await session.execute(
            select(ContentDraft).where(
                ContentDraft.source_date == post_date,
                ContentDraft.content_type == db_type,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    return {
        "date": row.source_date.isoformat(),
        "slug": row.content_type.lower().replace("_", "-"),
        "title": row.title,
        "category": _DB_TO_LABEL.get(row.content_type, row.content_type),
        "content": _strip_frontmatter(row.content_tistory),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
