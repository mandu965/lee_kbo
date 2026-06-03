"""merge_heads

Revision ID: 92fa4ac03d7d
Revises: b8142e57c093, d6e1ec0dfd9b
Create Date: 2026-05-30 16:08:36.709168
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '92fa4ac03d7d'
down_revision: Union[str, None] = ('b8142e57c093', 'd6e1ec0dfd9b')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
