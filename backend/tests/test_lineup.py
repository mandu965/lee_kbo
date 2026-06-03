from app.engine.lineup import (
    LineupPlayerImpact,
    LineupStrength,
    _compare_expected_lineup,
    lineup_adjustment,
)


def _strength(ratio: float) -> LineupStrength:
    return LineupStrength(available=True, strength_ratio=ratio)


def test_lineup_adjustment_requires_both_teams() -> None:
    assert lineup_adjustment(_strength(1.10), LineupStrength()) == 0.0


def test_lineup_adjustment_reflects_relative_strength() -> None:
    assert lineup_adjustment(_strength(1.04), _strength(0.99)) == 0.006


def test_lineup_adjustment_is_capped_at_three_percentage_points() -> None:
    assert lineup_adjustment(_strength(1.40), _strength(0.80)) == 0.03
    assert lineup_adjustment(_strength(0.80), _strength(1.40)) == -0.03


def test_compare_expected_lineup_reports_excluded_regulars_and_replacements() -> None:
    expected = [
        LineupPlayerImpact(player_id=1, name="regular", ops=0.900),
        LineupPlayerImpact(player_id=2, name="stays", ops=0.800),
    ]
    actual = [
        LineupPlayerImpact(player_id=2, name="stays", ops=0.800),
        LineupPlayerImpact(player_id=3, name="replacement", ops=0.650),
    ]

    excluded, replacements = _compare_expected_lineup(expected, actual)

    assert [player.name for player in excluded] == ["regular"]
    assert [player.name for player in replacements] == ["replacement"]
