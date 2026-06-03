from dataclasses import dataclass
from datetime import date, time
from typing import Optional


@dataclass
class GameScheduleData:
    game_date: date
    start_time: Optional[time]
    home_team_code: str
    away_team_code: str
    stadium: str
    status: str = "scheduled"          # scheduled / final / cancelled
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    home_starter_name: Optional[str] = None
    away_starter_name: Optional[str] = None
    external_game_id: Optional[str] = None   # KBO 원천 gameId (예: "20260501NCLG0")
    doubleheader_no: int = 0                  # 0=일반/1차전, 1=2차전


@dataclass
class PitcherStatData:
    player_name: str
    team_code: str
    season: int
    kbo_player_id: Optional[str] = None
    era: Optional[float] = None
    whip: Optional[float] = None
    innings_pitched: Optional[float] = None
    hits: Optional[int] = None
    runs: Optional[int] = None
    earned_runs: Optional[int] = None
    walks: Optional[int] = None
    strikeouts: Optional[int] = None
    # 확장 필드 (KBO 공식 추가 컬럼)
    games: Optional[int] = None
    wins: Optional[int] = None
    losses: Optional[int] = None
    saves: Optional[int] = None
    holds: Optional[int] = None
    home_runs_allowed: Optional[int] = None
    hbp: Optional[int] = None


@dataclass
class PitcherGameLogData:
    kbo_player_id: str
    game_date: date
    opponent_name: str
    role: str
    game_result: Optional[str] = None
    era: Optional[float] = None
    batters_faced: Optional[int] = None
    innings_pitched: Optional[float] = None
    hits: Optional[int] = None
    home_runs_allowed: Optional[int] = None
    walks: Optional[int] = None
    hbp: Optional[int] = None
    strikeouts: Optional[int] = None
    runs: Optional[int] = None
    earned_runs: Optional[int] = None


@dataclass
class TeamGameStatData:
    external_game_id: str
    side: str
    runs: int
    hits: int
    at_bats: int
    walks: int
    strikeouts: int
    home_runs: int
    team_avg: Optional[float]
    team_ops: Optional[float]


@dataclass
class GameLineupData:
    external_game_id: str
    side: str
    player_name: str
    player_code: Optional[str]
    bat_order: int
    position: Optional[str]
    is_starter: bool
    is_confirmed: bool


@dataclass
class TeamStatData:
    team_code: str
    season: int
    team_avg: Optional[float] = None
    team_ops: Optional[float] = None
    runs_scored: Optional[int] = None
    wins: Optional[int] = None
    losses: Optional[int] = None
    draws: Optional[int] = None


@dataclass
class WeatherData:
    game_date: date
    stadium: str
    temperature: Optional[float] = None
    condition: Optional[str] = None
