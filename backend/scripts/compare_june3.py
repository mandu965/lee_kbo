"""
6월 3일 경기 v2.1 vs v2.2 예측 비교 (psycopg2 동기 버전)

사용법:
  cd backend
  python -m scripts.compare_june3
"""

import math
import os
import psycopg2
import psycopg2.extras
from datetime import date

TARGET_DATE = date(2026, 6, 3)

# DB URL 변환: postgresql+asyncpg:// → postgresql://
RAW_URL = os.environ.get("DATABASE_WEB_URL") or os.environ.get("DATABASE_URL", "")
RAW_URL = RAW_URL.replace("postgresql+asyncpg://", "postgresql://")

W1 = {"elo": 0.40, "pitcher": 0.28, "form": 0.14,
      "home_adv": 0.08, "park": 0.05, "weather": 0.03, "bullpen": 0.02}
W2 = {"elo": 0.38, "pitcher": 0.27, "form": 0.13,
      "home_adv": 0.08, "park": 0.04, "weather": 0.03, "bullpen": 0.02, "h2h": 0.05}
HOME_ADV = 0.03
ERA_AVG, WHIP_AVG = 4.50, 1.40


# ── 예측 공식 ─────────────────────────────────────────────────

def elo_win_prob(elo_h, elo_a):
    return 1.0 / (1.0 + 10 ** ((elo_a - elo_h) / 400.0))


def pitcher_score(era, whip, recent_avg=0.5):
    e = era if (era and era > 0) else ERA_AVG
    w = whip if (whip and whip > 0) else WHIP_AVG
    return (1.0 / e) * 0.5 + (1.0 / w) * 0.3 + recent_avg * 0.2


def pitcher_adj(ps_h, ps_a):
    raw = ps_h - ps_a
    return 0.3 / (1.0 + math.exp(-raw * 10)) - 0.15


def recent_form(results):
    if not results:
        return 0.5
    win_rate = sum(1 for w, _ in results if w) / len(results)
    avg_diff = sum(d for _, d in results) / len(results)
    norm = 1.0 / (1.0 + math.exp(-avg_diff / 3.0))
    return win_rate * 0.7 + norm * 0.3


def era_to_recent_avg(total_er, total_ip):
    if total_ip <= 0:
        return 0.5
    era = (total_er / total_ip) * 9
    return 1.0 / (1.0 + math.exp((era - 4.5) / 1.5))


# ── DB 쿼리 ───────────────────────────────────────────────────

def get_games(cur):
    cur.execute("""
        SELECT g.id, g.home_team_id, g.away_team_id,
               g.home_score, g.away_score,
               g.home_starter_id, g.away_starter_id,
               g.weather_temp, g.weather_cond, g.stadium
        FROM games g
        WHERE g.game_date = %s AND g.status = 'final' AND g.home_score IS NOT NULL
        ORDER BY g.id
    """, (TARGET_DATE,))
    return cur.fetchall()


def get_team(cur, team_id):
    cur.execute("SELECT id, name, short_name, elo_rating FROM teams WHERE id=%s", (team_id,))
    return cur.fetchone()


def get_recent_results(cur, team_id, n=10):
    cur.execute("""
        SELECT home_team_id, away_team_id, home_score, away_score
        FROM games
        WHERE status='final' AND game_date < %s
          AND (home_team_id=%s OR away_team_id=%s)
          AND home_score IS NOT NULL
        ORDER BY game_date DESC LIMIT %s
    """, (TARGET_DATE, team_id, team_id, n))
    rows = cur.fetchall()
    out = []
    for r in rows:
        is_home = r["home_team_id"] == team_id
        my = r["home_score"] if is_home else r["away_score"]
        opp = r["away_score"] if is_home else r["home_score"]
        out.append((my > opp, my - opp))
    return out


def get_starter_stats(cur, player_id, season):
    if not player_id:
        return None, None
    cur.execute("""
        SELECT era, whip FROM pitcher_stats
        WHERE player_id=%s AND season=%s AND game_id IS NULL AND is_starter=TRUE
        ORDER BY id DESC LIMIT 1
    """, (player_id, season))
    r = cur.fetchone()
    return (r["era"], r["whip"]) if r else (None, None)


def get_recent_starter_avg(cur, player_id, season):
    if not player_id:
        return 0.5
    cur.execute("""
        SELECT ps.innings_pitched, ps.earned_runs
        FROM pitcher_stats ps
        JOIN games g ON ps.game_id = g.id
        WHERE ps.player_id=%s AND ps.season=%s
          AND ps.game_id IS NOT NULL AND ps.is_starter=TRUE
          AND g.game_date < %s AND g.status='final'
        ORDER BY g.game_date DESC LIMIT 5
    """, (player_id, season, TARGET_DATE))
    rows = cur.fetchall()
    if not rows:
        return 0.5
    total_ip = sum(r["innings_pitched"] or 0 for r in rows)
    total_er = sum(r["earned_runs"] or 0 for r in rows)
    return era_to_recent_avg(total_er, total_ip)


