"""p3 bullpen player availability

Revision ID: b8142e57c093
Revises: a7d29f1a4b11
Create Date: 2026-05-31
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8142e57c093"
down_revision: Union[str, None] = "a7d29f1a4b11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("players", sa.Column("kbo_player_id", sa.String(length=10), nullable=True))
    op.add_column("players", sa.Column("injury_status", sa.String(length=100), nullable=True))
    op.add_column("players", sa.Column("injury_updated_at", sa.DateTime(), nullable=True))
    op.create_index(op.f("ix_players_kbo_player_id"), "players", ["kbo_player_id"], unique=False)
    op.add_column("pitcher_stats", sa.Column("opponent_name", sa.String(length=20), nullable=True))
    op.add_column("pitcher_stats", sa.Column("batters_faced", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("pitcher_stats", "batters_faced")
    op.drop_column("pitcher_stats", "opponent_name")
    op.drop_index(op.f("ix_players_kbo_player_id"), table_name="players")
    op.drop_column("players", "injury_updated_at")
    op.drop_column("players", "injury_status")
    op.drop_column("players", "kbo_player_id")
