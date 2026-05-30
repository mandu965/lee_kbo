"""
테스트용 시드 데이터 생성 스크립트.
외부망 없이 API 동작을 바로 확인할 수 있습니다.

사용법:
  cd backend
  python -m scripts.seed_data

생성 내용:
  - 10개 팀 (2026 KBO 기준 ELO)
  - 팀당 3명 선발 투수
  - 4월~5월 과거 경기 결과 25경기 (ELO 히스토리 포함)
  - 오늘(2026-05-29) 경기 5경기 + 예측
"""

import asyncio
import logging
import random
from datetime import date, time, timedelta

from sqlalchemy import select

from app.database import Base, AsyncSessionLocal, engine
from app.models import EloHistory, Game, PitcherStat, Player, Prediction, Team
from app.engine.elo import update_elo

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger(__name__)

random.seed(42)

# ── 팀 데이터 ─────────────────────────────────────────────────
TEAMS = [
    {"code": "LG",  "name": "LG 트윈스",      "short_name": "LG",  "stadium": "잠실야구장",         "elo": 1542.0},
    {"code": "KIA", "name": "KIA 타이거즈",    "short_name": "KIA", "stadium": "광주기아챔피언스필드", "elo": 1535.0},
    {"code": "SSG", "name": "SSG 랜더스",      "short_name": "SSG", "stadium": "인천SSG랜더스필드",  "elo": 1521.0},
    {"code": "SS",  "name": "삼성 라이온즈",   "short_name": "삼성", "stadium": "대구삼성라이온즈파크", "elo": 1508.0},
    {"code": "KT",  "name": "KT 위즈",         "short_name": "KT",  "stadium": "수원KT위즈파크",     "elo": 1498.0},
    {"code": "WO",  "name": "키움 히어로즈",   "short_name": "키움", "stadium": "고척스카이돔",       "elo": 1498.0},
    {"code": "NC",  "name": "NC 다이노스",     "short_name": "NC",  "stadium": "창원NC파크",         "elo": 1489.0},
    {"code": "OB",  "name": "두산 베어스",     "short_name": "두산", "stadium": "잠실야구장",         "elo": 1476.0},
    {"code": "HH",  "name": "한화 이글스",     "short_name": "한화", "stadium": "대전한화생명볼파크",  "elo": 1471.0},
    {"code": "LT",  "name": "롯데 자이언츠",   "short_name": "롯데", "stadium": "부산사직야구장",     "elo": 1462.0},
]

# ── 선발 투수 (팀코드 → [(이름, ERA, WHIP, IP)]) ────────────────
STARTERS: dict[str, list[tuple]] = {
    "LG":  [("임찬규", 2.81, 1.12, 89.0),  ("케이시 켈리", 3.42, 1.24, 74.2),  ("최원태", 3.95, 1.38, 61.0)],
    "KIA": [("양현종", 2.98, 1.18, 84.0),  ("네일", 3.56, 1.29, 71.0),         ("이의리", 3.78, 1.35, 58.1)],
    "SSG": [("김광현", 2.65, 1.08, 95.1),  ("로에니스 엘리아스", 3.89, 1.41, 67.2), ("서진용", 4.21, 1.48, 52.0)],
    "SS":  [("원태인", 2.92, 1.15, 88.0),  ("백정현", 3.78, 1.36, 69.1),       ("최채흥", 4.15, 1.44, 55.2)],
    "KT":  [("고영표", 3.44, 1.26, 76.1),  ("소형준", 3.78, 1.37, 63.0),       ("벤자민", 4.12, 1.45, 59.0)],
    "WO":  [("안우진", 2.88, 1.13, 90.2),  ("하영민", 3.67, 1.33, 66.0),       ("김인범", 4.45, 1.52, 48.1)],
    "NC":  [("루친스키", 3.12, 1.21, 81.1), ("신민혁", 3.87, 1.39, 65.2),      ("이재학", 4.34, 1.49, 53.0)],
    "OB":  [("알칸타라", 3.24, 1.23, 78.0), ("박치국", 4.11, 1.46, 60.1),      ("김명신", 4.52, 1.55, 47.2)],
    "HH":  [("류현진", 3.21, 1.22, 82.0),  ("문동주", 3.56, 1.31, 70.0),       ("최준호", 4.34, 1.51, 51.1)],
    "LT":  [("찰리 반즈", 3.45, 1.27, 75.0), ("박세웅", 3.89, 1.40, 64.1),     ("나균안", 4.23, 1.48, 54.0)],
}

# ── 과거 경기 일정 (5일 × 5경기) ─────────────────────────────
PAST_GAME_DAYS = [
    date(2026, 4, 15),
    date(2026, 4, 30),
    date(2026, 5, 10),
    date(2026, 5, 20),
    date(2026, 5, 28),
]

PAST_MATCHUPS = [
    ("LG",  "KT"),
    ("KIA", "SSG"),
    ("SS",  "NC"),
    ("HH",  "OB"),
    ("WO",  "LT"),
]

