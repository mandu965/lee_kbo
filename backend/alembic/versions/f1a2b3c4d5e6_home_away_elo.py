"""p6 home away elo split

Revision ID: f1a2b3c4d5e6
Revises: e41f28a4d96b
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "e41f28a4d96b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("home_elo", sa.Float(), nullable=False, server_default="1500.0"))
    op.add_column("teams", sa.Column("away_elo", sa.Float(), nullable=False, server_default="1500.0"))
    # 기존 팀들의 초기값을 현재 elo_rating 으로 설정
    op.execute("UPDATE teams SET home_elo = elo_rating, away_elo = elo_rating")


def downgrade() -> None:
    op.drop_column("teams", "away_elo")
    op.drop_column("teams", "home_elo")
