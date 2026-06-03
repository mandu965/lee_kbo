from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, DateTime, Date, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(20))
    stadium: Mapped[str | None] = mapped_column(String(100))
    elo_rating: Mapped[float] = mapped_column(Float, default=1500.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    players: Mapped[list["Player"]] = relationship(back_populates="team")
    home_games: Mapped[list["Game"]] = relationship(foreign_keys="Game.home_team_id", back_populates="home_team")
    away_games: Mapped[list["Game"]] = relationship(foreign_keys="Game.away_team_id", back_populates="away_team")
    elo_history: Mapped[list["EloHistory"]] = relationship(back_populates="team")


class EloHistory(Base):
    __tablename__ = "elo_history"
    __table_args__ = (
        UniqueConstraint("game_id", "team_id", name="uq_elo_history_game_team"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(Integer, ForeignKey("teams.id"), nullable=False)
    game_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("games.id"))
    elo_before: Mapped[float | None] = mapped_column(Float)
    elo_after: Mapped[float | None] = mapped_column(Float)
    elo_change: Mapped[float | None] = mapped_column(Float)
    game_date: Mapped[datetime | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    team: Mapped["Team"] = relationship(back_populates="elo_history")