# ── 오늘 경기 (2026-05-29) ────────────────────────────────────
TODAY = date(2026, 5, 29)
TODAY_MATCHUPS = [
    ("LG",  "KT",  time(18, 30), "잠실야구장"),
    ("KIA", "LT",  time(18, 30), "광주기아챔피언스필드"),
    ("SSG", "NC",  time(18, 30), "인천SSG랜더스필드"),
    ("SS",  "OB",  time(18, 30), "대구삼성라이온즈파크"),
    ("WO",  "HH",  time(18, 30), "고척스카이돔"),
]


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Tables created")


async def seed_teams(session) -> dict[str, Team]:
    """10개 팀 생성 후 {code: Team} 반환."""
    team_map: dict[str, Team] = {}
    for t in TEAMS:
        existing = (await session.execute(select(Team).where(Team.code == t["code"]))).scalar_one_or_none()
        if existing:
            team_map[t["code"]] = existing
            continue
        team = Team(
            code=t["code"], name=t["name"], short_name=t["short_name"],
            stadium=t["stadium"], elo_rating=t["elo"],
        )
        session.add(team)
        await session.flush()
        team_map[t["code"]] = team
        logger.info("  팀 생성: %s (ELO %.0f)", t["name"], t["elo"])
    return team_map


async def seed_players(session, team_map: dict[str, Team]) -> dict[str, list[Player]]:
    """선발 투수 생성 후 {team_code: [Player]} 반환."""
    player_map: dict[str, list[Player]] = {}
    for code, starters in STARTERS.items():
        team = team_map[code]
        player_map[code] = []
        for name, era, whip, ip in starters:
            existing = (
                await session.execute(
                    select(Player).where(Player.name == name, Player.team_id == team.id)
                )
            ).scalar_one_or_none()
            if existing:
                player_map[code].append(existing)
                continue
            p = Player(name=name, team_id=team.id, position="P", is_active=True)
            session.add(p)
            await session.flush()
            player_map[code].append(p)
    return player_map


