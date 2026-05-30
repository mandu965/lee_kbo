from pydantic import BaseModel


class PlayerBase(BaseModel):
    id: int
    name: str
    position: str | None = None
    team_id: int | None = None

    model_config = {"from_attributes": True}


class PitcherStatResponse(BaseModel):
    season: int
    era: float | None = None
    whip: float | None = None
    innings_pitched: float | None = None
    wins: int | None = None
    losses: int | None = None
    strikeouts: int | None = None
    walks: int | None = None

    model_config = {"from_attributes": True}


class PitcherDetail(PlayerBase):
    team_name: str | None = None
    season_stats: PitcherStatResponse | None = None
