"""
PredictionRun — 예측 실행마다 새로운 행을 저장하는 스냅샷 테이블.

기존 predictions 테이블은 game_id UNIQUE 로 경기당 최신값만 유지하는
빠른 조회 캐시로 유지하고, 이 테이블에는 모든 실행 이력을 남긴다.
"""

from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class PredictionRun(Base):
    __tablename__ = "prediction_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(Integer, ForeignKey("games.id"), nullable=False, index=True)

    # 예측 타입: preliminary(선발 발표 전), final(라인업 확정 후), manual(수동)
    prediction_type: Mapped[str] = mapped_column(String(20), default="final")
    model_version: Mapped[str | None] = mapped_column(String(20))
    generated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # 사용자에게 공개한 시각. None 이면 미공개.
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)

    # 예측 확률
    home_win_prob: Mapped[float] = mapped_column(Float, nullable=False)
    away_win_prob: Mapped[float] = mapped_column(Float, nullable=False)
    predicted_winner_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id"))

    # 입력값 정규화 해시 — 동일 입력 반복 스냅샷 억제용
    input_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    # 예측 당시 입력 지표 스냅샷 (JSON)
    feature_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 사용자에게 공개한 근거 리스트 (JSON array of strings)
    key_factors: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # 입력 데이터 완성도와 승률 변화 설명용 메타데이터
    data_completeness: Mapped[float | None] = mapped_column(Float)
    missing_features: Mapped[list | None] = mapped_column(JSON, nullable=True)
    factor_contributions: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # 정산 결과 (경기 종료 후 채워짐)
    actual_winner_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id"))
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    # Brier Score = (prob_predicted - outcome)^2, 낮을수록 좋음
    brier_score: Mapped[float | None] = mapped_column(Float)
    # settled / draw / cancelled / unsettled
    settlement_status: Mapped[str] = mapped_column(String(20), default="unsettled")
    settled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    settlement_reason: Mapped[str | None] = mapped_column(String(100))

    game: Mapped["Game"] = relationship(foreign_keys=[game_id])
    predicted_winner: Mapped["Team"] = relationship(foreign_keys=[predicted_winner_id])
    actual_winner: Mapped["Team"] = relationship(foreign_keys=[actual_winner_id])
