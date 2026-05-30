"""
스케줄러 실행 태스크 — 크롤러 호출 + DB 저장
"""

import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import BatterStat, EloHistory, Game, PitcherStat, Player, Prediction, PredictionRun, Team, TeamSeasonStandings
from app.crawler.kbo_schedule import run_schedule_crawl
from app.crawler.schemas import GameScheduleData, PitcherStatData
from app.crawler.kbo_pitcher import run_pitcher_stats_all_teams
from app.crawler.kbo_standings import run_standings_crawl
from app.crawler.kbo_batter import run_batter_stats_all_teams, BatterStatData
from app.crawler.naver_lineup import fetch_all_starters
from app.crawler.weather import fetch_weather_for_games
from app.engine import elo as elo_engine
from app.engine.predictor import predict_today

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
    today = date.today()
    y, m = year or today.year, month or today.month
    logger.info("[scheduler] crawl_schedule start: %d-%02d", y, m)
    try:
        n = await crawl_schedule_month(y, m)
        logger.info("[scheduler] crawl_schedule done: %d games", n)
    except Exception:
        logger.exception("[scheduler] crawl_schedule failed")


async def task_crawl_results() -> None:
    """매일 23:30 — 당일 경기 결과 업데이트."""
    today = date.today()
    logger.info("[scheduler] crawl_results start: %s", today)
    try:
        games = await run_schedule_crawl(today.year, today.month)
        finished = [g for g in games if g.game_date == today and g.status == "final"]
        async with AsyncSessionLocal() as session:
            async with session.begin():
                for g in finished:
                    await _upsert_game(session, g)
        logger.info("[scheduler] crawl_results done: %d finished games", len(finished))
    except Exception:
        logger.exception("[scheduler] crawl_results failed")


async def task_crawl_statiz() -> None:
    """매일 07:00 — 전 팀 투수 시즌 성적 수집 (KBO 공식) 후 DB 저장."""
    year = date.today().year
    logger.info("[scheduler] crawl_pitcher_stats start: %d", year)
    try:
        stats = await run_pitcher_stats_all_teams(year)
        async with AsyncSessionLocal() as session:
            async with session.begin():
                for s in stats:
                    await _upsert_pitcher_season_stat(session, s)
        logger.info("[scheduler] crawl_pitcher_stats done: %d pitcher stat rows saved", len(stats))
    except Exception:
        logger.exception("[scheduler] crawl_pitcher_stats failed")


async def task_crawl_weather() -> None:
    """매일 12:00 — 당일 경기 날씨 수집."""
    today = date.today()
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
    except Exception:
        logger.exception("[scheduler] crawl_weather failed")


async def task_update_predictions() -> None:
    """매일 15:00 (라인업 확정 후) — 오늘 경기 예측 생성/갱신."""
    logger.info("[scheduler] update_predictions start")
    try:
        async with AsyncSessionLocal() as session:
            results = await predict_today(session)
        logger.info("[scheduler] update_predictions done: %d games predicted", len(results))
    except Exception:
        logger.exception("[scheduler] update_predictions failed")


async def task_update_elo() -> None:
    """매일 자정 00:00 — 전날 경기 결과로 ELO 업데이트."""
    yesterday = date.today() - timedelta(days=1)
    logger.info("[scheduler] update_elo start: %s", yesterday)
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                stmt = select(Game).where(
                    Game.game_date == yesterday,
                    Game.status == "final",
                    Game.home_score.is_not(None),
                )
                games = (await session.execute(stmt)).scalars().all()

                for game in games:
                    if game.home_score is None or game.away_score is None:
                        continue

                    home_team: Team | None = await session.get(Team, game.home_team_id)
                    away_team: Team | None = await session.get(Team, game.away_team_id)
                    if not home_team or not away_team:
                        continue

                    if game.home_score > game.away_score:
                        winner, loser = home_team, away_team
                    elif game.away_score > game.home_score:
                        winner, loser = away_team, home_team
                    else:
                        continue  # 무승부 (KBO 는 드물지만 발생)

                    elo_before_w = winner.elo_rating
                    elo_before_l = loser.elo_rating
                    new_w, new_l = elo_engine.update_elo(elo_before_w, elo_before_l, game.game_date)

                    winner.elo_rating = new_w
                    loser.elo_rating = new_l

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

        logger.info("[scheduler] update_elo done: %d games processed", len(games))
    except Exception:
        logger.exception("[scheduler] update_elo failed")


async def _settle_one(
    session: AsyncSession,
    game: Game,
) -> str:
    """경기 1건 정산. 반환값: settled / draw / cancelled / skip."""
    from datetime import datetime as dt

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
        if pred and pred.settlement_status != "settled":
            pred.actual_winner_id = winner_id
            pred.is_correct = (pred.predicted_winner_id == winner_id)
            # Brier Score: (p_predicted - outcome)^2, outcome=1 if home wins
            outcome = 1.0 if winner_id == game.home_team_id else 0.0
            pred.brier_score = round((pred.home_win_prob - outcome) ** 2, 6)
            pred.settlement_status = "settled"
            pred.settled_at = dt.utcnow()

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
            outcome_run = 1.0 if winner_id == game.home_team_id else 0.0
            run.brier_score = round((run.home_win_prob - outcome_run) ** 2, 6)
            run.settlement_status = "settled"
            run.settled_at = dt.utcnow()

        return "settled"

    # 취소/무승부: predictions + runs 상태만 갱신
    pred = (
        await session.execute(
            select(Prediction).where(Prediction.game_id == game.id)
        )
    ).scalar_one_or_none()
    if pred:
        pred.settlement_status = status
        pred.settled_at = dt.utcnow()
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
        run.settled_at = dt.utcnow()

    return status


async def task_settle_results(target_date: date | None = None) -> None:
    """경기 결과 정산 — 종료 경기의 actual_winner, is_correct, brier_score 를 채운다.

    target_date 미지정 시 전날 종료 경기를 처리.
    정산은 멱등: 이미 settled 된 경기는 건너뜀.
    """
    tgt = target_date or (date.today() - timedelta(days=1))
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
    except Exception:
        logger.exception("[scheduler] settle_results failed")


async def task_crawl_standings() -> None:
    """매일 07:30 — 팀 순위/시즌 성적 수집."""
    logger.info("[scheduler] crawl_standings start")
    try:
        rows = await run_standings_crawl()
        async with AsyncSessionLocal() as session:
            async with session.begin():
                season = date.today().year
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
        logger.info("[scheduler] crawl_standings done: %d teams", len(rows))
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
    year = date.today().year
    logger.info("[scheduler] crawl_batter_stats start: %d", year)
    try:
        stats = await run_batter_stats_all_teams(year)
        async with AsyncSessionLocal() as session:
            async with session.begin():
                for s in stats:
                    await _upsert_batter_season_stat(session, s)
        logger.info("[scheduler] crawl_batter_stats done: %d rows", len(stats))
    except Exception:
        logger.exception("[scheduler] crawl_batter_stats failed")


async def task_crawl_lineup() -> None:
    """매일 14:00 — 당일 경기 선발투수 수집 (네이버 스포츠).

    네이버 API: GET api-gw.sports.naver.com/schedule/games/{naverGameId}
    homeStarterName / awayStarterName 필드 → DB Game.home_starter_id / away_starter_id 갱신.
    KBO 공식 gameId(external_game_id)에서 naverGameId 변환: external_game_id + 시즌년도
    """
    today = date.today()
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
        logger.info("[scheduler] crawl_lineup done: %d/%d games updated", confirmed, len(games))
    except Exception:
        logger.exception("[scheduler] crawl_lineup failed")
