"""
스케줄러 실행 태스크 — 크롤러 호출 + DB 저장
"""

import json
import logging
import os
import random
import re
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx
from jinja2 import Environment, FileSystemLoader
from sqlalchemy import select, func, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, WebSessionLocal, has_web_db
from app.models import BatterStat, EloHistory, Game, GameLineup, PitcherStat, Player, Prediction, PredictionRun, Team, TeamGameStat, TeamSeasonStandings
from app.crawler.kbo_schedule import run_schedule_crawl
from app.crawler.schemas import GameLineupData, GameScheduleData, PitcherGameLogData, PitcherStatData, TeamGameStatData
from app.crawler.kbo_pitcher import run_pitcher_game_logs, run_pitcher_stats_all_teams
from app.crawler.kbo_standings import run_standings_crawl
from app.crawler.kbo_batter import run_batter_stats_all_teams, BatterStatData
from app.crawler.naver_lineup import fetch_all_starters
from app.crawler.naver_game_record import fetch_confirmed_lineups, fetch_game_records
from app.crawler.weather import fetch_weather_for_games
from app.engine import elo as elo_engine
from app.engine.metrics import brier_score
from app.engine.predictor import predict_today
from app.sync import (
    sync_after_schedule, sync_after_lineup, sync_after_results,
    sync_after_predictions, sync_after_stats, sync_after_standings,
    sync_after_elo, sync_after_settle, sync_after_game_records,
)
from app.time_utils import today_kst, now_kst
from app.collection_log import collection_run
from app.lock import try_lock

logger = logging.getLogger(__name__)


async def _get_or_create_team(session: AsyncSession, code: str) -> Team:
    result = await session.execute(select(Team).where(Team.code == code))
    team = result.scalar_one_or_none()
    if team is None:
        team = Team(code=code, name=code)  # 이름은 초기화 후 별도 업데이트
        session.add(team)
        await session.flush()
    return team


async def _get_player_by_name(
    session: AsyncSession, name: str, team_id: int
) -> Player | None:
    result = await session.execute(
        select(Player).where(Player.name == name, Player.team_id == team_id)
    )
    return result.scalar_one_or_none()


async def _get_or_create_player(
    session: AsyncSession, name: str, team_id: int, position: str = "P"
) -> Player:
    player = await _get_player_by_name(session, name, team_id)
    if player is None:
        player = Player(name=name, team_id=team_id, position=position)
        session.add(player)
        await session.flush()
    return player


async def _upsert_pitcher_season_stat(
    session: AsyncSession, data: PitcherStatData
) -> None:
    """투수 시즌 누적 성적 1건(player_id, season, game_id=NULL)을 업서트."""
    team = await _get_or_create_team(session, data.team_code)
    player = await _get_or_create_player(session, data.player_name, team.id)
    player.kbo_player_id = data.kbo_player_id or player.kbo_player_id

    result = await session.execute(
        select(PitcherStat).where(
            PitcherStat.player_id == player.id,
            PitcherStat.season == data.season,
            PitcherStat.game_id.is_(None),
        )
    )
    stat: PitcherStat | None = result.scalar_one_or_none()
    if stat is None:
        # 시즌 집계 행은 game_id=NULL. 예측기가 선발 투수의 시즌 성적을
        # is_starter=True 조건으로 조회하므로 집계 행은 True 로 표기한다.
        stat = PitcherStat(player_id=player.id, season=data.season, is_starter=True)
        session.add(stat)

    stat.era = data.era
    stat.whip = data.whip
    stat.innings_pitched = data.innings_pitched
    stat.hits = data.hits
    stat.runs = data.runs
    stat.earned_runs = data.earned_runs
    stat.walks = data.walks
    stat.strikeouts = data.strikeouts
    stat.games = data.games
    stat.wins = data.wins
    stat.losses = data.losses
    stat.saves = data.saves
    stat.holds = data.holds
    stat.home_runs_allowed = data.home_runs_allowed
    stat.hbp = data.hbp


