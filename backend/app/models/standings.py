"""팀 시즌 순위 및 스냅샷 모델."""

from datetime import datetime, date

from sqlalchemy import Date, Float, ForeignKey, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class TeamSeasonStandings(Base):
    """팀별 시즌 누적 순위/성적 (매일 갱신, 최신 1건 유지)."""
    __tablename__ = "team_season_standings"
    __table_args__ = (
        UniqueConstraint("team_id", "season", name="uq_standings_team_season"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(Integer, ForeignKey("teams.id"), nullable=False)
    season: Mapped[int] = mapped_column(Integer, nullable=False)

    rank: Mapped[int | None] = mapped_column(Integer)
    games_played: Mapped[int | None] = mapped_column(Integer)
    wins: Mapped[int | None] = mapped_column(Integer)
    losses: Mapped[int | None] = mapped_column(Integer)
    draws: Mapped[int | None] = mapped_column(Integer)
    win_pct: Mapped[float | None] = mapped_column(Float)
    games_behind: Mapped[float | None] = mapped_column(Float)     # 게임차

    # 최근 10경기 (예: "7승0무3패")
    last10: Mapped[str | None] = mapped_column(String(30))
    # 연속 기록 (예: "1승", "2패")
    streak: Mapped[str | None] = mapped_column(String(20))
    # 홈 성적 "W-D-L"
    home_record: Mapped[str | None] = mapped_column(String(20))
    # 원정 성적 "W-D-L"
    away_record: Mapped[str | None] = mapped_column(String(20))

    as_of: Mapped[date | None] = mapped_column(Date)             # 기준 날짜
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    team: Mapped["Team"] = relationship()