def get_h2h(cur, home_id, away_id, n=20):
    cur.execute("""
        SELECT home_team_id, away_team_id, home_score, away_score
        FROM games
        WHERE status='final' AND game_date < %s
          AND home_score IS NOT NULL AND home_score != away_score
          AND ((home_team_id=%s AND away_team_id=%s)
            OR (home_team_id=%s AND away_team_id=%s))
        ORDER BY game_date DESC LIMIT %s
    """, (TARGET_DATE, home_id, away_id, away_id, home_id, n))
    rows = cur.fetchall()
    wins, total = 0, 0
    for r in rows:
        total += 1
        if r["home_team_id"] == home_id and r["home_score"] > r["away_score"]:
            wins += 1
        elif r["away_team_id"] == home_id and r["away_score"] > r["home_score"]:
            wins += 1
    if total < 5:
        return 0.5, total
    return round(wins / total, 4), total


# ── 메인 ─────────────────────────────────────────────────────

def main():
    conn = psycopg2.connect(RAW_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()
    season = TARGET_DATE.year

    games = get_games(cur)
    print(f"\n{'='*80}")
    print(f"  6월 3일 예측 비교 (v2.1 → v2.2)   대상: {len(games)}경기")
    print(f"{'='*80}")
    print(f"{'경기':<20} {'결과':^5} {'v2.1':^7} {'v2.2':^7} {'차이':^7} {'v2.1':^4} {'v2.2':^4}  새 피처")
    print(f"{'-'*80}")

    v1_ok, v2_ok, total = 0, 0, 0

    for g in games:
        home = get_team(cur, g["home_team_id"])
        away = get_team(cur, g["away_team_id"])
        hn = (home["short_name"] or home["name"])[:5]
        an = (away["short_name"] or away["name"])[:5]

        elo_w = elo_win_prob(home["elo_rating"], away["elo_rating"])

        era_h, whip_h = get_starter_stats(cur, g["home_starter_id"], season)
        era_a, whip_a = get_starter_stats(cur, g["away_starter_id"], season)

        res_h = get_recent_results(cur, home["id"])
        res_a = get_recent_results(cur, away["id"])
        adj_form = (recent_form(res_h) - recent_form(res_a)) * 0.3

        # v2.1
        ps_h1 = pitcher_score(era_h, whip_h, 0.5)
        ps_a1 = pitcher_score(era_a, whip_a, 0.5)
        raw1 = (W1["elo"]*elo_w + W1["pitcher"]*(0.5+pitcher_adj(ps_h1,ps_a1))
                + W1["form"]*(0.5+adj_form) + W1["home_adv"]*(0.5+HOME_ADV)
                + W1["park"]*0.5 + W1["weather"]*0.5 + W1["bullpen"]*0.5)
        prob1 = round(max(0.05, min(0.95, raw1)), 4)

        # v2.2
        rec_h = get_recent_starter_avg(cur, g["home_starter_id"], season)
        rec_a = get_recent_starter_avg(cur, g["away_starter_id"], season)
        ps_h2 = pitcher_score(era_h, whip_h, rec_h)
        ps_a2 = pitcher_score(era_a, whip_a, rec_a)
        h2h_rate, h2h_cnt = get_h2h(cur, home["id"], away["id"])
        raw2 = (W2["elo"]*elo_w + W2["pitcher"]*(0.5+pitcher_adj(ps_h2,ps_a2))
                + W2["form"]*(0.5+adj_form) + W2["home_adv"]*(0.5+HOME_ADV)
                + W2["park"]*0.5 + W2["weather"]*0.5 + W2["bullpen"]*0.5
                + W2["h2h"]*h2h_rate)
        prob2 = round(max(0.05, min(0.95, raw2)), 4)

        # 결과
        if g["home_score"] > g["away_score"]: actual = "홈"
        elif g["away_score"] > g["home_score"]: actual = "원"
        else: actual = "무"

        pred1 = "홈" if prob1 >= 0.5 else "원"
        pred2 = "홈" if prob2 >= 0.5 else "원"
        ok1 = "O" if pred1 == actual else "X"
        ok2 = "O" if pred2 == actual else "X"
        diff = f"{(prob2-prob1)*100:+.1f}%"

        new_feat = f"H2H {h2h_cnt}경기 {h2h_rate*100:.0f}% | 최근ERA 홈{rec_h:.2f}/원{rec_a:.2f}"
        print(f"{an+'@'+hn:<20} {actual:^5} {prob1*100:>5.1f}%  {prob2*100:>5.1f}%  {diff:^7} {ok1:^4} {ok2:^4}  {new_feat}")

        if actual != "무":
            total += 1
            if pred1 == actual: v1_ok += 1
            if pred2 == actual: v2_ok += 1

    print(f"{'='*80}")
    print(f"  v2.1: {v1_ok}/{total} ({v1_ok/total*100:.0f}%)")
    print(f"  v2.2: {v2_ok}/{total} ({v2_ok/total*100:.0f}%)")
    print(f"{'='*80}\n")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
