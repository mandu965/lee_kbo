"""visitor analytics

Revision ID: 5f4c8b7d1a20
Revises: b68e58d4fbc3
Create Date: 2026-06-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5f4c8b7d1a20"
down_revision: Union[str, None] = "b68e58d4fbc3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("visitor_daily_stats"):
        op.create_table(
            "visitor_daily_stats",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("visit_date", sa.Date(), nullable=False),
            sa.Column("path", sa.String(length=255), nullable=False),
            sa.Column("page_views", sa.Integer(), server_default="0", nullable=False),
            sa.Column("unique_visitors", sa.Integer(), server_default="0", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("visit_date", "path", name="uq_visitor_daily_stats_date_path"),
        )
        op.create_index(
            op.f("ix_visitor_daily_stats_visit_date"),
            "visitor_daily_stats",
            ["visit_date"],
            unique=False,
        )
    if not inspector.has_table("visitor_daily_uniques"):
        op.create_table(
            "visitor_daily_uniques",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("visit_date", sa.Date(), nullable=False),
            sa.Column("path", sa.String(length=255), nullable=False),
            sa.Column("visitor_hash", sa.String(length=64), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "visit_date",
                "path",
                "visitor_hash",
                name="uq_visitor_daily_uniques_date_path_hash",
            ),
        )
        op.create_index(
            op.f("ix_visitor_daily_uniques_visit_date"),
            "visitor_daily_uniques",
            ["visit_date"],
            unique=False,
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("visitor_daily_uniques"):
        op.drop_index(op.f("ix_visitor_daily_uniques_visit_date"), table_name="visitor_daily_uniques")
        op.drop_table("visitor_daily_uniques")
    if inspector.has_table("visitor_daily_stats"):
        op.drop_index(op.f("ix_visitor_daily_stats_visit_date"), table_name="visitor_daily_stats")
        op.drop_table("visitor_daily_stats")
