from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class GameLineup(Base):
    __tablename__ = "game_lineups"
    __table_args__ = (
        UniqueConstraint("game_id", "team_id", "bat_order", "player_name", name="uq_game_lineups_entry"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(Integer, ForeignKey("games.id"), nullable=False, index=True)
    team_id: Mapped[int] = mapped_column(Integer, ForeignKey("teams.id"), nullable=False)
    player_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("players.id"))
    player_name: Mapped[str] = mapped_column(String(50), nullable=False)
    player_code: Mapped[str | None] = mapped_column(String(20))
    bat_order: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[str | None] = mapped_column(String(20))
    is_starter: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    game: Mapped["Game"] = relationship()
    team: Mapped["Team"] = relationship()
    player: Mapped["Player"] = relationship()
