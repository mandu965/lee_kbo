"""collection_runs

Revision ID: 36d22a2c4998
Revises: d58289de6130
Create Date: 2026-05-31 12:03:00.402208
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '36d22a2c4998'
down_revision: Union[str, None] = 'd58289de6130'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'collection_runs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('task_name', sa.String(length=50), nullable=False),
        sa.Column('target_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='running'),
        sa.Column('row_count', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('started_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_collection_runs_task_name', 'collection_runs', ['task_name'])


def downgrade() -> None:
    op.drop_index('ix_collection_runs_task_name', table_name='collection_runs')
    op.drop_table('collection_runs')
