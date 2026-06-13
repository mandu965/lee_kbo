"""Sync polished blog draft files into local DB and web DB.

Usage:
    python scripts/sync_blog_drafts_to_db.py
    python scripts/sync_blog_drafts_to_db.py --dir outputs/blog_drafts
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import select

from app.database import AsyncSessionLocal, WebSessionLocal, has_web_db
from app.models.content_draft import ContentDraft
from app.time_utils import now_kst


FILE_RE = re.compile(r"(?P<date>\d{4}-\d{2}-\d{2})_(?P<type>TYPE_[ABC])_(?P<platform>naver|tistory)\.(?:txt|md)$")


def _extract_title(content_type: str, naver: str, tistory: str) -> str:
    for line in tistory.splitlines():
        if line.startswith("title:"):
            return line.split(":", 1)[1].strip().strip('"')
    for line in tistory.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    for line in naver.splitlines():
        if line.strip():
            return line.strip()
    return content_type


def _load_draft_pairs(draft_dir: Path) -> list[dict]:
    grouped: dict[tuple[date, str], dict[str, Path]] = {}
    for path in sorted([*draft_dir.glob("*.txt"), *draft_dir.glob("*.md")]):
        match = FILE_RE.match(path.name)
        if not match:
            continue
        source_date = date.fromisoformat(match.group("date"))
        content_type = match.group("type")
        platform = match.group("platform")
        grouped.setdefault((source_date, content_type), {})[platform] = path

    drafts = []
    for (source_date, content_type), paths in sorted(grouped.items()):
        if "naver" not in paths or "tistory" not in paths:
            print(f"SKIP {source_date} {content_type}: missing naver/tistory pair", file=sys.stderr)
            continue
        naver = paths["naver"].read_text(encoding="utf-8")
        tistory = paths["tistory"].read_text(encoding="utf-8")
        drafts.append(
            {
                "source_date": source_date,
                "content_type": content_type,
                "title": _extract_title(content_type, naver, tistory),
                "content_naver": naver,
                "content_tistory": tistory,
            }
        )
    return drafts


async def _upsert(session, draft: dict) -> None:
    existing = (
        await session.execute(
            select(ContentDraft).where(
                ContentDraft.content_type == draft["content_type"],
                ContentDraft.source_date == draft["source_date"],
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.title = draft["title"]
        existing.content_naver = draft["content_naver"]
        existing.content_tistory = draft["content_tistory"]
        existing.updated_at = now_kst()
    else:
        session.add(ContentDraft(**draft))


async def _sync_session(session_factory, label: str, drafts: list[dict]) -> int:
    async with session_factory() as session:
        async with session.begin():
            for draft in drafts:
                await _upsert(session, draft)
    print(f"{label}: synced {len(drafts)} draft pairs")
    return len(drafts)


async def main_async(args) -> int:
    draft_dir = Path(args.dir)
    if not draft_dir.exists():
        print(f"draft dir not found: {draft_dir}", file=sys.stderr)
        return 1

    drafts = _load_draft_pairs(draft_dir)
    if not drafts:
        print(f"no draft pairs found: {draft_dir}", file=sys.stderr)
        return 1

    await _sync_session(AsyncSessionLocal, "local DB", drafts)
    if has_web_db() and WebSessionLocal is not None:
        await _sync_session(WebSessionLocal, "web DB", drafts)
    else:
        print("web DB: skipped (DATABASE_WEB_URL not configured)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default="outputs/blog_drafts")
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
