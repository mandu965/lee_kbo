"""
Supabase 동기화 유틸리티

집 PC 크롤러가 로컬 DB에 저장한 데이터를 Supabase(웹 조회 DB)로 동기화합니다.

사용 방법:
    from app.sync import sync_to_web
    await sync_to_web(tables=["games", "predictions"])

DATABASE_WEB_URL 이 설정되지 않은 경우(로컬 개발) 는 조용히 건너뜁니다.
동기화 실패는 경고 로그만 남기고 크롤 태스크를 중단시키지 않습니다.
"""

import json
import logging
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, WebSessionLocal, has_web_db

logger = logging.getLogger(__name__)

# 단일 upsert 배치당 최대 행 수 (asyncpg 파라미터 한도 32767 고려)
BATCH_ROWS = 1000

# Production-generated analytics must never be overwritten by local crawler data.
WEB_ONLY_TABLES = {"visitor_daily_stats", "visitor_daily_uniques"}

# 동기화 가능한 테이블과 ON CONFLICT 키
TABLE_UPSERT_CONFIG: dict[str, dict] = {
    "teams": {
        "conflict": "code",
        "columns": "code, name, short_name, stadium, elo_rating, created_at, updated_at",
    },
    "players": {
        "conflict": "id",
        "columns": (
            "id, team_id, name, position, kbo_player_id, injury_status, "
            "injury_updated_at, birth_date, is_active, created_at"
        ),
    },
    "games": {
        "conflict": "id",
        "columns": (
            "id, game_date, home_team_id, away_team_id, stadium, start_time, status, "
            "home_score, away_score, home_starter_id, away_starter_id, "
            "weather_temp, weather_cond, external_game_id, doubleheader_no, "
            "created_at, updated_at"
        ),
    },
    "pitcher_stats": {
        "conflict": "id",
        "columns": (
            "id, player_id, game_id, season, innings_pitched, hits, runs, earned_runs, "
            "walks, strikeouts, era, whip, is_starter, game_result, "
            "opponent_name, batters_faced, games, wins, losses, saves, holds, "
            "home_runs_allowed, hbp, created_at"
        ),
    },
    "batter_stats": {
        "conflict": "id",
        "columns": (
            "id, player_id, season, avg, games, plate_app, at_bats, runs, hits, "
            "doubles, triples, home_runs, total_bases, rbi, sac_hits, sac_flies, "
            "walks, ibb, hbp, strikeouts, slg, obp, ops, created_at, updated_at"
        ),
    },
    "team_game_stats": {
        "conflict": "team_id, game_id",
        "columns": (
            "id, team_id, game_id, is_home, runs, hits, errors, team_avg, team_ops, "
            "at_bats, walks, strikeouts, home_runs, created_at"
        ),
    },
    "game_lineups": {
        "conflict": "game_id, team_id, bat_order, player_name",
        "columns": (
            "id, game_id, team_id, player_id, player_name, player_code, bat_order, "
            "position, is_starter, is_confirmed, updated_at"
        ),
    },
    "elo_history": {
        "conflict": "id",
        "columns": "id, team_id, game_id, elo_before, elo_after, elo_change, game_date, created_at",
    },
    "predictions": {
        "conflict": "game_id",
        "columns": (
            "id, game_id, home_win_prob, away_win_prob, predicted_winner_id, "
            "actual_winner_id, is_correct, elo_diff, pitcher_score_home, pitcher_score_away, "
            "recent_form_home, recent_form_away, model_version, brier_score, "
            "settlement_status, settled_at, created_at, updated_at"
        ),
    },
    "prediction_runs": {
        "conflict": "id",
        "columns": (
            "id, game_id, prediction_type, model_version, generated_at, published_at, "
            "is_published, home_win_prob, away_win_prob, predicted_winner_id, "
            "feature_snapshot, key_factors, data_completeness, missing_features, "
            "factor_contributions, actual_winner_id, is_correct, brier_score, "
            "settlement_status, settled_at, settlement_reason"
        ),
    },
    "team_season_standings": {
        "conflict": "id",
        "columns": (
            "id, team_id, season, rank, games_played, wins, losses, draws, "
            "win_pct, games_behind, last10, streak, home_record, away_record, "
            "as_of, updated_at"
        ),
    },
}

JSON_COLUMNS: dict[str, set[str]] = {
    "prediction_runs": {
        "feature_snapshot", "key_factors", "missing_features", "factor_contributions",
    },
}

SyncTable = Literal[
    "teams", "players", "games",
    "pitcher_stats", "batter_stats", "team_game_stats", "game_lineups", "elo_history",
    "predictions", "prediction_runs", "team_season_standings",
]


