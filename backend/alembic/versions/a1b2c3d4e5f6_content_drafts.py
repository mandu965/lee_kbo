"""content_drafts table

Revision ID: a1b2c3d4e5f6
Revises: 5f4c8b7d1a20
Create Date: 2026-06-02

"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "5f4c8b7d1a20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "content_drafts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column(
            "content_type",
            sa.String(10),
            nullable=False,
            comment="TYPE_A / TYPE_B / TYPE_C",
        ),
        sa.Column("source_date", sa.Date(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("content_naver", sa.Text(), nullable=False),
        sa.Column("content_tistory", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            onupdate=sa.text("now()"),
            nullable=True,
        ),
        # 당일 데이터만 1건 유지: (content_type, source_date) unique
        sa.UniqueConstraint("content_type", "source_date", name="uq_content_drafts_type_date"),
    )
    op.create_index("idx_content_drafts_date", "content_drafts", ["source_date"])


def downgrade() -> None:
    op.drop_index("idx_content_drafts_date", table_name="content_drafts")
    op.drop_table("content_drafts")
