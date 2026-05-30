"""
백테스팅 엔진

과거 경기 데이터에 대해 예측 모델을 타임라인 순서대로 실행하고
데이터 누수(leakage) 없이 적중률을 측정합니다.

핵심 원칙:
  - 경기 D를 예측할 때는 D일 이전 데이터(ELO, 성적)만 사용
  - ELO는 경기 결과 확정 후에만 업데이트
  - 선발 투수 성적은 시즌 초기값(사전 수집) 사용
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.elo import expected_win_prob, get_k_factor, update_elo
from app.engine.form_calculator import GameResult, calc_recent_form, pitcher_adjustment, pitcher_score
from app.engine.park_factor import get_park_info, park_adjustment
from app.engine.weather_adjuster import calc_weather_effect, weather_home_adjustment
from app.models import EloHistory, Game, PitcherStat, Player, Team

logger = logging.getLogger(__name__)

HOME_ADV = 0.03
WEIGHTS = {"elo": 0.40, "pitcher": 0.28, "form": 0.14,
           "home_adv": 0.08, "park": 0.05, "weather": 0.03, "bullpen": 0.02}


@dataclass
class GamePrediction:
    game_id: int
    game_date: date
    home_team: str
    away_team: str
    home_win_prob: float
    predicted_winner: str   # home / away
    actual_winner: str      # home / away / draw
    is_correct: bool | None
    elo_diff: float
    confidence: float       # |home_win_prob - 0.5| * 2  → 0~1


@dataclass
class BacktestReport:
    start_date: date
    end_date: date
    total: int = 0
    correct: int = 0
    draws: int = 0
    predictions: list[GamePrediction] = field(default_factory=list)

    # 집계용
    by_month: dict[int, list[bool]] = field(default_factory=dict)
    by_confidence: dict[str, list[bool]] = field(default_factory=dict)
    by_team: dict[str, dict[str, list[bool]]] = field(default_factory=dict)
    elo_only_correct: int = 0   # 비교용: ELO 단독 모델

    @property
    def accuracy(self) -> float:
        denom = self.total - self.draws
        return round(self.correct / denom, 4) if denom > 0 else 0.0

    @property
    def elo_only_accuracy(self) -> float:
        denom = self.total - self.draws
        return round(self.elo_only_correct / denom, 4) if denom > 0 else 0.0

    def add(self, pred: GamePrediction, elo_correct: bool):
        self.total += 1
        if pred.actual_winner == "draw":
            self.draws += 1
            return
        if pred.is_correct:
            self.correct += 1
        if elo_correct:
            self.elo_only_correct += 1

        m = pred.game_date.month
        self.by_month.setdefault(m, []).append(pred.is_correct)

        band = _confidence_band(pred.confidence)
        self.by_confidence.setdefault(band, []).append(pred.is_correct)

        for side, team in [("home", pred.home_team), ("away", pred.away_team)]:
            self.by_team.setdefault(team, {"home": [], "away": []})
            self.by_team[team][side].append(pred.is_correct)

    def print_report(self):
        sep = "=" * 52
        print(f"\n{sep}")
        print("  KBO Predictor Backtesting Report")
        print(sep)
        print(f"  Period  : {self.start_date} ~ {self.end_date}")
        print(f"  Games   : {self.total}  (excl. draw: {self.total - self.draws})")
        print(f"  Correct : {self.correct}")
        print(f"  Accuracy: {self.accuracy*100:.1f}%")
        print(f"  ELO only: {self.elo_only_accuracy*100:.1f}%")
        print(f"  Improve : {(self.accuracy - self.elo_only_accuracy)*100:+.1f}%p")
        print("-" * 52)

        # 월별
        print("  [Monthly Accuracy]")
        for m in sorted(self.by_month):
            results = self.by_month[m]
            acc = sum(results) / len(results) if results else 0
            bar = "#" * int(acc * 20) + "." * (20 - int(acc * 20))
            print(f"  M{m:02d}  [{bar}]  {acc*100:.1f}% ({sum(results)}/{len(results)})")

        print("-" * 52)

        # 컨피던스 구간별
        print("  [Confidence Band Accuracy]")
        for band in ["50-55%", "55-60%", "60-65%", "65-70%", "70%+"]:
            results = self.by_confidence.get(band, [])
            if not results:
                continue
            acc = sum(results) / len(results)
            print(f"  {band:7s}  {acc*100:.1f}%  ({sum(results)}/{len(results)})")

        print("-" * 52)

        # 팀별 (홈 적중률 상위 5팀)
        print("  [Home Prediction Accuracy TOP 5]")
        home_accs = []
        for team, sides in self.by_team.items():
            r = sides["home"]
            if len(r) >= 3:
                home_accs.append((team, sum(r) / len(r), len(r)))
        home_accs.sort(key=lambda x: -x[1])
        for team, acc, cnt in home_accs[:5]:
            print(f"  {team[:8]:8s}  Home {acc*100:.1f}% ({cnt} games)")

        print("=" * 52 + "\n")


def _confidence_band(conf: float) -> str:
    if conf < 0.10:
        return "50-55%"
    elif conf < 0.20:
        return "55-60%"
    elif conf < 0.30:
        return "60-65%"
    elif conf < 0.40:
        return "65-70%"
    else:
        return "70%+"


class BacktestEngine:
    """타임라인 순서로 예측 → ELO 업데이트를 반복해 적중률을 측정."""

    def __init__(self, initial_elo: dict[str, float] | None = None):
        self._elo: dict[int, float] = {}          # team_id → elo
        self._initial_elo = initial_elo or {}      # team_code → elo

    # ── 내부 헬퍼 ────────────────────────────────────────────

    def _get_elo(self, team: Team) -> float:
        return self._elo.get(team.id, self._initial_elo.get(team.code, 1500.0))

    def _set_elo(self, team: Team, val: float):
        self._elo[team.id] = val

    async def _recent_results(
        self, session: AsyncSession, team_id: int, before: date, n: int = 10
    ) -> list[GameResult]:
        rows = (await session.execute(
            select(Game)
            .where(Game.status == "final", Game.game_date < before,
                   or_(Game.home_team_id == team_id, Game.away_team_id == team_id))
            .order_by(Game.game_date.desc())
            .limit(n)
        )).scalars().all()
        out = []
        for g in rows:
            if g.home_score is None:
                continue
            is_home = g.home_team_id == team_id
            my = g.home_score if is_home else g.away_score
            opp = g.away_score if is_home else g.home_score
            out.append(GameResult(team_won=my > opp, score_diff=my - opp))
        return out

    async def _starter_stats(
        self, session: AsyncSession, player_id: int | None, season: int
    ) -> tuple[float | None, float | None]:
        if player_id is None:
            return None, None
        from sqlalchemy import select, desc
        stat = (await session.execute(
            select(PitcherStat)
            .where(PitcherStat.player_id == player_id,
                   PitcherStat.season == season,
                   PitcherStat.is_starter == True)
            .order_by(PitcherStat.id.desc())
            .limit(1)
        )).scalar_one_or_none()
        return (stat.era, stat.whip) if stat else (None, None)

    # ── 단일 경기 예측 ────────────────────────────────────────

    async def _predict_one(
        self,
        session: AsyncSession,
        game: Game,
        home_team: Team,
        away_team: Team,
    ) -> tuple[float, float]:
        """(복합 홈 승률, ELO 단독 홈 승률) 반환."""
        season = game.game_date.year
        elo_h = self._get_elo(home_team)
        elo_a = self._get_elo(away_team)
        elo_win = expected_win_prob(elo_h + 40, elo_a)  # 홈 이점 +40 ELO

        era_h, whip_h = await self._starter_stats(session, game.home_starter_id, season)
        era_a, whip_a = await self._starter_stats(session, game.away_starter_id, season)
        ps_h = pitcher_score(era_h, whip_h)
        ps_a = pitcher_score(era_a, whip_a)
        adj_p = pitcher_adjustment(ps_h, ps_a)

        res_h = await self._recent_results(session, home_team.id, game.game_date)
        res_a = await self._recent_results(session, away_team.id, game.game_date)
        form_h = calc_recent_form(res_h)
        form_a = calc_recent_form(res_a)
        adj_f = (form_h - form_a) * 0.3

        adj_park = park_adjustment(game.stadium)
        weather = calc_weather_effect(game.weather_temp, game.weather_cond, game.stadium)
        adj_w = weather_home_adjustment(weather, era_h or 4.5, era_a or 4.5)

        raw = (
            WEIGHTS["elo"]      * elo_win
            + WEIGHTS["pitcher"]  * (0.5 + adj_p)
            + WEIGHTS["form"]     * (0.5 + adj_f)
            + WEIGHTS["home_adv"] * (0.5 + HOME_ADV)
            + WEIGHTS["park"]     * (0.5 + adj_park)
            + WEIGHTS["weather"]  * (0.5 + adj_w)
            + WEIGHTS["bullpen"]  * 0.5   # 백테스팅에서 불펜 데이터 생략
        )
        combined = max(0.05, min(0.95, raw))
        return round(combined, 4), round(elo_win, 4)

    # ── 메인 실행 ────────────────────────────────────────────

    async def run(
        self,
        session: AsyncSession,
        start_date: date,
        end_date: date,
    ) -> BacktestReport:
        report = BacktestReport(start_date=start_date, end_date=end_date)

        # 기간 내 확정된 경기를 날짜순 조회
        games = (await session.execute(
            select(Game)
            .where(
                Game.status == "final",
                Game.game_date >= start_date,
                Game.game_date <= end_date,
                Game.home_score.is_not(None),
            )
            .order_by(Game.game_date, Game.id)
        )).scalars().all()

        logger.info("백테스팅 대상 경기: %d", len(games))

        for i, game in enumerate(games, 1):
            home_team: Team | None = await session.get(Team, game.home_team_id)
            away_team: Team | None = await session.get(Team, game.away_team_id)
            if not home_team or not away_team:
                continue

            combined_prob, elo_prob = await self._predict_one(session, game, home_team, away_team)

            # 실제 결과
            hs, as_ = game.home_score, game.away_score
            if hs > as_:
                actual = "home"
            elif as_ > hs:
                actual = "away"
            else:
                actual = "draw"

            predicted = "home" if combined_prob >= 0.5 else "away"
            elo_predicted = "home" if elo_prob >= 0.5 else "away"

            is_correct = None if actual == "draw" else (predicted == actual)
            elo_correct = (elo_predicted == actual) if actual != "draw" else False
            conf = abs(combined_prob - 0.5) * 2

            pred = GamePrediction(
                game_id=game.id,
                game_date=game.game_date,
                home_team=home_team.short_name or home_team.name,
                away_team=away_team.short_name or away_team.name,
                home_win_prob=combined_prob,
                predicted_winner=predicted,
                actual_winner=actual,
                is_correct=is_correct,
                elo_diff=round(self._get_elo(home_team) - self._get_elo(away_team), 1),
                confidence=round(conf, 3),
            )
            report.add(pred, elo_correct)

            # 경기 후 ELO 업데이트
            if actual != "draw":
                winner = home_team if actual == "home" else away_team
                loser = away_team if actual == "home" else home_team
                new_w, new_l = update_elo(
                    self._get_elo(winner), self._get_elo(loser), game.game_date
                )
                self._set_elo(winner, new_w)
                self._set_elo(loser, new_l)

            if i % 50 == 0:
                logger.info("  진행: %d / %d  현재 적중률: %.1f%%",
                            i, len(games), report.accuracy * 100)

        return report
