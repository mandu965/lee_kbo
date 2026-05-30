from datetime import date, time
from pydantic import BaseModel


class StarterInfo(BaseModel):
    id: int
    name: str
    era: float | None = None
    whip: float | None = None
    # True=공식 확정, False=DB 이닝 최다 투수 추정
    is_confirmed: bool = False


class TeamInGame(BaseModel):
    id: int
    name: str
    short_name: str | None = None
    elo_rating: float
    recent_form: str = ""        # "WWLWL" (오른쪽이 최신)


class ParkFactorInfo(BaseModel):
    stadium: str
    factor: float
    hr_factor: float
    notes: str = ""


class WeatherInfo(BaseModel):
    temperature: float | None = None
    condition: str | None = None
    rain_risk: bool = False
    offense_adj: float = 0.0
    description: str = ""


class BullpenInfo(BaseModel):
    recent_innings: float
    fatigue_score: float
    level: str          # "여유" / "경고" / "소진"
    description: str


class PredictionInGame(BaseModel):
    home_win_prob: float
    away_win_prob: float
    key_factors: list[str] = []
    park: ParkFactorInfo | None = None
    weather: WeatherInfo | None = None
    bullpen_home: BullpenInfo | None = None
    bullpen_away: BullpenInfo | None = None


class StartersInGame(BaseModel):
    home: StarterInfo | None = None
    away: StarterInfo | None = None


class GameResponse(BaseModel):
    id: int
    game_date: date
    start_time: time | None = None
    stadium: str | None = None
    status: str
    home_team: TeamInGame
    away_team: TeamInGame
    home_score: int | None = None
    away_score: int | None = None
    prediction: PredictionInGame | None = None
    starters: StartersInGame | None = None

    model_config = {"from_attributes": True}


class GameListResponse(BaseModel):
    date: date
    total: int
    games: list[GameResponse]