async def _find_game_for_pitcher_log(
    session: AsyncSession, team_id: int, data: PitcherGameLogData
) -> Game | None:
    result = await session.execute(
        select(Game).where(
            Game.game_date == data.game_date,
            (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
        )
    )
    matches: list[Game] = []
    for game in result.scalars().all():
        opponent_id = game.away_team_id if game.home_team_id == team_id else game.home_team_id
        opponent = await session.get(Team, opponent_id)
        if opponent and data.opponent_name in {opponent.name, opponent.short_name}:
            matches.append(game)
    # KBO 일자별 표에는 더블헤더 차수가 없어 모호한 로그는 저장하지 않는다.
    return matches[0] if len(matches) == 1 else None


async def _upsert_pitcher_game_log(
    session: AsyncSession, data: PitcherGameLogData
) -> bool:
    player = (
        await session.execute(select(Player).where(Player.kbo_player_id == data.kbo_player_id))
    ).scalar_one_or_none()
    if player is None or player.team_id is None:
        return False
    game = await _find_game_for_pitcher_log(session, player.team_id, data)
    if game is None:
        return False
    stat = (
        await session.execute(
            select(PitcherStat).where(
                PitcherStat.player_id == player.id,
                PitcherStat.game_id == game.id,
            )
        )
    ).scalar_one_or_none()
    if stat is None:
        stat = PitcherStat(player_id=player.id, game_id=game.id, season=data.game_date.year)
        session.add(stat)
    stat.is_starter = data.role == "선발"
    stat.game_result = data.game_result
    stat.opponent_name = data.opponent_name
    stat.batters_faced = data.batters_faced
    stat.innings_pitched = data.innings_pitched
    stat.hits = data.hits
    stat.home_runs_allowed = data.home_runs_allowed
    stat.walks = data.walks
    stat.hbp = data.hbp
    stat.strikeouts = data.strikeouts
    stat.runs = data.runs
    stat.earned_runs = data.earned_runs
    stat.era = data.era
    return True


async def _upsert_game(session: AsyncSession, data: GameScheduleData) -> None:
    home_team = await _get_or_create_team(session, data.home_team_code)
    away_team = await _get_or_create_team(session, data.away_team_code)

    # external_game_id 우선 조회 → 없으면 날짜+팀+더블헤더차수
    game: Game | None = None
    if data.external_game_id:
        result = await session.execute(
            select(Game).where(Game.external_game_id == data.external_game_id)
        )
        game = result.scalar_one_or_none()

    if game is None:
        result = await session.execute(
            select(Game).where(
                Game.game_date == data.game_date,
                Game.home_team_id == home_team.id,
                Game.away_team_id == away_team.id,
                Game.doubleheader_no == data.doubleheader_no,
            )
        )
        game = result.scalar_one_or_none()

    if game is None:
        game = Game(
            game_date=data.game_date,
            home_team_id=home_team.id,
            away_team_id=away_team.id,
            doubleheader_no=data.doubleheader_no,
        )
        session.add(game)

    if data.external_game_id:
        game.external_game_id = data.external_game_id
    # 더블헤더 번호는 0→양수 방향으로만 갱신 (재수집 시 0으로 덮어쓰지 않음)
    if data.doubleheader_no > 0 or game.doubleheader_no == 0:
        game.doubleheader_no = data.doubleheader_no

    game.start_time = data.start_time
    game.stadium = data.stadium
    game.status = data.status
    game.home_score = data.home_score
    game.away_score = data.away_score

    # 선발 투수 (이름 → Player 조회)
    if data.home_starter_name:
        starter = await _get_player_by_name(session, data.home_starter_name, home_team.id)
        if starter:
            game.home_starter_id = starter.id

    if data.away_starter_name:
        starter = await _get_player_by_name(session, data.away_starter_name, away_team.id)
        if starter:
            game.away_starter_id = starter.id


async def _upsert_team_game_stat(session: AsyncSession, data: TeamGameStatData) -> bool:
    game = (
        await session.execute(select(Game).where(Game.external_game_id == data.external_game_id))
    ).scalar_one_or_none()
    if game is None:
        return False
    team_id = game.home_team_id if data.side == "home" else game.away_team_id
    stat = (
        await session.execute(
            select(TeamGameStat).where(TeamGameStat.game_id == game.id, TeamGameStat.team_id == team_id)
        )
    ).scalar_one_or_none()
    if stat is None:
        stat = TeamGameStat(game_id=game.id, team_id=team_id, is_home=data.side == "home")
        session.add(stat)
    stat.runs = data.runs
    stat.hits = data.hits
    stat.at_bats = data.at_bats
    stat.walks = data.walks
    stat.strikeouts = data.strikeouts
    stat.home_runs = data.home_runs
    stat.team_avg = data.team_avg
    stat.team_ops = data.team_ops
    return True


async def _upsert_game_lineup(session: AsyncSession, data: GameLineupData) -> bool:
    game = (
        await session.execute(select(Game).where(Game.external_game_id == data.external_game_id))
    ).scalar_one_or_none()
    if game is None:
        return False
    team_id = game.home_team_id if data.side == "home" else game.away_team_id
    player = await _get_player_by_name(session, data.player_name, team_id)
    if player is None:
        player = await _get_or_create_player(session, data.player_name, team_id, "H")
    player.kbo_player_id = player.kbo_player_id or data.player_code
    lineup = (
        await session.execute(
            select(GameLineup).where(
                GameLineup.game_id == game.id,
                GameLineup.team_id == team_id,
                GameLineup.bat_order == data.bat_order,
                GameLineup.player_name == data.player_name,
            )
        )
    ).scalar_one_or_none()
    if lineup is None:
        lineup = GameLineup(
            game_id=game.id,
            team_id=team_id,
            player_name=data.player_name,
            bat_order=data.bat_order,
        )
        session.add(lineup)
    lineup.player_id = player.id
    lineup.player_code = data.player_code
    lineup.position = data.position
    lineup.is_starter = data.is_starter
    lineup.is_confirmed = data.is_confirmed
    return True


# ─────────────────────────────────────────────────────────────
# 스케줄러에 등록될 태스크 함수들
# ─────────────────────────────────────────────────────────────

async def crawl_schedule_month(year: int, month: int) -> int:
    """지정한 연·월의 전체 경기 일정/결과를 수집해 DB에 업서트. 처리한 경기 수 반환."""
    games = await run_schedule_crawl(year, month)
    async with AsyncSessionLocal() as session:
        async with session.begin():
            for g in games:
                await _upsert_game(session, g)
    return len(games)


async def task_crawl_schedule(year: int | None = None, month: int | None = None) -> None:
    """매일 06:00 — 경기 일정 수집 (기본: 당월). year/month 지정 시 해당 월."""
    today = today_kst()
    y, m = year or today.year, month or today.month
    logger.info("[scheduler] crawl_schedule start: %d-%02d", y, m)
    try:
        async with collection_run("crawl_schedule", date(y, m, 1)) as run:
            n = await crawl_schedule_month(y, m)
            run.set_rows(n)
            logger.info("[scheduler] crawl_schedule done: %d games", n)
            await sync_after_schedule()
    except Exception:
        logger.exception("[scheduler] crawl_schedule failed")


async def task_crawl_results(target_date: date | None = None) -> None:
    """경기 결과 업데이트. 기본값은 당일이며 자정 배치에서는 전날을 지정한다."""
    target = target_date or today_kst()
    logger.info("[scheduler] crawl_results start: %s", target)
    try:
        async with collection_run("crawl_results", target) as run:
            games = await run_schedule_crawl(target.year, target.month)
            finished = [g for g in games if g.game_date == target and g.status == "final"]
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    for g in finished:
                        await _upsert_game(session, g)
            run.set_rows(len(finished))
            logger.info("[scheduler] crawl_results done: %d finished games", len(finished))
            await sync_after_results()
    except Exception:
        logger.exception("[scheduler] crawl_results failed")


async def task_crawl_game_records(target_date: date | None = None, backfill: bool = False) -> None:
    """종료 경기의 팀 타격 박스스코어와 관측 타순을 저장."""
    target = target_date or (today_kst() - timedelta(days=1))
    logger.info("[scheduler] crawl_game_records start: target=%s backfill=%s", target, backfill)
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(Game).where(Game.status == "final", Game.external_game_id.is_not(None))
            if not backfill:
                stmt = stmt.where(Game.game_date == target)
            games = (await session.execute(stmt)).scalars().all()
        game_ids = [game.external_game_id for game in games if game.external_game_id]
        stats, lineups = await fetch_game_records(game_ids)
        async with AsyncSessionLocal() as session:
            async with session.begin():
                stat_count = sum([int(await _upsert_team_game_stat(session, stat)) for stat in stats])
                lineup_count = sum([int(await _upsert_game_lineup(session, lineup)) for lineup in lineups])
        logger.info(
            "[scheduler] crawl_game_records done: %d games, %d team stats, %d lineups",
            len(game_ids), stat_count, lineup_count,
        )
        await sync_after_game_records()
    except Exception:
        logger.exception("[scheduler] crawl_game_records failed")


async def task_crawl_statiz(*, include_details: bool = True) -> None:
    """매일 07:00 — 전 팀 투수 시즌 성적 수집 (KBO 공식) 후 DB 저장."""
    year = today_kst().year
    logger.info(
        "[scheduler] crawl_pitcher_stats start: %d include_details=%s",
        year,
        include_details,
    )
    try:
        async with collection_run("crawl_statiz") as run:
            stats = await run_pitcher_stats_all_teams(year)
            if include_details:
                logs, injuries = await run_pitcher_game_logs(stats, year)
            else:
                logs, injuries = [], {}
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    for s in stats:
                        await _upsert_pitcher_season_stat(session, s)
                    saved_logs = 0
                    for log in logs:
                        saved_logs += int(await _upsert_pitcher_game_log(session, log))
                    if include_details:
                        players = (
                            await session.execute(
                                select(Player).where(Player.kbo_player_id.is_not(None))
                            )
                        ).scalars().all()
                        for player in players:
                            player.injury_status = injuries.get(player.kbo_player_id)
                            player.injury_updated_at = now_kst()
            run.set_rows(len(stats))
            logger.info(
                "[scheduler] crawl_pitcher_stats done: %d season rows, %d game logs saved",
                len(stats), saved_logs,
            )
            await sync_after_stats()
    except Exception:
        logger.exception("[scheduler] crawl_pitcher_stats failed")


async def task_crawl_weather() -> None:
    """매일 12:00 — 당일 경기 날씨 수집."""
    today = today_kst()
    logger.info("[scheduler] crawl_weather start: %s", today)
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Game).where(
                    Game.game_date == today,
                    Game.status == "scheduled",
                )
            )
            games = result.scalars().all()

        targets = [(g.stadium, g.game_date) for g in games if g.stadium]
        weather_map = await fetch_weather_for_games(targets)

        async with AsyncSessionLocal() as session:
            async with session.begin():
                for g in games:
                    key = (g.stadium, g.game_date)
                    wd = weather_map.get(key)
                    if wd:
                        g.weather_temp = wd.temperature
                        g.weather_cond = wd.condition
                        session.add(g)

        logger.info("[scheduler] crawl_weather done: %d games updated", len(weather_map))
        await sync_after_schedule()  # 날씨 업데이트 후 games 동기화
    except Exception:
        logger.exception("[scheduler] crawl_weather failed")


async def task_update_predictions() -> None:
    """매일 15:00 (라인업 확정 후) — 오늘 경기 예측 생성/갱신."""
    logger.info("[scheduler] update_predictions start")
    try:
        async with AsyncSessionLocal() as session:
            results = await predict_today(session)
        logger.info("[scheduler] update_predictions done: %d games predicted", len(results))
        await sync_after_predictions()
    except Exception:
        logger.exception("[scheduler] update_predictions failed")


