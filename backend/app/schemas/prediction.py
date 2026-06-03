from datetime import date
from pydantic import BaseModel


class AccuracyResponse(BaseModel):
    season: int
    total: int
    correct: int
    accuracy: float              # 0~1
    this_month_total: int = 0
    this_month_correct: int = 0
    this_month_accuracy: float = 0.0


class PredictionHistoryItem(BaseModel):
    game_date: date
    game_id: int
    home_team: str
    away_team: str
    home_win_prob: float
    away_win_prob: float
    predicted_winner: str | None = None
    actual_winner: str | None = None
    is_correct: bool | None = None


class MonthlyAccuracy(BaseModel):
    month: int
    total: int
    correct: int
    accuracy: float


class StreakResponse(BaseModel):
    current_streak: int          # 양수=연속 적중, 음수=연속 실패
    streak_type: str             # "hit" / "miss" / "none"
    last_10_accuracy: float
