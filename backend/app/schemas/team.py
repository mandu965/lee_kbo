from datetime import date
from pydantic import BaseModel


class TeamBase(BaseModel):
    id: int
    code: str
    name: str
    short_name: str | None = None
    elo_rating: float

    model_config = {"from_attributes": True}


class TeamInRanking(TeamBase):
    rank: int | None = None
    wins: int = 0
    losses: int = 0
    draws: int = 0
    games_played: int = 0
    win_rate: float = 0.0
    games_behind: float | None = None
    recent_form: str = ""         # "WWLWL" (최근 5경기)
    last10: str | None = None     # "7승0무3패"
    streak: str | None = None     # "1승"
    home_record: str | None = None  # "17-0-10"
    away_record: str | None = None  # "14-0-10"


class EloHistoryItem(BaseModel):
    game_date: date
    elo_before: float
    elo_after: float
    elo_change: float

    model_config = {"from_attributes": True}


class RecentGameItem(BaseModel):
    game_date: date
    opponent_name: str
    is_home: bool
    my_score: int | None
    opp_score: int | None
    result: str | None           # "W" / "L" / "D"
    stadium: str | None

    model_config = {"from_attributes": True}


class TeamDetail(TeamBase):
    stadium: str | None = None
    wins: int = 0
    losses: int = 0
    draws: int = 0
    win_rate: float = 0.0