async def task_update_elo() -> None:
    """매일 자정 00:00 — 전날 경기 결과로 ELO 업데이트."""
    yesterday = today_kst() - timedelta(days=1)
    logger.info("[scheduler] update_elo start: %s", yesterday)
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                stmt = select(Game).where(
                    Game.game_date == yesterday,
                    Game.status == "final",
                    Game.home_score.is_not(None),
                ).order_by(Game.id).with_for_update()
                games = (await session.execute(stmt)).scalars().all()
                processed = 0

                for game in games:
                    if game.home_score is None or game.away_score is None:
                        continue
                    already_processed = await session.scalar(
                        select(EloHistory.id).where(EloHistory.game_id == game.id).limit(1)
                    )
                    if already_processed:
                        continue

                    home_team: Team | None = await session.get(Team, game.home_team_id)
                    away_team: Team | None = await session.get(Team, game.away_team_id)
                    if not home_team or not away_team:
                        continue

                    if game.home_score > game.away_score:
                        winner, loser = home_team, away_team
                        home_won = True
                    elif game.away_score > game.home_score:
                        winner, loser = away_team, home_team
                        home_won = False
                    else:
                        continue  # 무승부 (KBO 는 드물지만 발생)

                    elo_before_w = winner.elo_rating
                    elo_before_l = loser.elo_rating
                    new_w, new_l = elo_engine.update_elo(elo_before_w, elo_before_l, game.game_date)

                    winner.elo_rating = new_w
                    loser.elo_rating = new_l

                    # 홈/원정 분리 ELO 업데이트
                    # 홈팀 home_elo vs 원정팀 away_elo 기준으로 별도 계산
                    home_elo_before = home_team.home_elo
                    away_elo_before = away_team.away_elo
                    if home_won:
                        new_home, new_away = elo_engine.update_elo(home_elo_before, away_elo_before, game.game_date)
                    else:
                        new_away, new_home = elo_engine.update_elo(away_elo_before, home_elo_before, game.game_date)
                    home_team.home_elo = new_home
                    away_team.away_elo = new_away

                    # ELO 변동 히스토리 기록
                    session.add(EloHistory(
                        team_id=winner.id, game_id=game.id,
                        elo_before=elo_before_w, elo_after=new_w,
                        elo_change=round(new_w - elo_before_w, 4),
                        game_date=game.game_date,
                    ))
                    session.add(EloHistory(
                        team_id=loser.id, game_id=game.id,
                        elo_before=elo_before_l, elo_after=new_l,
                        elo_change=round(new_l - elo_before_l, 4),
                        game_date=game.game_date,
                    ))
                    processed += 1

        logger.info("[scheduler] update_elo done: %d/%d games processed", processed, len(games))
        await sync_after_elo()
    except Exception:
        logger.exception("[scheduler] update_elo failed")


async def _settle_one(
    session: AsyncSession,
    game: Game,
) -> str:
    """경기 1건 정산. 반환값: settled / draw / cancelled / skip."""
    # 취소/무승부 처리
    if game.status == "cancelled":
        status = "cancelled"
        reason = "경기 취소"
    elif game.home_score == game.away_score:
        status = "draw"
        reason = "무승부"
    elif game.home_score is None or game.away_score is None:
        return "skip"
    else:
        # 실제 승자 결정
        if game.home_score > game.away_score:
            winner_id = game.home_team_id
        else:
            winner_id = game.away_team_id

        status = "settled"
        reason = None

        # predictions 캐시 정산
        pred: Prediction | None = (
            await session.execute(
                select(Prediction).where(Prediction.game_id == game.id)
            )
        ).scalar_one_or_none()
        home_won = winner_id == game.home_team_id
        if pred and pred.settlement_status != "settled":
            pred.actual_winner_id = winner_id
            pred.is_correct = (pred.predicted_winner_id == winner_id)
            pred.brier_score = brier_score(pred.home_win_prob, home_won)
            pred.settlement_status = "settled"
            pred.settled_at = now_kst()

        # prediction_runs 미정산 스냅샷 일괄 정산
        runs = (
            await session.execute(
                select(PredictionRun).where(
                    PredictionRun.game_id == game.id,
                    PredictionRun.settlement_status == "unsettled",
                    PredictionRun.is_published == True,
                )
            )
        ).scalars().all()
        for run in runs:
            run.actual_winner_id = winner_id
            run.is_correct = (run.predicted_winner_id == winner_id)
            run.brier_score = brier_score(run.home_win_prob, home_won)
            run.settlement_status = "settled"
            run.settled_at = now_kst()

        return "settled"

    # 취소/무승부: predictions + runs 상태만 갱신
    pred = (
        await session.execute(
            select(Prediction).where(Prediction.game_id == game.id)
        )
    ).scalar_one_or_none()
    if pred:
        pred.settlement_status = status
        pred.settled_at = now_kst()
        if reason:
            pass  # reason 필드 없으므로 status로 충분

    runs = (
        await session.execute(
            select(PredictionRun).where(
                PredictionRun.game_id == game.id,
                PredictionRun.settlement_status == "unsettled",
            )
        )
    ).scalars().all()
    for run in runs:
        run.settlement_status = status
        run.settlement_reason = reason
        run.settled_at = now_kst()

    return status


async def task_settle_results(target_date: date | None = None) -> None:
    """경기 결과 정산 — 종료 경기의 actual_winner, is_correct, brier_score 를 채운다.

    target_date 미지정 시 당일 종료 경기를 처리 (23:50 스케줄러 기준).
    정산은 멱등: 이미 settled 된 경기는 건너뜀.
    """
    tgt = target_date or today_kst()
    logger.info("[scheduler] settle_results start: %s", tgt)
    counts = {"settled": 0, "draw": 0, "cancelled": 0, "skip": 0}
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                stmt = select(Game).where(
                    Game.game_date == tgt,
                    Game.status.in_(["final", "cancelled"]),
                )
                games = (await session.execute(stmt)).scalars().all()
                for g in games:
                    result = await _settle_one(session, g)
                    counts[result] = counts.get(result, 0) + 1

        logger.info(
            "[scheduler] settle_results done: settled=%d draw=%d cancelled=%d skip=%d",
            counts["settled"], counts["draw"], counts["cancelled"], counts["skip"],
        )
        await sync_after_settle()
    except Exception:
        logger.exception("[scheduler] settle_results failed")


async def task_crawl_standings() -> None:
    """매일 07:30 — 팀 순위/시즌 성적 수집."""
    logger.info("[scheduler] crawl_standings start")
    try:
        async with collection_run("crawl_standings") as run:
            rows = await run_standings_crawl()
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    season = today_kst().year
                    for row in rows:
                        team = (await session.execute(
                            select(Team).where(Team.code == row.team_code)
                        )).scalar_one_or_none()
                        if team is None:
                            continue
                        st = (await session.execute(
                            select(TeamSeasonStandings).where(
                                TeamSeasonStandings.team_id == team.id,
                                TeamSeasonStandings.season == season,
                            )
                        )).scalar_one_or_none()
                        if st is None:
                            st = TeamSeasonStandings(team_id=team.id, season=season)
                            session.add(st)
                        st.rank = row.rank
                        st.games_played = row.games_played
                        st.wins = row.wins
                        st.losses = row.losses
                        st.draws = row.draws
                        st.win_pct = row.win_pct
                        st.games_behind = row.games_behind
                        st.last10 = row.last10
                        st.streak = row.streak
                        st.home_record = row.home_record
                        st.away_record = row.away_record
                        st.as_of = row.as_of
            run.set_rows(len(rows))
            logger.info("[scheduler] crawl_standings done: %d teams", len(rows))
            await sync_after_standings()
    except Exception:
        logger.exception("[scheduler] crawl_standings failed")


async def _upsert_batter_season_stat(
    session: AsyncSession, data: BatterStatData
) -> None:
    team = await _get_or_create_team(session, data.team_code)
    player = await _get_or_create_player(session, data.player_name, team.id, position="H")

    result = await session.execute(
        select(BatterStat).where(
            BatterStat.player_id == player.id,
            BatterStat.season == data.season,
        )
    )
    stat: BatterStat | None = result.scalar_one_or_none()
    if stat is None:
        stat = BatterStat(player_id=player.id, season=data.season)
        session.add(stat)

    stat.avg = data.avg
    stat.games = data.games
    stat.plate_app = data.plate_app
    stat.at_bats = data.at_bats
    stat.runs = data.runs
    stat.hits = data.hits
    stat.doubles = data.doubles
    stat.triples = data.triples
    stat.home_runs = data.home_runs
    stat.total_bases = data.total_bases
    stat.rbi = data.rbi
    stat.sac_hits = data.sac_hits
    stat.sac_flies = data.sac_flies
    stat.walks = data.walks
    stat.ibb = data.ibb
    stat.hbp = data.hbp
    stat.strikeouts = data.strikeouts
    stat.slg = data.slg
    stat.obp = data.obp
    stat.ops = data.ops


async def task_crawl_batters() -> None:
    """매일 07:15 — 타자 시즌 성적 수집."""
    year = today_kst().year
    logger.info("[scheduler] crawl_batter_stats start: %d", year)
    try:
        async with collection_run("crawl_batters") as run:
            stats = await run_batter_stats_all_teams(year)
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    for s in stats:
                        await _upsert_batter_season_stat(session, s)
            run.set_rows(len(stats))
            logger.info("[scheduler] crawl_batter_stats done: %d rows", len(stats))
            await sync_after_stats()
    except Exception:
        logger.exception("[scheduler] crawl_batter_stats failed")


