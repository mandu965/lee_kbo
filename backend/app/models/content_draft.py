from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class ContentDraft(Base):
    __tablename__ = "content_drafts"
    __table_args__ = (
        UniqueConstraint("content_type", "source_date", name="uq_content_drafts_type_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    content_type: Mapped[str] = mapped_column(String(10), nullable=False)
    source_date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content_naver: Mapped[str] = mapped_column(Text, nullable=False)
    content_tistory: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
