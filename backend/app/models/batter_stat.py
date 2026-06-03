"""타자 시즌 누적 성적 모델."""

from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class BatterStat(Base):
    __tablename__ = "batter_stats"
    __table_args__ = (
        # 선수별 시즌 집계 행 1개 (game_id IS NULL)
        UniqueConstraint("player_id", "season", name="uq_batter_stats_player_season"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    player_id: Mapped[int] = mapped_column(Integer, ForeignKey("players.id"), nullable=False)
    season: Mapped[int] = mapped_column(Integer, nullable=False)

    # Basic1
    avg: Mapped[float | None] = mapped_column(Float)          # 타율
    games: Mapped[int | None] = mapped_column(Integer)        # 경기
    plate_app: Mapped[int | None] = mapped_column(Integer)    # 타석 (PA)
    at_bats: Mapped[int | None] = mapped_column(Integer)      # 타수 (AB)
    runs: Mapped[int | None] = mapped_column(Integer)         # 득점
    hits: Mapped[int | None] = mapped_column(Integer)         # 안타
    doubles: Mapped[int | None] = mapped_column(Integer)      # 2루타
    triples: Mapped[int | None] = mapped_column(Integer)      # 3루타
    home_runs: Mapped[int | None] = mapped_column(Integer)    # 홈런
    total_bases: Mapped[int | None] = mapped_column(Integer)  # 루타 (TB)
    rbi: Mapped[int | None] = mapped_column(Integer)          # 타점
    sac_hits: Mapped[int | None] = mapped_column(Integer)     # 희타 (SAC)
    sac_flies: Mapped[int | None] = mapped_column(Integer)    # 희비 (SF)

    # Basic2
    walks: Mapped[int | None] = mapped_column(Integer)        # 볼넷 (BB)
    ibb: Mapped[int | None] = mapped_column(Integer)          # 고의사구 (IBB)
    hbp: Mapped[int | None] = mapped_column(Integer)          # 사구 (HBP)
    strikeouts: Mapped[int | None] = mapped_column(Integer)   # 삼진 (SO)
    slg: Mapped[float | None] = mapped_column(Float)          # 장타율
    obp: Mapped[float | None] = mapped_column(Float)          # 출루율
    ops: Mapped[float | None] = mapped_column(Float)          # OPS

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    player: Mapped["Player"] = relationship()