async def task_crawl_lineup() -> None:
    """매일 14:00 — 당일 경기 선발투수 수집 (네이버 스포츠).

    네이버 API: GET api-gw.sports.naver.com/schedule/games/{naverGameId}
    homeStarterName / awayStarterName 필드 → DB Game.home_starter_id / away_starter_id 갱신.
    KBO 공식 gameId(external_game_id)에서 naverGameId 변환: external_game_id + 시즌년도
    """
    today = today_kst()
    logger.info("[scheduler] crawl_lineup start: %s", today)
    try:
        async with AsyncSessionLocal() as session:
            # 오늘 예정 경기 중 external_game_id 있는 것
            stmt = select(Game).where(
                Game.game_date == today,
                Game.status.in_(["scheduled", "in_progress"]),
                Game.external_game_id.is_not(None),
            )
            games = (await session.execute(stmt)).scalars().all()

        if not games:
            logger.info("[scheduler] crawl_lineup: no games today")
            return

        kbo_ids = [g.external_game_id for g in games if g.external_game_id]
        starters = await fetch_all_starters(kbo_ids)

        async with AsyncSessionLocal() as session:
            async with session.begin():
                for game in games:
                    info = starters.get(game.external_game_id)
                    if not info:
                        continue

                    home_team: Team | None = await session.get(Team, game.home_team_id)
                    away_team: Team | None = await session.get(Team, game.away_team_id)

                    # 홈 선발
                    if info.home_starter_name and home_team:
                        home_player = await _get_player_by_name(session, info.home_starter_name, home_team.id)
                        if home_player is None:
                            home_player = await _get_or_create_player(
                                session, info.home_starter_name, home_team.id, "P"
                            )
                        game.home_starter_id = home_player.id

                    # 원정 선발
                    if info.away_starter_name and away_team:
                        away_player = await _get_player_by_name(session, info.away_starter_name, away_team.id)
                        if away_player is None:
                            away_player = await _get_or_create_player(
                                session, info.away_starter_name, away_team.id, "P"
                            )
                        game.away_starter_id = away_player.id

                    session.add(game)

        confirmed = sum(1 for g in games if starters.get(g.external_game_id))
        lineups = await fetch_confirmed_lineups(kbo_ids)
        if lineups:
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    for lineup in lineups:
                        await _upsert_game_lineup(session, lineup)
        logger.info("[scheduler] crawl_lineup done: %d/%d games updated", confirmed, len(games))
        await sync_after_lineup()
        if lineups:
            await task_update_predictions()
    except Exception:
        logger.exception("[scheduler] crawl_lineup failed")


async def task_midnight_batch() -> None:
    """매일 00:10 — 자정 통합 배치.

    순서:
    1. 전날 경기 결과 재확인 (미수집 방지)
    2. 전날 경기 박스스코어와 타순 스냅샷 저장
    3. 결과 정산 (is_correct, Brier Score)
    4. ELO 업데이트 (전날 경기 기준)
    5. 익일 경기 일정 크롤 (당월 전체 갱신)
    6. 투수·타자 시즌 기록과 팀 순위 갱신
    7. 예측 초안 생성 (선발 미확정 상태의 ELO 기반 초안)
    """
    today = today_kst()
    yesterday = today - timedelta(days=1)
    logger.info("[midnight_batch] start — yesterday=%s today=%s", yesterday, today)

    async with try_lock(f"midnight_batch:{today.isoformat()}") as acquired:
        if not acquired:
            logger.info("[midnight_batch] skipped: lock held")
            return
        try:
            # 1. 전날 결과 재확인
            await task_crawl_results(yesterday)

            # 2. 전날 경기 박스스코어와 타순 스냅샷
            await task_crawl_game_records(yesterday)

            # 3. 전날 경기 정산 (혹시 23:50에 미처리된 경기)
            await task_settle_results(yesterday)

            # 4. ELO 업데이트
            await task_update_elo()

            # 5. 익일 일정 크롤 (당월 전체)
            await task_crawl_schedule(today.year, today.month)

            # 6. 전날 경기 반영 시즌 기록과 순위 갱신
            await task_crawl_statiz(include_details=False)
            await task_crawl_batters()
            await task_crawl_standings()

            # 7. 오늘 경기 예측 초안 (선발 미확정, ELO/흐름 기반)
            await task_update_predictions()

            logger.info("[midnight_batch] done")
        except Exception:
            logger.exception("[midnight_batch] failed")


# ─────────────────────────────────────────────────────────────
# 블로그 초안 생성 태스크
# ─────────────────────────────────────────────────────────────

_APP_ROOT = Path(__file__).parent.parent.parent  # /app (컨테이너) 또는 backend/ (로컬)

_WEEKDAYS_KR = ["월", "화", "수", "목", "금", "토", "일"]


def _date_kr(d: date) -> str:
    """2026-06-03 → '6월 3일(수)'"""
    return f"{d.month}월 {d.day}일({_WEEKDAYS_KR[d.weekday()]})"


def _form_kr(form: str) -> str:
    """'WLLWW' → '3승 2패 / 2연승 중' 형식의 자연어"""
    if not form or form == "-":
        return "데이터 없음"
    wins = form.count("W")
    losses = form.count("L")
    # 현재 연속 기록
    streak_char = form[-1]
    streak = 0
    for c in reversed(form):
        if c == streak_char:
            streak += 1
        else:
            break
    base = f"{wins}승 {losses}패"
    if streak_char == "W" and streak >= 3:
        return f"{base} / {streak}연승 중"
    elif streak_char == "L" and streak >= 3:
        return f"{base} / {streak}연패 중"
    elif wins >= 4:
        return f"{base} / 강세"
    elif losses >= 4:
        return f"{base} / 부진"
    return base
_TEMPLATE_DIR = _APP_ROOT / "templates" / "blog"
_OUTPUT_DIR = Path(os.getenv("BLOG_OUTPUT_DIR", str(_APP_ROOT / "outputs" / "blog_drafts")))
_VARIATIONS_PATH = _TEMPLATE_DIR / "variations.json"

_MIN_CHARS = {
    ("A", 1): 1200, ("A", 2): 1200, ("A", 3): 1800,
    ("B", 0): 1500,
    ("C", 0): 1200,
}


