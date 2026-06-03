from datetime import datetime, date, time

from sqlalchemy import Date, Float, ForeignKey, Index, Integer, String, Time, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Game(Base):
    __tablename__ = "games"
    __table_args__ = (
        Index("idx_games_date", "game_date"),
        Index("idx_games_teams", "home_team_id", "away_team_id"),
        # 더블헤더 대응: 날짜+홈팀+원정팀+차수로 고유 식별
        UniqueConstraint("game_date", "home_team_id", "away_team_id", "doubleheader_no",
                         name="uq_games_date_teams_dh"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_date: Mapped[date] = mapped_column(Date, nullable=False)
    home_team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id"))
    away_team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id"))
    stadium: Mapped[str | None] = mapped_column(String(100))
    start_time: Mapped[time | None] = mapped_column(Time)
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    home_score: Mapped[int | None] = mapped_column(Integer)
    away_score: Mapped[int | None] = mapped_column(Integer)
    home_starter_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("players.id"))
    away_starter_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("players.id"))
    weather_temp: Mapped[float | None] = mapped_column(Float)
    weather_cond: Mapped[str | None] = mapped_column(String(50))
    # KBO 원천 경기 ID (예: "20260501NCLG0"). 더블헤더 완전 식별 및 크롤러 멱등성 보장.
    external_game_id: Mapped[str | None] = mapped_column(String(30), index=True)
    # 더블헤더 차수: 0 = 일반/1차전, 1 = 2차전
    doubleheader_no: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    home_team: Mapped["Team"] = relationship(foreign_keys=[home_team_id], back_populates="home_games")
    away_team: Mapped["Team"] = relationship(foreign_keys=[away_team_id], back_populates="away_games")
    home_starter: Mapped["Player"] = relationship(foreign_keys=[home_starter_id])
    away_starter: Mapped["Player"] = relationship(foreign_keys=[away_starter_id])
    prediction: Mapped["Prediction"] = relationship(back_populates="game", uselist=False)
    team_stats: Mapped[list["TeamGameStat"]] = relationship(back_populates="game")
    pitcher_stats: Mapped[list["PitcherStat"]] = relationship(back_populates="game")