async def seed_pitcher_stats(session, player_map: dict[str, list[Player]]):
    """선발 투수 시즌 성적 생성."""
    season = TODAY.year
    for code, players in player_map.items():
        starters = STARTERS[code]
        for player, (name, era, whip, ip) in zip(players, starters):
            existing = (
                await session.execute(
                    select(PitcherStat).where(
                        PitcherStat.player_id == player.id,
                        PitcherStat.season == season,
                        PitcherStat.game_id == None,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                continue
            # 이닝 수에서 삼진/볼넷 역산
            k = int(ip * (era / 4 + 1) * 0.85)
            bb = int(ip * 0.35)
            h = int(ip * whip - bb)
            er = int(era * ip / 9)
            stat = PitcherStat(
                player_id=player.id,
                game_id=None,
                season=season,
                innings_pitched=ip,
                hits=h,
                earned_runs=er,
                runs=er + random.randint(0, 2),
                walks=bb,
                strikeouts=k,
                era=era,
                whip=whip,
                is_starter=True,
            )
            session.add(stat)


async def seed_past_games(session, team_map: dict[str, Team], player_map: dict[str, list[Player]]):
    """과거 경기 결과 생성 + ELO 업데이트."""
    elo_ratings = {code: team_map[code].elo_rating for code in team_map}

    for game_date in PAST_GAME_DAYS:
        for home_code, away_code in PAST_MATCHUPS:
            home_team = team_map[home_code]
            away_team = team_map[away_code]

            existing = (
                await session.execute(
                    select(Game).where(
                        Game.game_date == game_date,
                        Game.home_team_id == home_team.id,
                        Game.away_team_id == away_team.id,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                continue

            # ELO 기반 승부 결정 (홈 이점 +50 ELO 효과)
            home_elo = elo_ratings[home_code] + 50
            away_elo = elo_ratings[away_code]
            home_win_prob = 1 / (1 + 10 ** ((away_elo - home_elo) / 400))
            home_wins = random.random() < home_win_prob

            # 점수 생성 (현실적인 KBO 점수대)
            winner_score = random.randint(3, 9)
            loser_score = random.randint(0, winner_score - 1)

            home_score = winner_score if home_wins else loser_score
            away_score = loser_score if home_wins else winner_score

            # 선발 투수 (팀 에이스 또는 랜덤)
            home_starter = player_map[home_code][0] if player_map[home_code] else None
            away_starter = player_map[away_code][0] if player_map[away_code] else None

            game = Game(
                game_date=game_date,
                home_team_id=home_team.id,
                away_team_id=away_team.id,
                stadium=home_team.stadium,
                start_time=time(18, 30),
                status="final",
                home_score=home_score,
                away_score=away_score,
                home_starter_id=home_starter.id if home_starter else None,
                away_starter_id=away_starter.id if away_starter else None,
            )
            session.add(game)
            await session.flush()

            # ELO 업데이트
            winner_code = home_code if home_wins else away_code
            loser_code = away_code if home_wins else home_code

            elo_w = elo_ratings[winner_code]
            elo_l = elo_ratings[loser_code]
            new_w, new_l = update_elo(elo_w, elo_l, game_date)
            elo_ratings[winner_code] = new_w
            elo_ratings[loser_code] = new_l

            session.add(EloHistory(
                team_id=team_map[winner_code].id, game_id=game.id,
                elo_before=elo_w, elo_after=new_w, elo_change=round(new_w - elo_w, 4),
                game_date=game_date,
            ))
            session.add(EloHistory(
                team_id=team_map[loser_code].id, game_id=game.id,
                elo_before=elo_l, elo_after=new_l, elo_change=round(new_l - elo_l, 4),
                game_date=game_date,
            ))

    # 최종 ELO 를 팀 테이블에 반영
    for code, elo in elo_ratings.items():
        team_map[code].elo_rating = elo
        session.add(team_map[code])

    logger.info("과거 경기 %d일 × 5경기 생성 완료", len(PAST_GAME_DAYS))


async def seed_today_games(session, team_map: dict[str, Team], player_map: dict[str, list[Player]]):
    """오늘 경기 5경기 + 예측 생성."""
    from app.engine.elo import expected_win_prob
    from app.engine.form_calculator import pitcher_score, pitcher_adjustment

    for home_code, away_code, start_time, stadium in TODAY_MATCHUPS:
        home_team = team_map[home_code]
        away_team = team_map[away_code]

        existing = (
            await session.execute(
                select(Game).where(
                    Game.game_date == TODAY,
                    Game.home_team_id == home_team.id,
                    Game.away_team_id == away_team.id,
                )
            )
        ).scalar_one_or_none()

        if existing:
            game = existing
        else:
            home_starter = player_map[home_code][0] if player_map[home_code] else None
            away_starter = player_map[away_code][0] if player_map[away_code] else None

            game = Game(
                game_date=TODAY,
                home_team_id=home_team.id,
                away_team_id=away_team.id,
                stadium=stadium,
                start_time=start_time,
                status="scheduled",
                home_starter_id=home_starter.id if home_starter else None,
                away_starter_id=away_starter.id if away_starter else None,
            )
            session.add(game)
            await session.flush()

        # 예측 계산
        elo_prob = expected_win_prob(home_team.elo_rating, away_team.elo_rating)
        elo_diff = home_team.elo_rating - away_team.elo_rating

        home_s = STARTERS[home_code][0]
        away_s = STARTERS[away_code][0]
        ps_h = pitcher_score(home_s[1], home_s[2])
        ps_a = pitcher_score(away_s[1], away_s[2])
        adj_p = pitcher_adjustment(ps_h, ps_a)
        adj_home = 0.03

        raw_prob = 0.45 * elo_prob + 0.30 * (0.5 + adj_p) + 0.15 * 0.5 + 0.10 * (0.5 + adj_home)
        home_prob = round(max(0.05, min(0.95, raw_prob)), 4)
        away_prob = round(1 - home_prob, 4)

        predicted_winner_id = home_team.id if home_prob >= 0.5 else away_team.id

        key_factors = [
            f"ELO 차이 {elo_diff:+.1f} ({'홈' if elo_diff > 0 else '원정'} 우위)",
            f"홈 선발({home_s[0]}) ERA {home_s[1]} vs 원정 선발({away_s[0]}) ERA {away_s[1]}",
            f"홈 이점 보정 포함",
        ]

        existing_pred = (
            await session.execute(select(Prediction).where(Prediction.game_id == game.id))
        ).scalar_one_or_none()

        if not existing_pred:
            pred = Prediction(
                game_id=game.id,
                home_win_prob=home_prob,
                away_win_prob=away_prob,
                predicted_winner_id=predicted_winner_id,
                elo_diff=round(elo_diff, 2),
                pitcher_score_home=round(ps_h, 4),
                pitcher_score_away=round(ps_a, 4),
                recent_form_home=0.5,
                recent_form_away=0.5,
                model_version="v1.0-seed",
            )
            session.add(pred)

        logger.info(
            "  오늘 경기: %s vs %s → 홈 승률 %.1f%%",
            home_team.short_name, away_team.short_name, home_prob * 100,
        )


async def main():
    logger.info("=== 시드 데이터 생성 시작 ===")
    await create_tables()

    async with AsyncSessionLocal() as session:
        async with session.begin():
            logger.info("1. 팀 생성")
            team_map = await seed_teams(session)

            logger.info("2. 선발 투수 생성")
            player_map = await seed_players(session, team_map)

            logger.info("3. 투수 시즌 성적 생성")
            await seed_pitcher_stats(session, player_map)

            logger.info("4. 과거 경기 결과 + ELO 히스토리 생성")
            await seed_past_games(session, team_map, player_map)

            logger.info("5. 오늘 경기 + 예측 생성")
            await seed_today_games(session, team_map, player_map)

    logger.info("=== 시드 데이터 생성 완료 ===")
    logger.info("")
    logger.info("API 테스트:")
    logger.info("  GET http://localhost:8002/health")
    logger.info("  GET http://localhost:8002/v1/games/today")
    logger.info("  GET http://localhost:8002/v1/teams")
    logger.info("  GET http://localhost:8002/v1/predictions/accuracy")
    logger.info("  Swagger: http://localhost:8002/docs")


if __name__ == "__main__":
    asyncio.run(main())
