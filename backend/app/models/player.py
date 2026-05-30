from datetime import datetime, date

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id"))
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    position: Mapped[str | None] = mapped_column(String(20))
    birth_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    team: Mapped["Team"] = relationship(back_populates="players")
    pitcher_stats: Mapped[list["PitcherStat"]] = relationship(back_populates="player")
