from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(Integer, ForeignKey("games.id"), unique=True, nullable=False)
    home_win_prob: Mapped[float] = mapped_column(Float, nullable=False)
    away_win_prob: Mapped[float] = mapped_column(Float, nullable=False)
    predicted_winner_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id"))
    actual_winner_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id"))
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    elo_diff: Mapped[float | None] = mapped_column(Float)
    pitcher_score_home: Mapped[float | None] = mapped_column(Float)
    pitcher_score_away: Mapped[float | None] = mapped_column(Float)
    recent_form_home: Mapped[float | None] = mapped_column(Float)
    recent_form_away: Mapped[float | None] = mapped_column(Float)
    model_version: Mapped[str | None] = mapped_column(String(20))
    brier_score: Mapped[float | None] = mapped_column(Float)
    # settled / draw / cancelled / unsettled
    settlement_status: Mapped[str] = mapped_column(String(20), default="unsettled")
    settled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    game: Mapped["Game"] = relationship(back_populates="prediction")
    predicted_winner: Mapped["Team"] = relationship(foreign_keys=[predicted_winner_id])
    actual_winner: Mapped["Team"] = relationship(foreign_keys=[actual_winner_id])
