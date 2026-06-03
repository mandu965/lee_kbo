from datetime import date, time, datetime
from pydantic import BaseModel


class StarterInfo(BaseModel):
    id: int
    name: str
    era: float | None = None
    whip: float | None = None
    # K/BB 제구력 지수 (높을수록 제구 안정)
    k_bb_ratio: float | None = None
    wins: int | None = None
    losses: int | None = None
    innings_pitched: float | None = None
    recent_summary: "StarterRecentSummary | None" = None
    recent_games: list["StarterAppearanceInfo"] = []
    # True=공식 확정, False=DB 이닝 최다 투수 추정
    is_confirmed: bool = False


class StarterAppearanceInfo(BaseModel):
    game_date: date
    opponent_name: str
    game_result: str | None = None
    innings_pitched: float
    hits: int
    walks: int
    strikeouts: int
    runs: int
    earned_runs: int


class StarterRecentSummary(BaseModel):
    games: int
    innings_pitched: float
    era: float | None = None
    whip: float | None = None
    avg_innings: float | None = None


class TeamRecentGameInfo(BaseModel):
    game_date: date
    opponent_name: str
    result: str
    runs_for: int
    runs_against: int


class TeamRecentTrendInfo(BaseModel):
    games: int
    wins: int
    losses: int
    draws: int
    runs_for: int
    runs_against: int
    avg_runs_for: float
    avg_runs_against: float
    run_diff: int
    avg_ops: float | None = None
    ops_games: int = 0
    recent_games: list[TeamRecentGameInfo] = []


class LineupPlayerInfo(BaseModel):
    player_id: int | None = None
    name: str
    bat_order: int
    position: str | None = None
    ops: float | None = None


class LineupPlayerImpactInfo(BaseModel):
    player_id: int
    name: str
    ops: float | None = None


class TeamLineupInfo(BaseModel):
    is_confirmed: bool = False
    strength_available: bool = False
    weighted_ops: float | None = None
    baseline_ops: float | None = None
    strength_ratio: float | None = None
    ops_player_count: int = 0
    excluded_regulars: list[LineupPlayerImpactInfo] = []
    replacements: list[LineupPlayerImpactInfo] = []
    players: list[LineupPlayerInfo] = []


class TeamInGame(BaseModel):
    id: int
    code: str
    name: str
    short_name: str | None = None
    elo_rating: float
    home_elo: float = 1500.0
    away_elo: float = 1500.0
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
    pitchers: list["BullpenPitcherInfo"] = []
    injured_pitchers: list["InjuredPitcherInfo"] = []

    model_config = {"from_attributes": True}


class BullpenAppearanceInfo(BaseModel):
    game_date: date
    opponent_name: str
    innings_pitched: float
    batters_faced: int | None = None
    hits: int | None = None
    walks: int | None = None
    strikeouts: int | None = None
    runs: int | None = None
    earned_runs: int | None = None

    model_config = {"from_attributes": True}


class BullpenPitcherInfo(BaseModel):
    player_id: int
    name: str
    recent_innings: float
    appearances: int
    consecutive_days: int
    availability: str
    saves: int
    holds: int
    season_games: int
    logs: list[BullpenAppearanceInfo] = []

    model_config = {"from_attributes": True}


class InjuredPitcherInfo(BaseModel):
    player_id: int
    name: str
    status: str

    model_config = {"from_attributes": True}


class FactorContribution(BaseModel):
    key: str
    label: str
    contribution_pp: float
    available: bool = True


class PredictionTrendItem(BaseModel):
    generated_at: datetime
    prediction_type: str
    home_win_prob: float
    change_pp: float | None = None
    data_completeness: float | None = None


class PredictionInGame(BaseModel):
    home_win_prob: float
    away_win_prob: float
    key_factors: list[str] = []
    park: ParkFactorInfo | None = None
    weather: WeatherInfo | None = None
    bullpen_home: BullpenInfo | None = None
    bullpen_away: BullpenInfo | None = None
    model_version: str | None = None
    generated_at: datetime | None = None
    prediction_type: str | None = None
    data_completeness: float | None = None
    missing_features: list[str] = []
    factor_contributions: list[FactorContribution] = []
    change_from_previous_pp: float | None = None
    trend: list[PredictionTrendItem] = []
    # 예측 신뢰도 (0~1) + 레벨
    confidence: float = 0.0
    confidence_level: str = "보통"   # "높음" / "보통" / "낮음"
    # 각 지표 방향 투표 결과 {지표명: True(홈)/False(원정)}
    indicator_votes: dict = {}


class StartersInGame(BaseModel):
    home: StarterInfo | None = None
    away: StarterInfo | None = None


class DataFreshnessItem(BaseModel):
    """지표별 데이터 기준 시각."""
    key: str                       # pitcher / batter / standings / lineup / weather / prediction
    label: str                     # 화면 표시명
    updated_at: datetime | None = None
    source: str = ""               # 데이터 원천
    is_stale: bool = False         # 갱신 지연 여부
    note: str | None = None        # "미수집" 등 상태 메모


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
    home_trend: TeamRecentTrendInfo | None = None
    away_trend: TeamRecentTrendInfo | None = None
    home_lineup: TeamLineupInfo | None = None
    away_lineup: TeamLineupInfo | None = None
    data_freshness: list[DataFreshnessItem] = []

    model_config = {"from_attributes": True}


class GameListResponse(BaseModel):
    date: date
    total: int
    games: list[GameResponse]