async def _copy_table(
    src: AsyncSession,
    dst: AsyncSession,
    table: str,
) -> int:
    """로컬 테이블 전체를 Supabase로 UPSERT. 변경된 행 수 반환."""
    if table in WEB_ONLY_TABLES:
        logger.warning("sync: refused web-only table %s", table)
        return 0

    cfg = TABLE_UPSERT_CONFIG.get(table)
    if not cfg:
        logger.warning("sync: unknown table %s", table)
        return 0

    cols = cfg["columns"]
    conflict_key = cfg["conflict"]

    # 로컬에서 전체 조회
    rows = (await src.execute(text(f"SELECT {cols} FROM {table}"))).fetchall()
    if not rows:
        return 0

    col_list = [c.strip() for c in cols.split(",")]
    # conflict_key가 복합키("a, b")일 수 있으므로 집합으로 분리
    conflict_cols = {c.strip() for c in conflict_key.split(",")}
    placeholders = ", ".join(f":{c}" for c in col_list)
    update_set = ", ".join(
        f"{c} = EXCLUDED.{c}"
        for c in col_list
        if c not in conflict_cols
    )

    upsert_sql = text(
        f"""
        INSERT INTO {table} ({cols})
        VALUES ({placeholders})
        ON CONFLICT ({conflict_key}) DO UPDATE SET {update_set}
        """
    )

    # payload 변환 (JSON 컬럼 직렬화)
    json_columns = JSON_COLUMNS.get(table, set())
    payloads = []
    for row in rows:
        payload = dict(row._mapping)
        for column in json_columns:
            value = payload.get(column)
            if value is not None and not isinstance(value, str):
                payload[column] = json.dumps(value, ensure_ascii=False)
        payloads.append(payload)

    # asyncpg 파라미터 한도(32767) 방지를 위해 청크 단위로 실행
    col_count = max(1, len(col_list))
    chunk_size = max(1, min(BATCH_ROWS, 30000 // col_count))
    for i in range(0, len(payloads), chunk_size):
        await dst.execute(upsert_sql, payloads[i : i + chunk_size])

    return len(rows)


async def sync_to_web(
    tables: list[SyncTable] | None = None,
    silent: bool = False,
) -> dict[str, int]:
    """
    지정 테이블을 로컬 DB → Supabase로 동기화합니다.

    Args:
        tables: 동기화할 테이블 목록. None 이면 전체.
        silent: True면 성공 로그 미출력 (실패는 항상 출력).

    Returns:
        {table_name: synced_rows} 딕셔너리.
    """
    if not has_web_db():
        return {}  # DATABASE_WEB_URL 미설정 시 조용히 건너뜀

    target_tables: list[str] = tables or list(TABLE_UPSERT_CONFIG.keys())
    result: dict[str, int] = {}

    try:
        async with AsyncSessionLocal() as src, WebSessionLocal() as dst:  # type: ignore[union-attr]
            async with dst.begin():
                for table in target_tables:
                    try:
                        count = await _copy_table(src, dst, table)
                        result[table] = count
                        if not silent:
                            logger.info("[sync] %s → Supabase: %d rows", table, count)
                    except Exception as e:
                        logger.warning("[sync] %s failed: %s", table, e)
                        result[table] = -1

                # sync 후 SERIAL 시퀀스를 최대 id로 재설정 (직접 INSERT로 인한 어긋남 방지)
                seq_tables = [t for t in target_tables if t in _SEQUENCE_TABLES]
                if seq_tables:
                    for tbl in seq_tables:
                        try:
                            await dst.execute(text(
                                f"SELECT setval(pg_get_serial_sequence('{tbl}','id'),"
                                f"COALESCE((SELECT MAX(id) FROM {tbl}),1))"
                            ))
                        except Exception as e:
                            logger.warning("[sync] sequence reset failed for %s: %s", tbl, e)
    except Exception as e:
        logger.warning("[sync] Supabase connection failed: %s", e)

    return result


# 시퀀스 자동 재설정이 필요한 테이블 (SERIAL PK 있는 것)
_SEQUENCE_TABLES = {
    "games", "players", "pitcher_stats", "batter_stats",
    "elo_history", "predictions", "prediction_runs",
    "team_season_standings", "game_lineups", "team_game_stats", "collection_runs",
}


# ── 태스크별 편의 함수 ────────────────────────────────────────────

async def sync_after_schedule() -> None:
    await sync_to_web(["teams", "games"], silent=True)


async def sync_after_lineup() -> None:
    await sync_to_web(["players", "games", "game_lineups"], silent=True)


async def sync_after_results() -> None:
    await sync_to_web(["games", "elo_history"], silent=True)


async def sync_after_predictions() -> None:
    await sync_to_web(["predictions", "prediction_runs"], silent=True)


async def sync_after_stats() -> None:
    await sync_to_web(["players", "pitcher_stats", "batter_stats"], silent=True)


async def sync_after_game_records() -> None:
    await sync_to_web(["players", "team_game_stats", "game_lineups"], silent=True)


async def sync_after_standings() -> None:
    await sync_to_web(["team_season_standings"], silent=True)


async def sync_after_elo() -> None:
    await sync_to_web(["teams", "elo_history"], silent=True)


async def sync_after_settle() -> None:
    await sync_to_web(["predictions", "prediction_runs"], silent=True)


async def sync_full() -> dict[str, int]:
    """전체 테이블 전량 동기화 (build_real_season, 초기 세팅 시 사용)."""
    return await sync_to_web(silent=False)
