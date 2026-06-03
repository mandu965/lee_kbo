from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class TeamGameStat(Base):
    __tablename__ = "team_game_stats"
    __table_args__ = (
        UniqueConstraint("team_id", "game_id", name="uq_team_game_stats_team_game"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id"))
    game_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("games.id"))
    is_home: Mapped[bool | None] = mapped_column(Boolean)
    runs: Mapped[int | None] = mapped_column(Integer)
    hits: Mapped[int | None] = mapped_column(Integer)
    errors: Mapped[int | None] = mapped_column(Integer)
    team_avg: Mapped[float | None] = mapped_column(Float)
    team_ops: Mapped[float | None] = mapped_column(Float)
    at_bats: Mapped[int | None] = mapped_column(Integer)
    walks: Mapped[int | None] = mapped_column(Integer)
    strikeouts: Mapped[int | None] = mapped_column(Integer)
    home_runs: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    team: Mapped["Team"] = relationship()
    game: Mapped["Game"] = relationship(back_populates="team_stats")
