// ── 팀 ─────────────────────────────────────────────────────────
export interface TeamBase {
  id: number;
  code: string;
  name: string;
  short_name: string | null;
  elo_rating: number;
}

export interface TeamInGame extends TeamBase {
  recent_form: string; // "WWLWL"
}

export interface TeamInRanking extends TeamBase {
  rank: number | null;
  wins: number;
  losses: number;
  draws: number;
  games_played: number;
  win_rate: number;
  games_behind: number | null;
  recent_form: string;
  last10: string | null;
  streak: string | null;
  home_record: string | null;
  away_record: string | null;
}

export interface BatterRankingItem {
  rank: number;
  player_id: number;
  name: string;
  team_code: string;
  team_name: string;
  games: number | null;
  avg: number | null;
  plate_app: number | null;
  at_bats: number | null;
  runs: number | null;
  hits: number | null;
  doubles: number | null;
  triples: number | null;
  home_runs: number | null;
  rbi: number | null;
  walks: number | null;
  strikeouts: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
}

export interface PitcherRankingItem {
  rank: number;
  player_id: number;
  name: string;
  team_code: string;
  team_name: string;
  games: number | null;
  wins: number | null;
  losses: number | null;
  saves: number | null;
  holds: number | null;
  era: number | null;
  innings_pitched: number | null;
  hits: number | null;
  home_runs_allowed: number | null;
  walks: number | null;
  hbp: number | null;
  strikeouts: number | null;
  whip: number | null;
}

export interface TeamDetail extends TeamBase {
  stadium: string | null;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
}

export interface EloHistoryItem {
  game_date: string;
  elo_before: number;
  elo_after: number;
  elo_change: number;
}

export interface RecentGameItem {
  game_date: string;
  opponent_name: string;
  is_home: boolean;
  my_score: number | null;
  opp_score: number | null;
  result: "W" | "L" | "D" | null;
  stadium: string | null;
}

// ── 경기 ────────────────────────────────────────────────────────
export interface StarterInfo {
  id: number;
  name: string;
  era: number | null;
  whip: number | null;
  is_confirmed: boolean;
}

export interface ParkFactorInfo {
  stadium: string;
  factor: number;
  hr_factor: number;
  notes: string;
}

export interface WeatherInfo {
  temperature: number | null;
  condition: string | null;
  rain_risk: boolean;
  offense_adj: number;
  description: string;
}

export interface BullpenInfo {
  recent_innings: number;
  fatigue_score: number;
  level: string;
  description: string;
}

export interface PredictionInGame {
  home_win_prob: number;
  away_win_prob: number;
  key_factors: string[];
  park: ParkFactorInfo | null;
  weather: WeatherInfo | null;
  bullpen_home: BullpenInfo | null;
  bullpen_away: BullpenInfo | null;
}

export interface StartersInGame {
  home: StarterInfo | null;
  away: StarterInfo | null;
}

export interface GameResponse {
  id: number;
  game_date: string;
  start_time: string | null;
  stadium: string | null;
  status: string;
  home_team: TeamInGame;
  away_team: TeamInGame;
  home_score: number | null;
  away_score: number | null;
  prediction: PredictionInGame | null;
  starters: StartersInGame | null;
}

export interface GameListResponse {
  date: string;
  total: number;
  games: GameResponse[];
}

// ── 선수/투수 ──────────────────────────────────────────────────
export interface PitcherStatResponse {
  season: number;
  era: number | null;
  whip: number | null;
  innings_pitched: number | null;
  wins: number | null;
  losses: number | null;
  strikeouts: number | null;
  walks: number | null;
}

export interface PitcherDetail {
  id: number;
  name: string;
  position: string | null;
  team_id: number | null;
  team_name: string | null;
  season_stats: PitcherStatResponse | null;
}

// ── 예측 ────────────────────────────────────────────────────────
export interface AccuracyResponse {
  season: number;
  total: number;
  correct: number;
  accuracy: number;
  this_month_total: number;
  this_month_correct: number;
  this_month_accuracy: number;
}

export interface PredictionHistoryItem {
  game_date: string;
  game_id: number;
  home_team: string;
  away_team: string;
  home_win_prob: number;
  away_win_prob: number;
  predicted_winner: string | null;
  actual_winner: string | null;
  is_correct: boolean | null;
}

export interface MonthlyAccuracy {
  month: number;
  total: number;
  correct: number;
  accuracy: number;
}

export interface StreakResponse {
  current_streak: number;
  streak_type: "hit" | "miss" | "none";
  last_10_accuracy: number;
}
