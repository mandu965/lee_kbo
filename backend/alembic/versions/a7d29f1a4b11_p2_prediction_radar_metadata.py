"""p2_prediction_radar_metadata

Revision ID: a7d29f1a4b11
Revises: f05fdb008f76
Create Date: 2026-05-30 13:40:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7d29f1a4b11"
down_revision: Union[str, None] = "f05fdb008f76"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("prediction_runs", sa.Column("data_completeness", sa.Float(), nullable=True))
    op.add_column("prediction_runs", sa.Column("missing_features", sa.JSON(), nullable=True))
    op.add_column("prediction_runs", sa.Column("factor_contributions", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("prediction_runs", "factor_contributions")
    op.drop_column("prediction_runs", "missing_features")
    op.drop_column("prediction_runs", "data_completeness")
