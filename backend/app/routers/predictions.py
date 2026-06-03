from datetime import date as date_cls
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import aliased

from app.database import get_db
from app.models import Game, Prediction, Team
from app.schemas.prediction import (
    AccuracyResponse,
    MonthlyAccuracy,
    PredictionHistoryItem,
    StreakResponse,
)
from app.time_utils import today_kst

router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.get("/accuracy", response_model=AccuracyResponse)
async def get_accuracy(session: AsyncSession = Depends(get_db)):
    """시즌 전체 예측 적중률."""
    today = today_kst()
    season = today.year
    month = today.month

    stmt = (
        select(Prediction)
        .join(Game, Prediction.game_id == Game.id)
        .where(
            extract("year", Game.game_date) == season,
            Prediction.is_correct.is_not(None),
        )
    )
    preds = (await session.execute(stmt)).scalars().all()

    total = len(preds)
    correct = sum(1 for p in preds if p.is_correct)

    # 월별 필터는 별도 쿼리로
    stmt_m = (
        select(Prediction)
        .join(Game, Prediction.game_id == Game.id)
        .where(
            extract("year", Game.game_date) == season,
            extract("month", Game.game_date) == month,
            Prediction.is_correct.is_not(None),
        )
    )
    preds_m = (await session.execute(stmt_m)).scalars().all()
    m_total = len(preds_m)
    m_correct = sum(1 for p in preds_m if p.is_correct)

    return AccuracyResponse(
        season=season,
        total=total,
        correct=correct,
        accuracy=round(correct / total, 4) if total else 0.0,
        this_month_total=m_total,
        this_month_correct=m_correct,
        this_month_accuracy=round(m_correct / m_total, 4) if m_total else 0.0,
    )


