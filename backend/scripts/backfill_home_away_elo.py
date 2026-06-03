"""
홈/원정 분리 ELO 백필 스크립트

전체 시즌 경기를 날짜순으로 재생해 각 팀의 home_elo, away_elo 를 계산 후 DB 업데이트.

사용법:
  cd backend
  python -m scripts.backfill_home_away_elo
"""

import math
import os
from datetime import date

import psycopg2
import psycopg2.extras

RAW_URL = (
    os.environ.get("DATABASE_WEB_URL") or os.environ.get("DATABASE_URL", "")
).replace("postgresql+asyncpg://", "postgresql://")

INITIAL_ELO = 1500.0


def get_k(game_date: date) -> float:
    return 32.0 if game_date.month <= 4 else 20.0


def expected(a: float, b: float) -> float:
    return 1.0 / (1.0 + 10.0 ** ((b - a) / 400.0))


def update(winner: float, loser: float, gdate: date):
    k = get_k(gdate)
    exp = expected(winner, loser)
    return round(winner + k * (1.0 - exp), 4), round(loser + k * (0.0 - (1.0 - exp)), 4)


def run():
    conn = psycopg2.connect(RAW_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()

    # 전체 팀 로드
    cur.execute("SELECT id, code, name, elo_rating FROM teams")
    teams_raw = cur.fetchall()
    home_elo = {t["id"]: INITIAL_ELO for t in teams_raw}
    away_elo = {t["id"]: INITIAL_ELO for t in teams_raw}

    # 모든 완료 경기 날짜순 재생
    cur.execute("""
        SELECT id, game_date, home_team_id, away_team_id, home_score, away_score
        FROM games
        WHERE status = 'final' AND home_score IS NOT NULL AND away_score IS NOT NULL
          AND home_score != away_score
        ORDER BY game_date, id
    """)
    games = cur.fetchall()
    print(f"[백필] 재생 경기 수: {len(games)}")

    for g in games:
        h_id = g["home_team_id"]
        a_id = g["away_team_id"]
        gdate = g["game_date"]

        # 홈팀은 home_elo, 원정팀은 away_elo 기준으로 맞대결
        h_elo = home_elo[h_id]
        a_elo = away_elo[a_id]

        if g["home_score"] > g["away_score"]:
            new_h, new_a = update(h_elo, a_elo, gdate)
            home_elo[h_id] = new_h
            away_elo[a_id] = new_a
        else:
            new_a, new_h = update(a_elo, h_elo, gdate)
            away_elo[a_id] = new_a
            home_elo[h_id] = new_h

    # DB 업데이트
    print("\n[결과] 팀별 홈/원정 ELO")
    print(f"{'팀':<12} {'홈 ELO':>8} {'원정 ELO':>10} {'차이':>8}")
    print("-" * 42)

    for t in sorted(teams_raw, key=lambda x: -home_elo[x["id"]]):
        tid = t["id"]
        h = home_elo[tid]
        a = away_elo[tid]
        name = t["name"][:10]
        print(f"{name:<12} {h:>8.1f} {a:>10.1f} {h-a:>+8.1f}")

        cur.execute(
            "UPDATE teams SET home_elo = %s, away_elo = %s WHERE id = %s",
            (h, a, tid)
        )

    conn.commit()
    print(f"\n[완료] {len(teams_raw)}개 팀 home_elo / away_elo 업데이트 완료")
    cur.close()
    conn.close()


if __name__ == "__main__":
    run()
