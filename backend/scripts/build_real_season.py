"""
실데이터 시즌 부트스트랩 (외부망 필요).

KBO 공식 사이트에서 실제 경기 일정/결과 + 투수 성적을 수집하고,
실제 결과를 시간순으로 리플레이해 ELO 레이팅/히스토리를 산출한다.
마지막으로 오늘 경기 예측을 생성한다.

사용:
  python -m scripts.build_real_season                 # 3월~당월
  python -m scripts.build_real_season --start-month 3 --end-month 5
"""

import argparse
import asyncio
import logging
from datetime import date

from sqlalchemy import delete, select

from app.database import AsyncSessionLocal
from app.engine import elo as elo_engine
from app.engine.predictor import predict_today
from app.models import EloHistory, Game, Team
from app.scheduler.tasks import crawl_schedule_month, task_crawl_statiz, task_crawl_batters, task_crawl_standings
from app.sync import sync_full

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger("build_real_season")

# 팀 메타데이터 (ELO 는 실제 결과 리플레이로 산출하므로 1500 기준)
TEAMS = [
    {"code": "LG",  "name": "LG 트윈스",    "short_name": "LG",  "stadium": "잠실야구장"},
    {"code": "KIA", "name": "KIA 타이거즈",  "short_name": "KIA", "stadium": "광주기아챔피언스필드"},
    {"code": "SSG", "name": "SSG 랜더스",    "short_name": "SSG", "stadium": "인천SSG랜더스필드"},
    {"code": "SS",  "name": "삼성 라이온즈", "short_name": "삼성", "stadium": "대구삼성라이온즈파크"},
    {"code": "KT",  "name": "KT 위즈",       "short_name": "KT",  "stadium": "수원KT위즈파크"},
    {"code": "WO",  "name": "키움 히어로즈", "short_name": "키움", "stadium": "고척스카이돔"},
    {"code": "NC",  "name": "NC 다이노스",   "short_name": "NC",  "stadium": "창원NC파크"},
    {"code": "OB",  "name": "두산 베어스",   "short_name": "두산", "stadium": "잠실야구장"},
    {"code": "HH",  "name": "한화 이글스",   "short_name": "한화", "stadium": "대전한화생명볼파크"},
    {"code": "LT",  "name": "롯데 자이언츠", "short_name": "롯데", "stadium": "부산사직야구장"},
]


async def upsert_teams() -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            for t in TEAMS:
                row = (await session.execute(select(Team).where(Team.code == t["code"]))).scalar_one_or_none()
                if row is None:
                    row = Team(code=t["code"])
                    session.add(row)
                row.name = t["name"]
                row.short_name = t["short_name"]
                row.stadium = t["stadium"]
    logger.info("teams upserted: %d", len(TEAMS))


async def replay_elo() -> None:
    """전체 종료 경기를 시간순 리플레이 → ELO 레이팅/히스토리 산출."""
    async with AsyncSessionLocal() as session:
        async with session.begin():
            # 초기화
            await session.execute(delete(EloHistory))
            teams = (await session.execute(select(Team))).scalars().all()
            elo: dict[int, float] = {}
            for t in teams:
                t.elo_rating = 1500.0
                elo[t.id] = 1500.0

            stmt = (
                select(Game)
                .where(Game.status == "final", Game.home_score.is_not(None), Game.away_score.is_not(None))
                .order_by(Game.game_date, Game.start_time, Game.id)
            )
            games = (await session.execute(stmt)).scalars().all()

            processed = 0
            for g in games:
                if g.home_score == g.away_score:
                    continue  # 무승부는 ELO 미반영
                if g.home_score > g.away_score:
                    win_id, lose_id = g.home_team_id, g.away_team_id
                else:
                    win_id, lose_id = g.away_team_id, g.home_team_id

                bw, bl = elo[win_id], elo[lose_id]
                nw, nl = elo_engine.update_elo(bw, bl, g.game_date)
                elo[win_id], elo[lose_id] = nw, nl

                session.add(EloHistory(team_id=win_id, game_id=g.id, elo_before=bw, elo_after=nw,
                                       elo_change=round(nw - bw, 4), game_date=g.game_date))
                session.add(EloHistory(team_id=lose_id, game_id=g.id, elo_before=bl, elo_after=nl,
                                       elo_change=round(nl - bl, 4), game_date=g.game_date))
                processed += 1

            # 최종 ELO 반영
            for t in teams:
                t.elo_rating = round(elo[t.id], 4)

    logger.info("ELO replay done: %d games processed", processed)
    # 순위 출력
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(select(Team).order_by(Team.elo_rating.desc()))).scalars().all()
        for i, t in enumerate(rows, 1):
            logger.info("  %2d. %-4s %-12s ELO %.1f", i, t.code, t.name, t.elo_rating)


async def main(args) -> None:
    today = date.today()
    start_m = args.start_month or 3
    end_m = args.end_month or today.month

    await upsert_teams()

    total = 0
    for m in range(start_m, end_m + 1):
        n = await crawl_schedule_month(today.year, m)
        logger.info("schedule %d-%02d: %d games", today.year, m, n)
        total += n
    logger.info("total schedule rows: %d", total)

    await replay_elo()

    await task_crawl_statiz()    # 투수 성적 수집 + 저장
    await task_crawl_batters()   # 타자 성적 수집 + 저장
    await task_crawl_standings() # 팀 순위 수집 + 저장

    async with AsyncSessionLocal() as session:
        preds = await predict_today(session)
    logger.info("today predictions: %d", len(preds))

    # 전체 데이터를 Supabase로 동기화
    logger.info("Supabase 동기화 시작...")
    sync_result = await sync_full()
    synced = sum(v for v in sync_result.values() if v >= 0)
    logger.info("Supabase 동기화 완료: %d행 (%d테이블)", synced, len(sync_result))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--start-month", type=int, default=None)
    p.add_argument("--end-month", type=int, default=None)
    asyncio.run(main(p.parse_args()))
