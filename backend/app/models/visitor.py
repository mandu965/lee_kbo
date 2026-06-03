"""웹 전용 방문자 집계 모델.

로컬 크롤러 DB 동기화 대상에 포함하지 않는다.
"""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class VisitorDailyStat(Base):
    __tablename__ = "visitor_daily_stats"
    __table_args__ = (
        UniqueConstraint("visit_date", "path", name="uq_visitor_daily_stats_date_path"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    visit_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    path: Mapped[str] = mapped_column(String(255), nullable=False)
    page_views: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unique_visitors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class VisitorDailyUnique(Base):
    __tablename__ = "visitor_daily_uniques"
    __table_args__ = (
        UniqueConstraint(
            "visit_date",
            "path",
            "visitor_hash",
            name="uq_visitor_daily_uniques_date_path_hash",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    visit_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    path: Mapped[str] = mapped_column(String(255), nullable=False)
    visitor_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
