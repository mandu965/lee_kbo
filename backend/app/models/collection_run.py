"""
CollectionRun — 크롤/수집 작업 실행 이력.

각 스케줄러 태스크의 실행 구간·결과·건수·실패 사유를 기록해
운영자가 마지막 성공 시각과 파싱 0건 경고를 즉시 확인할 수 있게 한다.
"""

from datetime import datetime, date

from sqlalchemy import DateTime, Date, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class CollectionRun(Base):
    __tablename__ = "collection_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    target_date: Mapped[date | None] = mapped_column(Date)
    # running / success / warning / failed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    row_count: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
