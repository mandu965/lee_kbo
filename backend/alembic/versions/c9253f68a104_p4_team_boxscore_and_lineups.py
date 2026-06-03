"""p4 team boxscore and lineups

Revision ID: c9253f68a104
Revises: f86d2d90066c
Create Date: 2026-05-31
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9253f68a104"
down_revision: Union[str, None] = "f86d2d90066c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    team_stat_columns = {column["name"] for column in inspector.get_columns("team_game_stats")}
    for name in ("at_bats", "walks", "strikeouts", "home_runs"):
        if name not in team_stat_columns:
            op.add_column("team_game_stats", sa.Column(name, sa.Integer(), nullable=True))
    team_stat_constraints = {constraint["name"] for constraint in inspector.get_unique_constraints("team_game_stats")}
    if "uq_team_game_stats_team_game" not in team_stat_constraints:
        op.create_unique_constraint("uq_team_game_stats_team_game", "team_game_stats", ["team_id", "game_id"])

    if "game_lineups" not in inspector.get_table_names():
        op.create_table(
            "game_lineups",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("game_id", sa.Integer(), nullable=False),
            sa.Column("team_id", sa.Integer(), nullable=False),
            sa.Column("player_id", sa.Integer(), nullable=True),
            sa.Column("player_name", sa.String(length=50), nullable=False),
            sa.Column("player_code", sa.String(length=20), nullable=True),
            sa.Column("bat_order", sa.Integer(), nullable=False),
            sa.Column("position", sa.String(length=20), nullable=True),
            sa.Column("is_starter", sa.Boolean(), nullable=False),
            sa.Column("is_confirmed", sa.Boolean(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["game_id"], ["games.id"]),
            sa.ForeignKeyConstraint(["team_id"], ["teams.id"]),
            sa.ForeignKeyConstraint(["player_id"], ["players.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("game_id", "team_id", "bat_order", "player_name", name="uq_game_lineups_entry"),
        )
        op.create_index(op.f("ix_game_lineups_game_id"), "game_lineups", ["game_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_game_lineups_game_id"), table_name="game_lineups")
    op.drop_table("game_lineups")
    op.drop_column("team_game_stats", "home_runs")
    op.drop_column("team_game_stats", "strikeouts")
    op.drop_column("team_game_stats", "walks")
    op.drop_column("team_game_stats", "at_bats")
    op.drop_constraint("uq_team_game_stats_team_game", "team_game_stats", type_="unique")
