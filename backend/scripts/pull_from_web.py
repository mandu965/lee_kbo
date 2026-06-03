"""
Supabase(웹 DB) → 로컬 Docker DB 역방향 이관 스크립트

사용법:
  docker exec kbo_api python -m scripts.pull_from_web
  docker exec kbo_api python -m scripts.pull_from_web --tables teams games predictions
"""

import argparse
import asyncio
import json
import logging
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s — %(message)s",
)
logger = logging.getLogger("pull_from_web")

# ── sync.py 와 동일한 테이블 설정 ──────────────────────────────
TABLE_UPSERT_CONFIG: dict[str, dict] = {
    "teams": {
        "conflict": "id",
        "columns": "id, code, name, short_name, stadium, elo_rating, created_at, updated_at",
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

# 외래키 순서에 맞게 이관 (부모 → 자식)
IMPORT_ORDER = [
    "teams",
    "players",
    "games",
    "pitcher_stats",
    "batter_stats",
    "team_game_stats",
    "game_lineups",
    "elo_history",
    "predictions",
    "prediction_runs",
    "team_season_standings",
]

JSON_COLUMNS: dict[str, set[str]] = {
    "prediction_runs": {
        "feature_snapshot", "key_factors", "missing_features", "factor_contributions",
    },
}

SEQUENCE_TABLES = {
    "teams", "games", "players", "pitcher_stats", "batter_stats",
    "elo_history", "predictions", "prediction_runs",
    "team_season_standings", "game_lineups", "team_game_stats",
}

# 외래키 역순 (truncate 시 자식 → 부모)
TRUNCATE_ORDER = [
    "prediction_runs",
    "predictions",
    "elo_history",
    "game_lineups",
    "team_game_stats",
    "batter_stats",
    "pitcher_stats",
    "games",
    "players",
    "team_season_standings",
    "teams",
]

BATCH_ROWS = 500


def _to_asyncpg(url: str) -> str:
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


async def pull_table(src_session, dst_session, table: str) -> int:
    cfg = TABLE_UPSERT_CONFIG[table]
    cols = cfg["columns"]
    conflict_key = cfg["conflict"]

    rows = (await src_session.execute(text(f"SELECT {cols} FROM {table}"))).fetchall()
    if not rows:
        logger.info("  %s: 0 rows (skipped)", table)
        return 0

    col_list = [c.strip() for c in cols.split(",")]
    conflict_cols = {c.strip() for c in conflict_key.split(",")}
    placeholders = ", ".join(f":{c}" for c in col_list)
    update_set = ", ".join(
        f"{c} = EXCLUDED.{c}" for c in col_list if c not in conflict_cols
    )

    upsert_sql = text(
        f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) "
        f"ON CONFLICT ({conflict_key}) DO UPDATE SET {update_set}"
    )

    json_cols = JSON_COLUMNS.get(table, set())
    payloads = []
    for row in rows:
        payload = dict(row._mapping)
        for col in json_cols:
            val = payload.get(col)
            if val is not None and not isinstance(val, str):
                payload[col] = json.dumps(val, ensure_ascii=False)
        payloads.append(payload)

    col_count = max(1, len(col_list))
    chunk_size = max(1, min(BATCH_ROWS, 30000 // col_count))
    for i in range(0, len(payloads), chunk_size):
        await dst_session.execute(upsert_sql, payloads[i: i + chunk_size])

    logger.info("  %-24s %d rows", table, len(rows))
    return len(rows)


async def main(tables: list[str]) -> None:
    web_url = os.getenv("DATABASE_WEB_URL", "").strip()
    local_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://kbo:kbopass@db:5432/kbo_predictor").strip()

    if not web_url:
        logger.error("DATABASE_WEB_URL 이 설정되지 않았습니다. .env 파일을 확인하세요.")
        sys.exit(1)

    web_url = _to_asyncpg(web_url)
    local_url = _to_asyncpg(local_url)

    logger.info("소스(Supabase): %s", web_url.split("@")[-1])
    logger.info("대상(로컬 Docker): %s", local_url.split("@")[-1])
    logger.info("이관 테이블: %s", ", ".join(tables))

    src_engine = create_async_engine(web_url, pool_pre_ping=True, connect_args={"ssl": False})
    dst_engine = create_async_engine(local_url, pool_pre_ping=True, connect_args={"ssl": False})

    SrcSession = async_sessionmaker(src_engine, expire_on_commit=False)
    DstSession = async_sessionmaker(dst_engine, expire_on_commit=False)

    total = 0
    async with SrcSession() as src, DstSession() as dst:
        async with dst.begin():
            # 기존 로컬 데이터 삭제 (외래키 역순, 이관 대상 테이블만)
            tables_set = set(tables)
            to_truncate = [t for t in TRUNCATE_ORDER if t in tables_set]
            if to_truncate:
                logger.info("로컬 데이터 초기화 중...")
                for tbl in to_truncate:
                    await dst.execute(text(f"TRUNCATE TABLE {tbl} CASCADE"))
                    logger.info("  TRUNCATE %s", tbl)

            # Supabase → 로컬 이관
            logger.info("이관 시작...")
            for table in tables:
                try:
                    n = await pull_table(src, dst, table)
                    total += n
                except Exception as e:
                    logger.error("  %-24s FAILED: %s", table, e)

            # SERIAL 시퀀스 재설정
            for tbl in tables:
                if tbl in SEQUENCE_TABLES:
                    try:
                        await dst.execute(text(
                            f"SELECT setval(pg_get_serial_sequence('{tbl}','id'),"
                            f"COALESCE((SELECT MAX(id) FROM {tbl}),1))"
                        ))
                    except Exception:
                        pass

    logger.info("완료: 총 %d 행 이관됨", total)
    await src_engine.dispose()
    await dst_engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Supabase → 로컬 DB 역방향 이관")
    parser.add_argument(
        "--tables", nargs="+",
        default=IMPORT_ORDER,
        choices=list(TABLE_UPSERT_CONFIG.keys()),
        help="이관할 테이블 목록 (기본: 전체)",
    )
    args = parser.parse_args()
    asyncio.run(main(args.tables))
