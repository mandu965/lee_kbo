"""
2026 시즌 과거 경기 데이터 생성 (백테스팅용)

- 기간: 4월 1일 ~ 전날 (오늘 경기 제외)
- 10개 팀 라운드로빈 순환 매치업
- ELO 가중 랜덤 결과
- 생성 규모: 약 170경기 (7주 × 5일 × 5경기)

사용법:
  cd backend
  python -m scripts.generate_season_data          # 기존 시즌 데이터 삭제 후 재생성
  python -m scripts.generate_season_data --keep   # 기존 데이터 유지하고 추가
"""

import argparse
import asyncio
import logging
import random
from datetime import date, timedelta, time as dtime
from itertools import cycle

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base, AsyncSessionLocal, engine
from app.engine.elo import expected_win_prob, update_elo
from app.models import EloHistory, Game, PitcherStat, Player, Prediction, Team

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger(__name__)

random.seed(2026)

# ── 팀 설정 ──────────────────────────────────────────────────
TEAMS = [
    {"code": "LG",  "name": "LG 트윈스",    "short_name": "LG",  "stadium": "잠실야구장",         "elo": 1500.0},
    {"code": "KIA", "name": "KIA 타이거즈",  "short_name": "KIA", "stadium": "광주기아챔피언스필드", "elo": 1500.0},
    {"code": "SSG", "name": "SSG 랜더스",    "short_name": "SSG", "stadium": "인천SSG랜더스필드",  "elo": 1500.0},
    {"code": "SS",  "name": "삼성 라이온즈", "short_name": "삼성", "stadium": "대구삼성라이온즈파크", "elo": 1500.0},
    {"code": "KT",  "name": "KT 위즈",       "short_name": "KT",  "stadium": "수원KT위즈파크",     "elo": 1500.0},
    {"code": "WO",  "name": "키움 히어로즈", "short_name": "키움", "stadium": "고척스카이돔",       "elo": 1500.0},
    {"code": "NC",  "name": "NC 다이노스",   "short_name": "NC",  "stadium": "창원NC파크",         "elo": 1500.0},
    {"code": "OB",  "name": "두산 베어스",   "short_name": "두산", "stadium": "잠실야구장",         "elo": 1500.0},
    {"code": "HH",  "name": "한화 이글스",   "short_name": "한화", "stadium": "대전한화생명볼파크",  "elo": 1500.0},
    {"code": "LT",  "name": "롯데 자이언츠", "short_name": "롯데", "stadium": "부산사직야구장",     "elo": 1500.0},
]

# 선발 투수 (팀 코드 → [(이름, ERA, WHIP)])
STARTERS = {
    "LG":  [("임찬규", 2.81, 1.12), ("케이시 켈리", 3.42, 1.24), ("최원태", 3.95, 1.38)],
    "KIA": [("양현종", 2.98, 1.18), ("네일", 3.56, 1.29),       ("이의리", 3.78, 1.35)],
    "SSG": [("김광현", 2.65, 1.08), ("로에니스 엘리아스", 3.89, 1.41), ("서진용", 4.21, 1.48)],
    "SS":  [("원태인", 2.92, 1.15), ("백정현", 3.78, 1.36),     ("최채흥", 4.15, 1.44)],
    "KT":  [("고영표", 3.44, 1.26), ("소형준", 3.78, 1.37),     ("벤자민", 4.12, 1.45)],
    "WO":  [("안우진", 2.88, 1.13), ("하영민", 3.67, 1.33),     ("김인범", 4.45, 1.52)],
    "NC":  [("루친스키", 3.12, 1.21), ("신민혁", 3.87, 1.39),   ("이재학", 4.34, 1.49)],
    "OB":  [("알칸타라", 3.24, 1.23), ("박치국", 4.11, 1.46),   ("김명신", 4.52, 1.55)],
    "HH":  [("류현진", 3.21, 1.22), ("문동주", 3.56, 1.31),     ("최준호", 4.34, 1.51)],
    "LT":  [("찰리 반즈", 3.45, 1.27), ("박세웅", 3.89, 1.40), ("나균안", 4.23, 1.48)],
}