@router.get("/history", response_model=list[PredictionHistoryItem])
async def get_history(
    month: Optional[int] = Query(None, ge=1, le=12),
    limit: int = Query(30, le=100),
    session: AsyncSession = Depends(get_db),
):
    """예측 히스토리 (월 필터 가능)."""
    season = today_kst().year
    conditions = [
        extract("year", Game.game_date) == season,
    ]
    if month:
        conditions.append(extract("month", Game.game_date) == month)

    # 팀 4개를 alias로 한 번에 JOIN — N+1 제거
    HomeTeam = aliased(Team, flat=True)
    AwayTeam = aliased(Team, flat=True)
    PredTeam = aliased(Team, flat=True)
    ActualTeam = aliased(Team, flat=True)

    stmt = (
        select(Prediction, Game, HomeTeam, AwayTeam, PredTeam, ActualTeam)
        .join(Game, Prediction.game_id == Game.id)
        .join(HomeTeam, Game.home_team_id == HomeTeam.id)
        .join(AwayTeam, Game.away_team_id == AwayTeam.id)
        .outerjoin(PredTeam, Prediction.predicted_winner_id == PredTeam.id)
        .outerjoin(ActualTeam, Prediction.actual_winner_id == ActualTeam.id)
        .where(*conditions)
        .order_by(desc(Game.game_date))
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()

    return [
        PredictionHistoryItem(
            game_date=game.game_date,
            game_id=game.id,
            home_team=home_team.name if home_team else "",
            away_team=away_team.name if away_team else "",
            home_win_prob=pred.home_win_prob,
            away_win_prob=pred.away_win_prob,
            predicted_winner=pred_team.name if pred_team else None,
            actual_winner=actual_team.name if actual_team else None,
            is_correct=pred.is_correct,
        )
        for pred, game, home_team, away_team, pred_team, actual_team in rows
    ]


@router.get("/history/monthly", response_model=list[MonthlyAccuracy])
async def get_monthly_accuracy(session: AsyncSession = Depends(get_db)):
    """월별 적중률 집계."""
    season = today_kst().year
    stmt = (
        select(
            extract("month", Game.game_date).label("month"),
            func.count(Prediction.id).label("total"),
            func.count(Prediction.id)
            .filter(Prediction.is_correct.is_(True))
            .label("correct"),
        )
        .join(Game, Prediction.game_id == Game.id)
        .where(
            extract("year", Game.game_date) == season,
            Prediction.is_correct.is_not(None),
        )
        .group_by(extract("month", Game.game_date))
        .order_by(extract("month", Game.game_date))
    )
    rows = (await session.execute(stmt)).all()
    return [
        MonthlyAccuracy(
            month=int(r.month),
            total=int(r.total),
            correct=int(r.correct or 0),
            accuracy=round(int(r.correct or 0) / int(r.total), 4) if r.total else 0.0,
        )
        for r in rows
    ]


@router.get("/streak", response_model=StreakResponse)
async def get_streak(session: AsyncSession = Depends(get_db)):
    """현재 연속 적중/실패 스트릭 + 최근 10경기 적중률."""
    stmt = (
        select(Prediction)
        .join(Game, Prediction.game_id == Game.id)
        .where(Prediction.is_correct.is_not(None))
        .order_by(desc(Game.game_date))
        .limit(20)
    )
    preds = (await session.execute(stmt)).scalars().all()

    if not preds:
        return StreakResponse(current_streak=0, streak_type="none", last_10_accuracy=0.0)

    # 연속 스트릭 계산
    streak = 0
    first_result = preds[0].is_correct
    for p in preds:
        if p.is_correct == first_result:
            streak += 1
        else:
            break

    last_10 = preds[:10]
    accuracy = round(sum(1 for p in last_10 if p.is_correct) / len(last_10), 4)

    return StreakResponse(
        current_streak=streak if first_result else -streak,
        streak_type="hit" if first_result else "miss",
        last_10_accuracy=accuracy,
    )


@router.get("/performance")
async def get_performance(
    model_version: Optional[str] = Query(default=None),
    month: Optional[int] = Query(default=None),
    session: AsyncSession = Depends(get_db),
):
    """모델 성과 지표 — Accuracy, Brier, LogLoss, Calibration, Coverage."""
    import math
    from app.models import PredictionRun

    season = today_kst().year

    # 정산된 예측 로드 (가장 최신 공개 스냅샷 기준)
    stmt = (
        select(PredictionRun, Game)
        .join(Game, PredictionRun.game_id == Game.id)
        .where(
            PredictionRun.settlement_status == "settled",
            PredictionRun.is_published == True,
            extract("year", Game.game_date) == season,
        )
    )
    if model_version:
        stmt = stmt.where(PredictionRun.model_version == model_version)
    if month:
        stmt = stmt.where(extract("month", Game.game_date) == month)

    rows = (await session.execute(stmt)).all()

    if not rows:
        return {"total": 0, "message": "정산된 예측이 없습니다."}

    total = len(rows)
    correct = sum(1 for r, _ in rows if r.is_correct)
    brier_scores = [r.brier_score for r, _ in rows if r.brier_score is not None]
    log_losses = []
    for r, g in rows:
        p = min(1 - 1e-10, max(1e-10, r.home_win_prob))
        home_won = r.actual_winner_id == g.home_team_id
        o = 1.0 if home_won else 0.0
        log_losses.append(-(o * math.log(p) + (1 - o) * math.log(1 - p)))

    # Calibration — 예측 확률 구간별 실제 적중률
    buckets: dict[str, dict] = {}
    for r, g in rows:
        home_won = r.actual_winner_id == g.home_team_id
        home_prob = r.home_win_prob
        # 유리한 팀 기준으로 통일
        fav_prob = max(home_prob, 1 - home_prob)
        fav_won = (home_prob > 0.5 and home_won) or (home_prob < 0.5 and not home_won)
        bucket = f"{int(fav_prob * 10) * 10}~{int(fav_prob * 10) * 10 + 10}%"
        if bucket not in buckets:
            buckets[bucket] = {"total": 0, "correct": 0, "avg_prob": 0.0}
        buckets[bucket]["total"] += 1
        buckets[bucket]["correct"] += int(fav_won)
        buckets[bucket]["avg_prob"] += fav_prob

    calibration = []
    for label, b in sorted(buckets.items()):
        t = b["total"]
        calibration.append({
            "bucket": label,
            "predicted_pct": round(b["avg_prob"] / t * 100, 1) if t else 0,
            "actual_pct": round(b["correct"] / t * 100, 1) if t else 0,
            "count": t,
        })

    # Coverage — 전체 경기 중 예측 보유 비율
    total_games = await session.scalar(
        select(func.count()).select_from(Game).where(
            extract("year", Game.game_date) == season,
            Game.status.in_(["final", "cancelled"]),
        )
    )

    return {
        "season": season,
        "model_version": model_version,
        "month": month,
        "total": total,
        "accuracy": round(correct / total, 4) if total else 0,
        "avg_brier": round(sum(brier_scores) / len(brier_scores), 4) if brier_scores else None,
        "avg_log_loss": round(sum(log_losses) / len(log_losses), 4) if log_losses else None,
        "coverage": round(total / (total_games or 1), 4) if total_games else None,
        "calibration": calibration,
    }
