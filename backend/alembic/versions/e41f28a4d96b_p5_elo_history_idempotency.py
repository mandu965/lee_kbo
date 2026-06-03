"""p5 elo history idempotency

Revision ID: e41f28a4d96b
Revises: c9253f68a104
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e41f28a4d96b"
down_revision: str | None = "c9253f68a104"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM elo_history AS duplicate
        USING elo_history AS original
        WHERE duplicate.game_id = original.game_id
          AND duplicate.team_id = original.team_id
          AND duplicate.id > original.id
        """
    )
    op.create_unique_constraint(
        "uq_elo_history_game_team",
        "elo_history",
        ["game_id", "team_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_elo_history_game_team", "elo_history", type_="unique")