def _load_variations() -> dict:
    try:
        return json.loads(_VARIATIONS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _pick(items: list, seed: int) -> str:
    """시드 기반으로 목록에서 하나를 결정적으로 선택."""
    if not items:
        return ""
    return items[seed % len(items)]


def _make_seed(target_date: date, type_code: str, platform: str, extra: str = "") -> int:
    raw = f"{target_date.isoformat()}:{type_code}:{platform}:{extra}"
    return sum(ord(c) * (i + 1) for i, c in enumerate(raw))


def _prob_label(prob: float, var: dict) -> str:
    labels = var.get("prob_labels", {})
    if prob >= 60:
        return _pick(labels.get("high", ["유력"]), int(prob))
    if prob >= 55:
        return _pick(labels.get("mid", ["약세 우위"]), int(prob))
    return _pick(labels.get("low", ["박빙"]), int(prob))


def _section_order(games: list, order_style: str) -> list:
    if order_style == "start_time":
        return sorted(games, key=lambda g: g.get("start_time_str", ""))
    if order_style == "key_factors_count":
        return sorted(games, key=lambda g: len(g.get("key_factors", [])), reverse=True)
    if order_style == "home_team_alpha":
        return sorted(games, key=lambda g: g.get("home_team", ""))
    # prob_desc (기본): 예측 확률 차이 큰 순
    return sorted(games, key=lambda g: abs(g.get("home_prob", 50) - 50), reverse=True)


async def _fetch_type_a_data(session: AsyncSession, target_date: date) -> list[dict]:
    from app.models import PredictionRun, PitcherStat
    from sqlalchemy.orm import aliased

    HomeTeam = aliased(Team, flat=True)
    AwayTeam = aliased(Team, flat=True)
    HomePitcher = aliased(Player, flat=True)
    AwayPitcher = aliased(Player, flat=True)

    stmt = (
        select(Game, HomeTeam, AwayTeam, Prediction, HomePitcher, AwayPitcher)
        .join(HomeTeam, Game.home_team_id == HomeTeam.id)
        .join(AwayTeam, Game.away_team_id == AwayTeam.id)
        .outerjoin(Prediction, Game.id == Prediction.game_id)
        .outerjoin(HomePitcher, Game.home_starter_id == HomePitcher.id)
        .outerjoin(AwayPitcher, Game.away_starter_id == AwayPitcher.id)
        .where(Game.game_date == target_date, Game.status == "scheduled")
        .order_by(Game.start_time)
    )
    rows = (await session.execute(stmt)).all()

    # 최신 prediction_run의 key_factors, data_completeness, confidence_level 조회
    run_map: dict[int, PredictionRun] = {}
    if rows:
        game_ids = [r[0].id for r in rows]
        run_stmt = (
            select(PredictionRun)
            .where(
                PredictionRun.game_id.in_(game_ids),
                PredictionRun.is_published == True,
            )
            .order_by(PredictionRun.game_id, PredictionRun.generated_at.desc())
        )
        runs = (await session.execute(run_stmt)).scalars().all()
        for run in runs:
            if run.game_id not in run_map:
                run_map[run.game_id] = run

    # 투수 ERA 조회
    async def _get_era(player_id: int | None, season: int) -> float | None:
        if player_id is None:
            return None
        stat = (await session.execute(
            select(PitcherStat)
            .where(
                PitcherStat.player_id == player_id,
                PitcherStat.season == season,
                PitcherStat.game_id.is_(None),
            )
            .limit(1)
        )).scalar_one_or_none()
        return stat.era if stat else None

    # 최근 5경기 W/L 문자열
    async def _get_form(team_id: int, before: date) -> str:
        stmt_form = (
            select(Game)
            .where(
                Game.status == "final",
                Game.game_date < before,
                (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
            )
            .order_by(Game.game_date.desc())
            .limit(5)
        )
        gs = (await session.execute(stmt_form)).scalars().all()
        chars = []
        for g in reversed(gs):
            if g.home_score is None or g.away_score is None:
                continue
            won = (g.home_team_id == team_id and g.home_score > g.away_score) or \
                  (g.away_team_id == team_id and g.away_score > g.home_score)
            chars.append("W" if won else "L")
        return "".join(chars) or "-"

    games_data = []
    for game, home_team, away_team, pred, home_pitcher, away_pitcher in rows:
        if pred is None:
            continue
        run = run_map.get(game.id)
        home_prob = round(pred.home_win_prob * 100, 1)
        away_prob = round(pred.away_win_prob * 100, 1)
        winner_id = pred.predicted_winner_id
        predicted_winner = home_team.name if winner_id == home_team.id else away_team.name
        predicted_prob = home_prob if winner_id == home_team.id else away_prob

        snapshot = run.feature_snapshot if run else {}
        confidence_level = snapshot.get("confidence_level", "보통") if snapshot else "보통"
        key_factors = run.key_factors if run else []
        data_completeness = run.data_completeness if run else 0

        home_era = await _get_era(game.home_starter_id, target_date.year)
        away_era = await _get_era(game.away_starter_id, target_date.year)
        home_form = await _get_form(home_team.id, target_date)
        away_form = await _get_form(away_team.id, target_date)

        start_str = game.start_time.strftime("%H:%M") if game.start_time else "미정"

        games_data.append({
            "game_id": game.id,
            "game_date": str(target_date),
            "stadium": game.stadium or "",
            "start_time_str": start_str,
            "home_team": home_team.name,
            "away_team": away_team.name,
            "home_prob": home_prob,
            "away_prob": away_prob,
            "predicted_winner": predicted_winner,
            "predicted_winner_prob": predicted_prob,
            "confidence_level": confidence_level,
            "key_factors": key_factors or [],
            "data_completeness": data_completeness,
            "prediction_updated_at": pred.updated_at.isoformat() if pred.updated_at else None,
            "prediction_run_id": run.id if run else None,
            "prediction_run_generated_at": run.generated_at.isoformat() if run and run.generated_at else None,
            "prediction_model_version": run.model_version if run else pred.model_version,
            "home_starter": home_pitcher.name if home_pitcher else "미정",
            "away_starter": away_pitcher.name if away_pitcher else "미정",
            "home_starter_era": home_era,
            "away_starter_era": away_era,
            "home_form": home_form,
            "away_form": away_form,
        })
    return games_data


def _log_blog_prediction_snapshot(content_type: str, source_date: date, games_data: list[dict]) -> None:
    """Log the exact prediction values used to generate a blog draft."""
    for game in games_data:
        logger.info(
            "[blog] prediction snapshot %s %s game=%s %s vs %s home=%s away=%s winner=%s winner_prob=%s pred_updated=%s run_id=%s run_generated=%s model=%s completeness=%s",
            content_type,
            source_date,
            game.get("game_id"),
            game.get("home_team"),
            game.get("away_team"),
            game.get("home_prob"),
            game.get("away_prob"),
            game.get("predicted_winner"),
            game.get("predicted_winner_prob"),
            game.get("prediction_updated_at"),
            game.get("prediction_run_id"),
            game.get("prediction_run_generated_at"),
            game.get("prediction_model_version"),
            game.get("data_completeness"),
        )


async def _fetch_type_b_data(session: AsyncSession, target_date: date) -> dict:
    season = target_date.year
    week_ago = target_date - timedelta(days=7)

    # ELO 순위
    from app.models import TeamSeasonStandings
    stmt = (
        select(Team, TeamSeasonStandings)
        .outerjoin(TeamSeasonStandings, (Team.id == TeamSeasonStandings.team_id) & (TeamSeasonStandings.season == season))
        .order_by(Team.elo_rating.desc())
    )
    rows = (await session.execute(stmt)).all()

    teams_by_elo = []
    for i, (team, st) in enumerate(rows):
        teams_by_elo.append({
            "name": team.name,
            "code": team.code,
            "elo_rating": team.elo_rating,
            "elo_rank": i + 1,
            "rank": st.rank if st else "-",
            "wins": st.wins if st else 0,
            "losses": st.losses if st else 0,
            "draws": st.draws if st else 0,
            "win_pct": st.win_pct if st else 0.0,
            "streak": st.streak if st else "-",
        })

    # 주간 ELO 변동
    from app.models import EloHistory
    elo_stmt = (
        select(
            Team.name, Team.code,
            func.sum(EloHistory.elo_change).label("elo_change_7d"),
            func.count(EloHistory.id).label("games_played"),
        )
        .join(Team, EloHistory.team_id == Team.id)
        .where(EloHistory.game_date >= week_ago, EloHistory.game_date < target_date)
        .group_by(Team.id, Team.name, Team.code)
        .order_by(func.sum(EloHistory.elo_change).desc())
    )
    elo_rows = (await session.execute(elo_stmt)).all()

    elo_changes = [
        {"name": r.name, "code": r.code, "elo_change_7d": float(r.elo_change_7d or 0), "games_played": r.games_played}
        for r in elo_rows
    ]
    risers = [t for t in elo_changes if t["elo_change_7d"] > 0][:3]
    fallers = sorted([t for t in elo_changes if t["elo_change_7d"] < 0], key=lambda x: x["elo_change_7d"])[:3]

    # 공식 순위 vs ELO 순위 괴리 팀
    rank_gap_teams = []
    for t in teams_by_elo:
        if t["rank"] == "-":
            continue
        gap = int(t["rank"]) - t["elo_rank"]
        if abs(gap) >= 2:
            if gap > 0:
                desc = f"공식 순위보다 AI 전력({t['elo_rank']}위)이 높게 평가됨 — 최근 흐름이 실제 전력보다 좋을 수 있음"
            else:
                desc = f"공식 순위보다 AI 전력({t['elo_rank']}위)이 낮게 평가됨 — 일정 유불리 또는 전력 대비 결과가 좋았을 가능성"
            rank_gap_teams.append({**t, "gap": gap, "gap_desc": desc})
    rank_gap_teams = sorted(rank_gap_teams, key=lambda x: abs(x["gap"]), reverse=True)[:3]

    return {
        "teams_by_elo": teams_by_elo,
        "risers": risers,
        "fallers": fallers,
        "rank_gap_teams": rank_gap_teams,
        "as_of_date": str(target_date - timedelta(days=1)),
    }


async def _fetch_type_c_data(session: AsyncSession, target_date: date) -> dict | None:
    from app.models import TeamSeasonStandings
    from sqlalchemy.orm import aliased

    season = target_date.year
    month = target_date.month
    # 전주 월~일
    days_since_monday = target_date.weekday()
    week_end = target_date - timedelta(days=days_since_monday + 1)  # 지난 일요일
    week_start = week_end - timedelta(days=6)

    HomeTeam = aliased(Team, flat=True)
    AwayTeam = aliased(Team, flat=True)
    PredTeam = aliased(Team, flat=True)
    ActualTeam = aliased(Team, flat=True)

    # 주간 적중률
    def _acc_stmt(date_from: date, date_to: date):
        return (
            select(Prediction, Game)
            .join(Game, Prediction.game_id == Game.id)
            .where(
                Game.game_date >= date_from,
                Game.game_date <= date_to,
                Prediction.is_correct.is_not(None),
            )
        )

    weekly_rows = (await session.execute(_acc_stmt(week_start, week_end))).all()
    weekly_total = len(weekly_rows)
    if weekly_total < 5:
        return None  # 데이터 부족
    weekly_correct = sum(1 for p, _ in weekly_rows if p.is_correct)
    brier_scores = [p.brier_score for p, _ in weekly_rows if p.brier_score is not None]
    avg_brier = round(sum(brier_scores) / len(brier_scores), 3) if brier_scores else None

    monthly_rows = (await session.execute(
        select(Prediction, Game)
        .join(Game, Prediction.game_id == Game.id)
        .where(
            extract("year", Game.game_date) == season,
            extract("month", Game.game_date) == month,
            Prediction.is_correct.is_not(None),
        )
    )).all()
    monthly_total = len(monthly_rows)
    monthly_correct = sum(1 for p, _ in monthly_rows if p.is_correct)

    # 최근 5경기 결과
    recent_stmt = (
        select(Prediction, Game, HomeTeam, AwayTeam, PredTeam, ActualTeam)
        .join(Game, Prediction.game_id == Game.id)
        .join(HomeTeam, Game.home_team_id == HomeTeam.id)
        .join(AwayTeam, Game.away_team_id == AwayTeam.id)
        .outerjoin(PredTeam, Prediction.predicted_winner_id == PredTeam.id)
        .outerjoin(ActualTeam, Prediction.actual_winner_id == ActualTeam.id)
        .where(Prediction.is_correct.is_not(None))
        .order_by(Game.game_date.desc())
        .limit(5)
    )
    recent_rows = (await session.execute(recent_stmt)).all()
    recent_results = [
        {
            "game_date": str(g.game_date),
            "home_team": ht.name,
            "away_team": at.name,
            "predicted_winner": pt.name if pt else "-",
            "actual_winner": awt.name if awt else "-",
            "is_correct": p.is_correct,
            "home_prob": round(p.home_win_prob * 100, 1),
        }
        for p, g, ht, at, pt, awt in recent_rows
    ]

    # 전체 시즌 예측 수 검증 (20건 미만이면 생성 안 함)
    season_total = await session.scalar(
        select(func.count(Prediction.id))
        .join(Game, Prediction.game_id == Game.id)
        .where(
            extract("year", Game.game_date) == season,
            Prediction.is_correct.is_not(None),
        )
    )
    if (season_total or 0) < 20:
        return None

    return {
        "week_start": str(week_start),
        "week_end": str(week_end),
        "weekly_total": weekly_total,
        "weekly_correct": weekly_correct,
        "weekly_accuracy": round(weekly_correct / weekly_total * 100, 1) if weekly_total else 0,
        "avg_brier": avg_brier,
        "monthly_total": monthly_total,
        "monthly_correct": monthly_correct,
        "monthly_accuracy": round(monthly_correct / monthly_total * 100, 1) if monthly_total else 0,
        "season": season,
        "month": month,
        "recent_results": recent_results,
    }


def _render(env: Environment, template_name: str, context: dict, min_chars: int) -> str | None:
    """템플릿 렌더링 후 최소 글자 수 검증. 성공이면 렌더링 결과 반환, 실패이면 None."""
    tmpl = env.get_template(template_name)
    rendered = tmpl.render(**context)
    char_count = len(rendered.replace(" ", "").replace("\n", ""))
    if char_count < min_chars:
        logger.warning("[blog] char count too low: %s — %d < %d", template_name, char_count, min_chars)
        return None
    return rendered


def _blog_polish_enabled() -> bool:
    enabled = os.getenv("BLOG_POLISH_ENABLED", "").strip().lower()
    if enabled in {"0", "false", "no", "off"}:
        return False
    if enabled in {"1", "true", "yes", "on"}:
        return True
    return bool(os.getenv("BLOG_POLISH_PROVIDER", "").strip())


def _blog_enrich_gemini_enabled() -> bool:
    return os.getenv("BLOG_ENRICH_GEMINI_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name, "").strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _gemini_api_key() -> str:
    return (
        os.getenv("G_STUDIO_API_KEY", "").strip()
        or os.getenv("GEMINI_API_KEY", "").strip()
        or os.getenv("GOOGLE_API_KEY", "").strip()
    )


def _extract_gemini_text(payload: dict) -> str:
    parts = (
        payload.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    return "".join(part.get("text", "") for part in parts).strip()


async def _generate_with_gemini(prompt: str, model: str, timeout: float, temperature: float) -> str:
    api_key = _gemini_api_key()
    if not api_key:
        raise RuntimeError("Gemini API key is not configured")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "topP": 0.8,
        },
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(url, params={"key": api_key}, json=payload)
        res.raise_for_status()
    text = _extract_gemini_text(res.json())
    if not text:
        raise RuntimeError("Gemini returned an empty response")
    return text


def _strip_code_fence(content: str) -> str:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:markdown|md|text)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _protected_blog_tokens(context: dict) -> set[str]:
    tokens = {str(context.get("date_kr", "")).strip()}
    for game in context.get("games", []):
        for key in (
            "game_date", "start_time_str", "stadium",
            "home_team", "away_team", "predicted_winner",
            "home_starter", "away_starter",
        ):
            value = str(game.get(key, "")).strip()
            if value and value != "미정":
                tokens.add(value)
    return {token for token in tokens if token}


def _valid_enriched_content(original: str, enriched: str, context: dict) -> bool:
    original_len = len(original.strip())
    enriched_len = len(enriched.strip())
    if original_len == 0 or enriched_len == 0:
        return False
    if enriched_len < original_len * 0.75 or enriched_len > original_len * 1.8:
        return False
    if original.lstrip().startswith("---") and not enriched.lstrip().startswith("---"):
        return False
    for percent in set(re.findall(r"\d+(?:\.\d+)?%", original)):
        if percent not in enriched:
            logger.warning("[blog] Gemini enrich rejected: missing percent %s", percent)
            return False
    missing = [token for token in _protected_blog_tokens(context) if token not in enriched]
    if missing:
        logger.warning("[blog] Gemini enrich rejected: missing protected tokens %s", missing[:5])
        return False
    return True


def _valid_polished_content(original: str, polished: str) -> bool:
    original_len = len(original.strip())
    polished_len = len(polished.strip())
    if original_len == 0 or polished_len == 0:
        return False
    if polished_len < original_len * 0.75 or polished_len > original_len * 1.35:
        return False
    if original.lstrip().startswith("---") and not polished.lstrip().startswith("---"):
        return False
    return True


async def _polish_blog_content(
    content_type: str,
    source_date: date,
    title: str,
    platform: str,
    content: str,
) -> str:
    """Optionally polish generated blog copy. Falls back to the current content."""
    if not _blog_polish_enabled():
        return content

    provider = os.getenv("BLOG_POLISH_PROVIDER", "ollama").strip().lower()
    timeout = _env_float("BLOG_POLISH_TIMEOUT", 90.0)
    temperature = _env_float("BLOG_POLISH_TEMPERATURE", 0.25)

    prompt = f"""
너는 KBO 블로그 원고의 한국어 문장 편집자다.
아래 원고를 더 자연스럽고 읽기 쉽게 다듬어라.

규칙:
- 팀명, 선수명, 날짜, 경기장, 확률, 점수, 순위, ELO, 승패 수, URL은 절대 바꾸지 않는다.
- 원고에 없는 새 사실, 예측, 근거, 광고 문구를 추가하지 않는다.
- 네이버용 일반 텍스트와 티스토리용 Markdown 구조를 유지한다.
- 티스토리 frontmatter, 제목, 표, 목록, 인용, 링크는 보존한다.
- 결과 본문만 출력한다. 설명, 머리말, 코드블록은 출력하지 않는다.

메타:
- content_type: {content_type}
- source_date: {source_date}
- platform: {platform}
- title: {title}

원고:
{content}
""".strip()

    try:
        if provider == "gemini":
            model = os.getenv("BLOG_POLISH_GEMINI_MODEL", "").strip() or os.getenv(
                "BLOG_ENRICH_GEMINI_MODEL", "gemini-1.5-flash"
            ).strip()
            polished = await _generate_with_gemini(prompt, model, timeout, temperature)
        else:
            base_url = os.getenv("BLOG_POLISH_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
            model = os.getenv("BLOG_POLISH_MODEL", "qwen2.5:7b")
            num_ctx = _env_int("BLOG_POLISH_NUM_CTX", 2048)
            keep_alive = os.getenv("BLOG_POLISH_KEEP_ALIVE", "0").strip() or "0"
            payload = {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "keep_alive": keep_alive,
                "options": {"temperature": temperature, "num_ctx": num_ctx},
            }
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.post(f"{base_url}/api/generate", json=payload)
                res.raise_for_status()
            polished = (res.json().get("response") or "").strip()
        polished = _strip_code_fence(polished)
        if not _valid_polished_content(content, polished):
            logger.warning("[blog] polish rejected: %s %s %s", content_type, source_date, platform)
            return content
        logger.info("[blog] polished with %s/%s: %s %s %s", provider, model, content_type, source_date, platform)
        return polished
    except Exception as e:
        logger.warning("[blog] polish failed: %s %s %s: %s", content_type, source_date, platform, e)
        return content


async def _enrich_type_a_with_gemini(
    source_date: date,
    title: str,
    platform: str,
    content: str,
    context: dict,
) -> str:
    """Enrich TYPE_A prediction drafts without changing facts or numeric data."""
    if not _blog_enrich_gemini_enabled():
        return content

    model = os.getenv("BLOG_ENRICH_GEMINI_MODEL", "gemini-1.5-flash").strip()
    timeout = _env_float("BLOG_ENRICH_GEMINI_TIMEOUT", 90.0)
    temperature = _env_float("BLOG_ENRICH_GEMINI_TEMPERATURE", 0.2)
    games_json = json.dumps(context.get("games", []), ensure_ascii=False, default=str)
    prompt = f"""
너는 KBO 예측 블로그 편집자다. 아래 TYPE_A 원고를 독자가 더 오래 읽도록 보강하라.

반드시 지킬 규칙:
- 팀명, 선수명, 경기 날짜, 경기장, 시작 시각, 예측 승자, 홈/원정 승률, 신뢰도, 데이터 완전성 수치를 절대 바꾸지 않는다.
- 제공 데이터에 없는 부상, 라인업, 날씨, 상대전적, 최신 뉴스, 배당, 베팅 표현을 추가하지 않는다.
- 원고 형식은 유지한다. 네이버 원고는 일반 텍스트, 티스토리 원고는 Markdown/frontmatter/표를 보존한다.
- 보강은 경기별 관전 포인트, 확률 해석, 리스크 설명, 자연스러운 연결 문장에 한정한다.
- 결과 본문만 출력한다. 설명, 코드블록, 변경 요약은 출력하지 않는다.

추천 보강:
- 각 경기의 "AI 핵심 요인" 또는 "예측 결과" 주변에 1~2문장 관전 포인트를 추가한다.
- 박빙/우세/데이터 완전성 의미를 일반 독자용 문장으로 풀어쓴다.
- 마지막에는 예측이 참고용이며 경기 전 데이터 변동 가능성이 있다는 문장을 자연스럽게 유지한다.

메타:
- source_date: {source_date}
- platform: {platform}
- title: {title}

원본 데이터(JSON, 사실 확인용):
{games_json}

원고:
{content}
""".strip()

    try:
        enriched = await _generate_with_gemini(prompt, model, timeout, temperature)
        enriched = _strip_code_fence(enriched)
        if not _valid_enriched_content(content, enriched, context):
            logger.warning("[blog] Gemini enrich rejected: TYPE_A %s %s", source_date, platform)
            return content
        logger.info("[blog] enriched with Gemini %s: TYPE_A %s %s", model, source_date, platform)
        return enriched
    except Exception as e:
        logger.warning("[blog] Gemini enrich failed: TYPE_A %s %s: %s", source_date, platform, e)
        return content


def _write_blog_files(content_type: str, source_date: date, naver: str, tistory: str) -> None:
    """당일 블로그 초안을 로컬 파일로 저장. 같은 타입의 이전 날짜 파일은 삭제해 최신 1건만 유지."""
    try:
        _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        if _env_bool("BLOG_OUTPUT_KEEP_LATEST_ONLY", True):
            # 같은 타입의 기존 파일 삭제 (날짜 무관)
            for old in _OUTPUT_DIR.glob(f"*_{content_type}_naver.txt"):
                old.unlink()
            for old in _OUTPUT_DIR.glob(f"*_{content_type}_tistory.md"):
                old.unlink()
        prefix = f"{source_date}_{content_type}"
        (_OUTPUT_DIR / f"{prefix}_naver.txt").write_text(naver, encoding="utf-8")
        (_OUTPUT_DIR / f"{prefix}_tistory.md").write_text(tistory, encoding="utf-8")
        logger.info("[blog] file saved: %s/%s_{naver.txt,tistory.md}", _OUTPUT_DIR, prefix)
    except Exception as e:
        logger.warning("[blog] file write failed: %s", e)


async def _upsert_content_draft(
    session: AsyncSession,
    content_type: str,
    source_date: date,
    title: str,
    content_naver: str,
    content_tistory: str,
) -> None:
    """당일 데이터만 1건 유지 — 기존 행이 있으면 UPDATE, 없으면 INSERT."""
    from app.models.content_draft import ContentDraft
    existing = (
        await session.execute(
            select(ContentDraft).where(
                ContentDraft.content_type == content_type,
                ContentDraft.source_date == source_date,
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.title = title
        existing.content_naver = content_naver
        existing.content_tistory = content_tistory
        existing.updated_at = now_kst()
        logger.info("[blog] updated DB: %s %s", content_type, source_date)
    else:
        session.add(ContentDraft(
            content_type=content_type,
            source_date=source_date,
            title=title,
            content_naver=content_naver,
            content_tistory=content_tistory,
        ))
        logger.info("[blog] inserted DB: %s %s", content_type, source_date)


async def _upsert_content_draft_web(
    content_type: str,
    source_date: date,
    title: str,
    content_naver: str,
    content_tistory: str,
) -> None:
    """Mirror the final blog draft to the configured web DB when running locally."""
    if not has_web_db() or WebSessionLocal is None:
        return
    try:
        async with WebSessionLocal() as web_session:
            async with web_session.begin():
                await _upsert_content_draft(
                    web_session,
                    content_type,
                    source_date,
                    title,
                    content_naver,
                    content_tistory,
                )
        logger.info("[blog] mirrored to web DB: %s %s", content_type, source_date)
    except Exception as e:
        logger.warning("[blog] web DB mirror failed: %s %s: %s", content_type, source_date, e)


async def task_generate_blog(target_date: date | None = None) -> None:
    """매일 15:30 — 블로그 초안 자동 생성 후 DB 저장 (당일 1건 유지).

    TYPE_A: 오늘의 경기 AI 예측 (경기 있는 날)
    TYPE_B: KBO ELO 팀 순위 분석 (매일)
    TYPE_C: 예측 적중률 주간 리포트 (월요일만)
    """
    target = target_date or today_kst()
    logger.info("[blog] task_generate_blog start: %s", target)
    try:
        sync_result = await sync_after_predictions()
        if sync_result:
            logger.info("[blog] prediction sync before draft: %s", sync_result)
    except Exception:
        logger.exception("[blog] prediction sync before draft failed")

    var = _load_variations()
    try:
        env = Environment(
            loader=FileSystemLoader(str(_TEMPLATE_DIR)),
            autoescape=False,
            keep_trailing_newline=True,
        )
    except Exception:
        logger.exception("[blog] Jinja2 env init failed")
        return

    async with AsyncSessionLocal() as session:
        results = {"A": False, "B": False, "C": False}

        # ── TYPE_A: 오늘의 경기 예측 ─────────────────────────────
        try:
            games_data = await _fetch_type_a_data(session, target)
            if not games_data:
                logger.info("[blog] TYPE_A skipped: no predictions for %s", target)
            else:
                _log_blog_prediction_snapshot("TYPE_A", target, games_data)
                vA = var.get("type_a", {})
                n_games = len(games_data)
                min_c = _MIN_CHARS.get(("A", min(n_games, 3)), 1200)
                matchup = f"{games_data[0]['home_team']} vs {games_data[0]['away_team']}"

                seed_n = _make_seed(target, "A", "naver")
                seed_t = _make_seed(target, "A", "tistory")

                monthly_total = await session.scalar(
                    select(func.count(Prediction.id))
                    .join(Game, Prediction.game_id == Game.id)
                    .where(
                        extract("year", Game.game_date) == target.year,
                        extract("month", Game.game_date) == target.month,
                        Prediction.is_correct.is_not(None),
                    )
                ) or 0
                monthly_correct = await session.scalar(
                    select(func.count(Prediction.id))
                    .join(Game, Prediction.game_id == Game.id)
                    .where(
                        extract("year", Game.game_date) == target.year,
                        extract("month", Game.game_date) == target.month,
                        Prediction.is_correct == True,
                    )
                ) or 0

                def _make_ctx_a(seed: int) -> dict:
                    ordered = _section_order(
                        games_data,
                        vA.get("section_orders", ["prob_desc"])[seed % len(vA.get("section_orders", ["prob_desc"]))]
                    )
                    mods = vA.get("team_modifiers", {}).get("default", [])
                    starter_unknowns = vA.get("starter_unknown_phrases", ["선발 미확정"])
                    low_data_notes = vA.get("low_data_notes", ["선발 투수 미확정으로 예측 신뢰도가 제한됩니다."])
                    for i, g in enumerate(ordered):
                        g["prob_label"] = _prob_label(g["predicted_winner_prob"], vA)
                        g["home_form_kr"] = _form_kr(g.get("home_form", "-"))
                        g["away_form_kr"] = _form_kr(g.get("away_form", "-"))
                        if mods:
                            g["home_modifier"] = _pick(mods, seed + i * 7)
                            g["away_modifier"] = _pick(mods, seed + i * 7 + 3)
                        else:
                            g["home_modifier"] = ""
                            g["away_modifier"] = ""
                        g["starter_unknown_phrase"] = _pick(starter_unknowns, seed + i)
                        g["low_data_note"] = _pick(low_data_notes, seed + i + 1)
                    date_kr = _date_kr(target)
                    return {
                        "title": _pick(vA.get("title_patterns", [str(target)]), seed).format(date=str(target), matchup=matchup),
                        "intro": _pick(vA.get("intro_patterns", [""]), seed + 1),
                        "form_intro": _pick(vA.get("form_intros", ["최근 흐름을 보면"]), seed + 2),
                        "connector": _pick(vA.get("connector_words", ["특히"]), seed + 3),
                        "outro": _pick(vA.get("outro_patterns", [""]), seed + 4),
                        "summary_header": _pick(vA.get("summary_headers", ["오늘의 경기 예측 요약"]), seed + 5),
                        "analysis_header": _pick(vA.get("analysis_headers", ["경기별 AI 분석"]), seed + 6),
                        "games": ordered,
                        "date_kr": date_kr,
                        "monthly_total": monthly_total,
                        "monthly_correct": monthly_correct,
                        "monthly_accuracy": round(monthly_correct / monthly_total * 100, 1) if monthly_total else 0,
                    }

                ctx_n = _make_ctx_a(seed_n)
                ctx_t = _make_ctx_a(seed_t)
                naver = _render(env, "type_a_naver.txt.j2", ctx_n, min_c)
                tistory = _render(env, "type_a_tistory.md.j2", ctx_t, min_c)
                if naver and tistory:
                    naver = await _enrich_type_a_with_gemini(target, ctx_n["title"], "naver", naver, ctx_n)
                    tistory = await _enrich_type_a_with_gemini(target, ctx_t["title"], "tistory", tistory, ctx_t)
                    naver = await _polish_blog_content("TYPE_A", target, ctx_n["title"], "naver", naver)
                    tistory = await _polish_blog_content("TYPE_A", target, ctx_t["title"], "tistory", tistory)
                    async with session.begin_nested():
                        await _upsert_content_draft(session, "TYPE_A", target, ctx_n["title"], naver, tistory)
                    await _upsert_content_draft_web("TYPE_A", target, ctx_n["title"], naver, tistory)
                    _write_blog_files("TYPE_A", target, naver, tistory)
                    results["A"] = True
        except Exception:
            logger.exception("[blog] TYPE_A generation failed")

        # ── TYPE_B: ELO 팀 순위 분석 ─────────────────────────────
        try:
            b_data = await _fetch_type_b_data(session, target)
            vB = var.get("type_b", {})
            seed_n = _make_seed(target, "B", "naver")
            seed_t = _make_seed(target, "B", "tistory")
            elo_styles = vB.get("elo_desc_styles", ["table_first"])

            ctx_n = {
                "title": _pick(vB.get("title_patterns", [str(target)]), seed_n).format(date=str(target)),
                "intro": _pick(vB.get("intro_patterns", [""]), seed_n + 1),
                "connector": _pick(vB.get("connector_words", ["특히"]), seed_n + 2),
                "outro": _pick(vB.get("outro_patterns", [""]), seed_n + 3),
                "elo_style": elo_styles[seed_n % len(elo_styles)],
                **b_data,
            }
            ctx_t = {**ctx_n,
                "title": _pick(vB.get("title_patterns", [str(target)]), seed_t).format(date=str(target)),
                "intro": _pick(vB.get("intro_patterns", [""]), seed_t + 1),
                "outro": _pick(vB.get("outro_patterns", [""]), seed_t + 3),
                "elo_style": elo_styles[seed_t % len(elo_styles)],
            }
            naver = _render(env, "type_b_naver.txt.j2", ctx_n, _MIN_CHARS[("B", 0)])
            tistory = _render(env, "type_b_tistory.md.j2", ctx_t, _MIN_CHARS[("B", 0)])
            if naver and tistory:
                naver = await _polish_blog_content("TYPE_B", target, ctx_n["title"], "naver", naver)
                tistory = await _polish_blog_content("TYPE_B", target, ctx_t["title"], "tistory", tistory)
                async with session.begin_nested():
                    await _upsert_content_draft(session, "TYPE_B", target, ctx_n["title"], naver, tistory)
                await _upsert_content_draft_web("TYPE_B", target, ctx_n["title"], naver, tistory)
                _write_blog_files("TYPE_B", target, naver, tistory)
                results["B"] = True
        except Exception:
            logger.exception("[blog] TYPE_B generation failed")

        # ── TYPE_C: 주간 적중률 리포트 (월요일만) ──────────────────
        if target.weekday() == 0:
            try:
                c_data = await _fetch_type_c_data(session, target)
                if c_data is None:
                    logger.info("[blog] TYPE_C skipped: insufficient data")
                else:
                    vC = var.get("type_c", {})
                    seed_n = _make_seed(target, "C", "naver")
                    seed_t = _make_seed(target, "C", "tistory")
                    ctx_n = {
                        "title": _pick(vC.get("title_patterns", [str(target)]), seed_n).format(date=str(target)),
                        "intro": _pick(vC.get("intro_patterns", [""]), seed_n + 1),
                        "connector": _pick(vC.get("connector_words", ["특히"]), seed_n + 2),
                        "outro": _pick(vC.get("outro_patterns", [""]), seed_n + 3),
                        **c_data,
                    }
                    ctx_t = {**ctx_n,
                        "title": _pick(vC.get("title_patterns", [str(target)]), seed_t).format(date=str(target)),
                        "intro": _pick(vC.get("intro_patterns", [""]), seed_t + 1),
                        "outro": _pick(vC.get("outro_patterns", [""]), seed_t + 3),
                    }
                    naver = _render(env, "type_c_naver.txt.j2", ctx_n, _MIN_CHARS[("C", 0)])
                    tistory = _render(env, "type_c_tistory.md.j2", ctx_t, _MIN_CHARS[("C", 0)])
                    if naver and tistory:
                        naver = await _polish_blog_content("TYPE_C", target, ctx_n["title"], "naver", naver)
                        tistory = await _polish_blog_content("TYPE_C", target, ctx_t["title"], "tistory", tistory)
                        async with session.begin_nested():
                            await _upsert_content_draft(session, "TYPE_C", target, ctx_n["title"], naver, tistory)
                        await _upsert_content_draft_web("TYPE_C", target, ctx_n["title"], naver, tistory)
                        _write_blog_files("TYPE_C", target, naver, tistory)
                        results["C"] = True
            except Exception:
                logger.exception("[blog] TYPE_C generation failed")

        await session.commit()

    logger.info(
        "[blog] done: A=%s B=%s C=%s",
        "ok" if results["A"] else "skip",
        "ok" if results["B"] else "skip",
        "ok" if results["C"] else "skip/mon-only",
    )
