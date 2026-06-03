"""
전체 시즌 백테스트 — v2.1 vs v2.2 비교 (psycopg2 동기 버전)

사용법:
  cd backend
  python -m scripts.backtest_sync

결과는 결과 딕셔너리로 반환되며 호출 측에서 마크다운 정리
"""

import math
import os
from collections import defaultdict
from datetime import date, timedelta

import psycopg2
import psycopg2.extras

RAW_URL = os.environ.get("DATABASE_WEB_URL") or os.environ.get("DATABASE_URL", "")
RAW_URL = RAW_URL.replace("postgresql+asyncpg://", "postgresql://")

W1 = {"elo": 0.40, "pitcher": 0.28, "form": 0.14,
      "home_adv": 0.08, "park": 0.05, "weather": 0.03, "bullpen": 0.02}
W2 = {"elo": 0.38, "pitcher": 0.27, "form": 0.13,
      "home_adv": 0.08, "park": 0.04, "weather": 0.03, "bullpen": 0.02, "h2h": 0.05}
HOME_ADV = 0.03
ERA_AVG, WHIP_AVG = 4.50, 1.40


# ── 수식 ──────────────────────────────────────────────────────

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

def era_to_score(total_er, total_ip):
    if total_ip <= 0:
        return 0.5
    era = (total_er / total_ip) * 9
    return 1.0 / (1.0 + math.exp((era - 4.5) / 1.5))

def confidence_band(prob):
    c = abs(prob - 0.5)
    if c < 0.05: return "50-55%"
    elif c < 0.10: return "55-60%"
    elif c < 0.15: return "60-65%"
    elif c < 0.20: return "65-70%"
    else: return "70%+"


# ── DB 쿼리 ───────────────────────────────────────────────────

def get_all_games(cur, start, end):
    cur.execute("""
        SELECT g.id, g.game_date, g.home_team_id, g.away_team_id,
               g.home_score, g.away_score,
               g.home_starter_id, g.away_starter_id,
               g.weather_temp, g.weather_cond, g.stadium
        FROM games g
        WHERE g.game_date >= %s AND g.game_date <= %s
          AND g.status = 'final' AND g.home_score IS NOT NULL
        ORDER BY g.game_date, g.id
    """, (start, end))
    return cur.fetchall()

def get_all_teams(cur):
    cur.execute("SELECT id, name, short_name, elo_rating FROM teams")
    return {r["id"]: r for r in cur.fetchall()}

def get_recent_results(cur, team_id, before_date, n=10):
    cur.execute("""
        SELECT home_team_id, away_team_id, home_score, away_score
        FROM games
        WHERE status='final' AND game_date < %s
          AND (home_team_id=%s OR away_team_id=%s)
          AND home_score IS NOT NULL
        ORDER BY game_date DESC LIMIT %s
    """, (before_date, team_id, team_id, n))
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

def get_recent_starter_avg(cur, player_id, season, before_date):
    if not player_id:
        return 0.5, 0
    cur.execute("""
        SELECT ps.innings_pitched, ps.earned_runs
        FROM pitcher_stats ps
        JOIN games g ON ps.game_id = g.id
        WHERE ps.player_id=%s AND ps.season=%s
          AND ps.game_id IS NOT NULL AND ps.is_starter=TRUE
          AND g.game_date < %s AND g.status='final'
        ORDER BY g.game_date DESC LIMIT 5
    """, (player_id, season, before_date))
    rows = cur.fetchall()
    if not rows:
        return 0.5, 0
    total_ip = sum(r["innings_pitched"] or 0.0 for r in rows)
    total_er = sum(r["earned_runs"] or 0 for r in rows)
    return era_to_score(total_er, total_ip), len(rows)

def get_h2h(cur, home_id, away_id, before_date, n=20):
    cur.execute("""
        SELECT home_team_id, away_team_id, home_score, away_score
        FROM games
        WHERE status='final' AND game_date < %s
          AND home_score IS NOT NULL AND home_score != away_score
          AND ((home_team_id=%s AND away_team_id=%s)
            OR (home_team_id=%s AND away_team_id=%s))
        ORDER BY game_date DESC LIMIT %s
    """, (before_date, home_id, away_id, away_id, home_id, n))
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


# ── 예측 ─────────────────────────────────────────────────────

def predict(game, teams, cur, use_v2=False):
    home = teams[game["home_team_id"]]
    away = teams[game["away_team_id"]]
    season = game["game_date"].year
    gdate = game["game_date"]

    elo_w = elo_win_prob(home["elo_rating"], away["elo_rating"])
    era_h, whip_h = get_starter_stats(cur, game["home_starter_id"], season)
    era_a, whip_a = get_starter_stats(cur, game["away_starter_id"], season)
    res_h = get_recent_results(cur, home["id"], gdate)
    res_a = get_recent_results(cur, away["id"], gdate)
    adj_form = (recent_form(res_h) - recent_form(res_a)) * 0.3

    if use_v2:
        rec_h, _ = get_recent_starter_avg(cur, game["home_starter_id"], season, gdate)
        rec_a, _ = get_recent_starter_avg(cur, game["away_starter_id"], season, gdate)
        ps_h = pitcher_score(era_h, whip_h, rec_h)
        ps_a = pitcher_score(era_a, whip_a, rec_a)
        h2h_rate, _ = get_h2h(cur, home["id"], away["id"], gdate)
        W = W2
        raw = (W["elo"]*elo_w + W["pitcher"]*(0.5+pitcher_adj(ps_h,ps_a))
               + W["form"]*(0.5+adj_form) + W["home_adv"]*(0.5+HOME_ADV)
               + W["park"]*0.5 + W["weather"]*0.5 + W["bullpen"]*0.5
               + W["h2h"]*h2h_rate)
    else:
        ps_h = pitcher_score(era_h, whip_h, 0.5)
        ps_a = pitcher_score(era_a, whip_a, 0.5)
        W = W1
        raw = (W["elo"]*elo_w + W["pitcher"]*(0.5+pitcher_adj(ps_h,ps_a))
               + W["form"]*(0.5+adj_form) + W["home_adv"]*(0.5+HOME_ADV)
               + W["park"]*0.5 + W["weather"]*0.5 + W["bullpen"]*0.5)

    return round(max(0.05, min(0.95, raw)), 4)