# 10팀 라운드로빈 — 한 라운드(9경기일)에 모든 팀이 서로 한 번씩 맞붙음
# 표준 라운드로빈 알고리즘: 팀 0을 고정하고 나머지 9개를 순환
def generate_round_robin(teams: list) -> list[list[tuple]]:
    """각 원소가 경기일의 5경기 매치업 리스트인 라운드 리스트 반환."""
    n = len(teams)  # 10
    rotated = list(range(1, n))
    rounds = []
    for _ in range(n - 1):
        pairs = [(0, rotated[n // 2 - 1])]
        for i in range(1, n // 2):
            pairs.append((rotated[i - 1], rotated[n - 1 - i]))
        rounds.append([(teams[a], teams[b]) for a, b in pairs])
        rotated = [rotated[-1]] + rotated[:-1]
    return rounds  # 9라운드 × 5경기


def generate_schedule(start: date, end: date) -> list[tuple[date, str, str]]:
    """(경기일, 홈팀코드, 원정팀코드) 목록 반환."""
    team_codes = [t["code"] for t in TEAMS]
    rounds = generate_round_robin(team_codes)  # 9라운드

    # 라운드를 반복하면서 날짜에 배정 (월~금, 주말 제외)
    schedule: list[tuple[date, str, str]] = []
    round_cycle = cycle(rounds)
    current = start

    while current <= end:
        # 일요일(6)은 건너뜀 (KBO 주 5~6일 경기)
        if current.weekday() != 6:
            day_round = next(round_cycle)
            for home_code, away_code in day_round:
                schedule.append((current, home_code, away_code))
        current += timedelta(days=1)

    return schedule


async def clear_season_data(session: AsyncSession):
    """기존 시즌 데이터 삭제 (팀/선수 제외)."""
    await session.execute(delete(Prediction))
    await session.execute(delete(EloHistory))
    await session.execute(delete(PitcherStat))
    await session.execute(delete(Game))
    logger.info("기존 경기/예측/ELO 데이터 삭제 완료")


async def upsert_teams(session: AsyncSession) -> dict[str, Team]:
    from sqlalchemy import select
    team_map: dict[str, Team] = {}
    for t in TEAMS:
        row = (await session.execute(select(Team).where(Team.code == t["code"]))).scalar_one_or_none()
        if row is None:
            row = Team(code=t["code"], name=t["name"], short_name=t["short_name"],
                       stadium=t["stadium"], elo_rating=t["elo"])
            session.add(row)
            await session.flush()
        else:
            row.elo_rating = t["elo"]
        team_map[t["code"]] = row
    return team_map


async def upsert_players(session: AsyncSession, team_map: dict[str, Team]) -> dict[str, list[Player]]:
    from sqlalchemy import select
    player_map: dict[str, list[Player]] = {}
    for code, starters in STARTERS.items():
        team = team_map[code]
        player_map[code] = []
        for name, _, _ in starters:
            p = (await session.execute(
                select(Player).where(Player.name == name, Player.team_id == team.id)
            )).scalar_one_or_none()
            if p is None:
                p = Player(name=name, team_id=team.id, position="P", is_active=True)
                session.add(p)
                await session.flush()
            player_map[code].append(p)
    return player_map


async def upsert_pitcher_stats(session: AsyncSession, player_map: dict[str, list[Player]], season: int):
    from sqlalchemy import select
    for code, players in player_map.items():
        for player, (name, era, whip) in zip(players, STARTERS[code]):
            exists = (await session.execute(
                select(PitcherStat).where(
                    PitcherStat.player_id == player.id,
                    PitcherStat.season == season,
                    PitcherStat.game_id == None,
                )
            )).scalar_one_or_none()
            if exists:
                continue
            ip = 80.0 + random.uniform(-20, 20)
            session.add(PitcherStat(
                player_id=player.id, game_id=None, season=season,
                innings_pitched=round(ip, 1),
                era=era, whip=whip,
                earned_runs=int(era * ip / 9),
                hits=int(whip * ip - ip * 0.35),
                walks=int(ip * 0.35),
                strikeouts=int(ip * (era / 4 + 1) * 0.85),
                is_starter=True,
            ))


async def generate_games(
    session: AsyncSession,
    schedule: list[tuple[date, str, str]],
    team_map: dict[str, Team],
    player_map: dict[str, list[Player]],
) -> dict[str, float]:
    """경기 생성 + ELO 업데이트. 최종 ELO 딕셔너리 반환."""
    elo: dict[str, float] = {code: 1500.0 for code in team_map}
    starter_idx: dict[str, int] = {code: 0 for code in team_map}

    for game_date, home_code, away_code in schedule:
        home_team = team_map[home_code]
        away_team = team_map[away_code]

        # ELO 기반 승부 결정 (홈 이점 +40 ELO 보정)
        hw = expected_win_prob(elo[home_code] + 40, elo[away_code])
        home_wins = random.random() < hw

        winner_score = random.randint(2, 9)
        loser_score = random.randint(0, max(0, winner_score - 1))
        home_score = winner_score if home_wins else loser_score
        away_score = loser_score if home_wins else winner_score

        # 선발 투수 순환 배정
        hi = starter_idx[home_code] % len(player_map[home_code])
        ai = starter_idx[away_code] % len(player_map[away_code])
        home_starter = player_map[home_code][hi]
        away_starter = player_map[away_code][ai]
        starter_idx[home_code] += 1
        starter_idx[away_code] += 1

        game = Game(
            game_date=game_date,
            home_team_id=home_team.id,
            away_team_id=away_team.id,
            stadium=home_team.stadium,
            start_time=dtime(18, 30),
            status="final",
            home_score=home_score,
            away_score=away_score,
            home_starter_id=home_starter.id,
            away_starter_id=away_starter.id,
        )
        session.add(game)
        await session.flush()

        # ELO 업데이트
        winner_code = home_code if home_wins else away_code
        loser_code = away_code if home_wins else home_code
        elo_w, elo_l = elo[winner_code], elo[loser_code]
        new_w, new_l = update_elo(elo_w, elo_l, game_date)
        elo[winner_code], elo[loser_code] = new_w, new_l

        session.add(EloHistory(team_id=team_map[winner_code].id, game_id=game.id,
                               elo_before=elo_w, elo_after=new_w,
                               elo_change=round(new_w - elo_w, 4), game_date=game_date))
        session.add(EloHistory(team_id=team_map[loser_code].id, game_id=game.id,
                               elo_before=elo_l, elo_after=new_l,
                               elo_change=round(new_l - elo_l, 4), game_date=game_date))

    return elo


async def main(keep: bool = False):
    season = 2026
    start = date(season, 4, 1)
    end = date.today() - timedelta(days=1)

    logger.info("=== 시즌 데이터 생성 시작 ===")
    logger.info("기간: %s ~ %s", start, end)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        async with session.begin():
            if not keep:
                await clear_season_data(session)

            logger.info("1. 팀/선수 데이터 준비")
            team_map = await upsert_teams(session)
            player_map = await upsert_players(session, team_map)
            await upsert_pitcher_stats(session, player_map, season)

            logger.info("2. 경기 일정 생성")
            schedule = generate_schedule(start, end)
            logger.info("   일정: %d경기", len(schedule))

            logger.info("3. 경기 결과 + ELO 시뮬레이션")
            final_elo = await generate_games(session, schedule, team_map, player_map)

            # 팀 ELO 최종 반영
            for code, elo_val in final_elo.items():
                team_map[code].elo_rating = elo_val
                session.add(team_map[code])

    logger.info("=== 데이터 생성 완료 ===")
    logger.info("생성된 경기: %d", len(schedule))
    logger.info("")
    logger.info("최종 ELO 순위:")
    ranked = sorted(final_elo.items(), key=lambda x: -x[1])
    for rank, (code, elo_val) in enumerate(ranked, 1):
        name = next(t["name"] for t in TEAMS if t["code"] == code)
        logger.info("  %2d. %s  %.1f", rank, name, elo_val)
    logger.info("")
    logger.info("다음 단계: python -m scripts.backtest --start %s --end %s", start, end)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="시즌 데이터 생성")
    parser.add_argument("--keep", action="store_true", help="기존 데이터 유지")
    args = parser.parse_args()
    asyncio.run(main(keep=args.keep))
