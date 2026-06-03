"""Anonymous visitor analytics regression tests."""

import asyncio

from app.routers.analytics import _normalize_path
from app.sync import TABLE_UPSERT_CONFIG, WEB_ONLY_TABLES, _copy_table


def test_normalize_path_removes_query_and_fragment():
    assert _normalize_path("games/274?source=home#prediction") == "/games/274"


def test_visitor_tables_are_web_only():
    assert WEB_ONLY_TABLES == {"visitor_daily_stats", "visitor_daily_uniques"}
    assert WEB_ONLY_TABLES.isdisjoint(TABLE_UPSERT_CONFIG)


def test_sync_refuses_web_only_table_before_accessing_sessions():
    copied = asyncio.run(_copy_table(None, None, "visitor_daily_stats"))  # type: ignore[arg-type]
    assert copied == 0