# ── 메인 ─────────────────────────────────────────────────────

def run_backtest(start=date(2026, 4, 1), end=date(2026, 6, 3)):
    conn = psycopg2.connect(RAW_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()

    games = get_all_games(cur, start, end)
    teams = get_all_teams(cur)

    print(f"[백테스트] 기간: {start} ~ {end}  대상: {len(games)}경기")

    results = []
    for i, g in enumerate(games, 1):
        if i % 20 == 0:
            print(f"  진행: {i}/{len(games)}")

        prob1 = predict(g, teams, cur, use_v2=False)
        prob2 = predict(g, teams, cur, use_v2=True)

        hs, as_ = g["home_score"], g["away_score"]
        if hs > as_: actual = "home"
        elif as_ > hs: actual = "away"
        else: actual = "draw"

        pred1 = "home" if prob1 >= 0.5 else "away"
        pred2 = "home" if prob2 >= 0.5 else "away"

        results.append({
            "game_id": g["id"],
            "game_date": g["game_date"],
            "month": g["game_date"].month,
            "home": teams[g["home_team_id"]]["short_name"] or teams[g["home_team_id"]]["name"],
            "away": teams[g["away_team_id"]]["short_name"] or teams[g["away_team_id"]]["name"],
            "home_prob1": prob1,
            "home_prob2": prob2,
            "actual": actual,
            "pred1": pred1,
            "pred2": pred2,
            "ok1": pred1 == actual if actual != "draw" else None,
            "ok2": pred2 == actual if actual != "draw" else None,
            "band1": confidence_band(prob1),
            "band2": confidence_band(prob2),
        })

    cur.close()
    conn.close()
    return results


def summarize(results):
    valid = [r for r in results if r["actual"] != "draw"]
    draws = len(results) - len(valid)
    total = len(valid)

    ok1 = sum(1 for r in valid if r["ok1"])
    ok2 = sum(1 for r in valid if r["ok2"])

    # 월별
    by_month1 = defaultdict(lambda: [0, 0])
    by_month2 = defaultdict(lambda: [0, 0])
    for r in valid:
        m = r["month"]
        by_month1[m][1] += 1
        by_month2[m][1] += 1
        if r["ok1"]: by_month1[m][0] += 1
        if r["ok2"]: by_month2[m][0] += 1

    # 컨피던스 밴드별
    by_band1 = defaultdict(lambda: [0, 0])
    by_band2 = defaultdict(lambda: [0, 0])
    for r in valid:
        b1, b2 = r["band1"], r["band2"]
        by_band1[b1][1] += 1
        by_band2[b2][1] += 1
        if r["ok1"]: by_band1[b1][0] += 1
        if r["ok2"]: by_band2[b2][0] += 1

    return {
        "total": total, "draws": draws,
        "ok1": ok1, "ok2": ok2,
        "acc1": ok1/total if total else 0,
        "acc2": ok2/total if total else 0,
        "by_month1": dict(by_month1),
        "by_month2": dict(by_month2),
        "by_band1": dict(by_band1),
        "by_band2": dict(by_band2),
    }


if __name__ == "__main__":
    results = run_backtest()
    s = summarize(results)

    print(f"\n{'='*55}")
    print(f"  전체  {s['total']}경기 (무승부 제외 {s['draws']}경기)")
    print(f"  v2.1  {s['ok1']}/{s['total']}  {s['acc1']*100:.1f}%")
    print(f"  v2.2  {s['ok2']}/{s['total']}  {s['acc2']*100:.1f}%")
    print(f"  개선  {(s['acc2']-s['acc1'])*100:+.1f}%p")
    print(f"{'='*55}")

    print("\n[월별]")
    for m in sorted(s["by_month1"]):
        c1, t1 = s["by_month1"][m]
        c2, t2 = s["by_month2"][m]
        print(f"  {m}월  v2.1 {c1}/{t1} ({c1/t1*100:.0f}%)  v2.2 {c2}/{t2} ({c2/t2*100:.0f}%)")

    print("\n[컨피던스 밴드 - v2.2]")
    for band in ["50-55%", "55-60%", "60-65%", "65-70%", "70%+"]:
        data = s["by_band2"].get(band)
        if not data or data[1] == 0:
            continue
        c, t = data
        print(f"  {band}  {c}/{t} ({c/t*100:.0f}%)")
