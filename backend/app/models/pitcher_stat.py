from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class PitcherStat(Base):
    __tablename__ = "pitcher_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    player_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("players.id"))
    game_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("games.id"))
    season: Mapped[int] = mapped_column(Integer, nullable=False)
    innings_pitched: Mapped[float | None] = mapped_column(Float)
    hits: Mapped[int | None] = mapped_column(Integer)
    runs: Mapped[int | None] = mapped_column(Integer)
    earned_runs: Mapped[int | None] = mapped_column(Integer)
    walks: Mapped[int | None] = mapped_column(Integer)
    strikeouts: Mapped[int | None] = mapped_column(Integer)
    era: Mapped[float | None] = mapped_column(Float)
    whip: Mapped[float | None] = mapped_column(Float)
    is_starter: Mapped[bool] = mapped_column(Boolean, default=True)
    game_result: Mapped[str | None] = mapped_column(String(5))
    opponent_name: Mapped[str | None] = mapped_column(String(20))
    batters_faced: Mapped[int | None] = mapped_column(Integer)
    # 확장 필드
    games: Mapped[int | None] = mapped_column(Integer)
    wins: Mapped[int | None] = mapped_column(Integer)
    losses: Mapped[int | None] = mapped_column(Integer)
    saves: Mapped[int | None] = mapped_column(Integer)
    holds: Mapped[int | None] = mapped_column(Integer)
    home_runs_allowed: Mapped[int | None] = mapped_column(Integer)
    hbp: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    player: Mapped["Player"] = relationship(back_populates="pitcher_stats")
    game: Mapped["Game"] = relationship(back_populates="pitcher_stats")
