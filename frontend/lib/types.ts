// ── 팀 ─────────────────────────────────────────────────────────
export interface TeamBase {
  id: number;
  code: string;
  name: string;
  short_name: string | null;
  elo_rating: number;
  home_elo: number;
  away_elo: number;
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
  k_bb_ratio: number | null;   // 탈삼진/볼넷 — 제구력 지수
  wins: number | null;
  losses: number | null;
  innings_pitched: number | null;
  games: number | null;        // 시즌 등판 수
  k_per_9: number | null;      // 9이닝당 탈삼진
  bb_per_9: number | null;     // 9이닝당 볼넷
  hr_per_9: number | null;     // 9이닝당 피홈런
  recent_summary: StarterRecentSummary | null;
  recent_games: StarterAppearanceInfo[];
  is_confirmed: boolean;
}

export interface StarterAppearanceInfo {
  game_date: string;
  opponent_name: string;
  game_result: string | null;
  innings_pitched: number;
  hits: number;
  walks: number;
  strikeouts: number;
  runs: number;
  earned_runs: number;
}

export interface StarterRecentSummary {
  games: number;
  innings_pitched: number;
  era: number | null;
  whip: number | null;
  avg_innings: number | null;
}

export interface TeamRecentGameInfo {
  game_date: string;
  opponent_name: string;
  result: string;
  runs_for: number;
  runs_against: number;
}

export interface TeamRecentTrendInfo {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  runs_for: number;
  runs_against: number;
  avg_runs_for: number;
  avg_runs_against: number;
  run_diff: number;
  avg_ops: number | null;
  ops_games: number;
  avg_hits: number | null;
  avg_home_runs: number | null;
  avg_walks: number | null;
  avg_strikeouts: number | null;
  walk_strikeout_ratio: number | null;
  stat_games: number;
  recent_games: TeamRecentGameInfo[];
}

export interface LineupPlayerInfo {
  player_id: number | null;
  name: string;
  bat_order: number;
  position: string | null;
  ops: number | null;
}

export interface TeamLineupInfo {
  is_confirmed: boolean;
  strength_available: boolean;
  weighted_ops: number | null;
  baseline_ops: number | null;
  strength_ratio: number | null;
  ops_player_count: number;
  excluded_regulars: LineupPlayerImpactInfo[];
  replacements: LineupPlayerImpactInfo[];
  players: LineupPlayerInfo[];
}

export interface LineupPlayerImpactInfo {
  player_id: number;
  name: string;
  ops: number | null;
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
  pitchers: BullpenPitcherInfo[];
  injured_pitchers: InjuredPitcherInfo[];
}

export interface BullpenAppearanceInfo {
  game_date: string;
  opponent_name: string;
  innings_pitched: number;
  batters_faced: number | null;
  hits: number | null;
  walks: number | null;
  strikeouts: number | null;
  runs: number | null;
  earned_runs: number | null;
}

export interface BullpenPitcherInfo {
  player_id: number;
  name: string;
  recent_innings: number;
  appearances: number;
  consecutive_days: number;
  availability: string;
  saves: number;
  holds: number;
  season_games: number;
  logs: BullpenAppearanceInfo[];
}

export interface InjuredPitcherInfo {
  player_id: number;
  name: string;
  status: string;
}

export interface FactorContribution {
  key: string;
  label: string;
  contribution_pp: number;
  available: boolean;
}

export interface PredictionTrendItem {
  generated_at: string;
  prediction_type: string;
  home_win_prob: number;
  change_pp: number | null;
  data_completeness: number | null;
}

export interface PredictionInGame {
  home_win_prob: number;
  away_win_prob: number;
  key_factors: string[];
  park: ParkFactorInfo | null;
  weather: WeatherInfo | null;
  bullpen_home: BullpenInfo | null;
  bullpen_away: BullpenInfo | null;
  model_version: string | null;
  generated_at: string | null;
  prediction_type: string | null;
  data_completeness: number | null;
  missing_features: string[];
  factor_contributions: FactorContribution[];
  change_from_previous_pp: number | null;
  trend: PredictionTrendItem[];
  confidence: number;
  confidence_level: "높음" | "보통" | "낮음";
  indicator_votes: Record<string, boolean>;
}

export interface StartersInGame {
  home: StarterInfo | null;
  away: StarterInfo | null;
}

export interface DataFreshnessItem {
  key: string;
  label: string;
  updated_at: string | null;
  source: string;
  is_stale: boolean;
  note: string | null;
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
  home_trend: TeamRecentTrendInfo | null;
  away_trend: TeamRecentTrendInfo | null;
  home_lineup: TeamLineupInfo | null;
  away_lineup: TeamLineupInfo | null;
  data_freshness: DataFreshnessItem[];
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

// ── 블로그 ───────────────────────────────────────────────────────
export interface BlogPost {
  date: string;
  slug: string;
  title: string;
  category: string;
  created_at: string | null;
}

export interface BlogPostDetail extends BlogPost {
  content: string;
  updated_at: string | null;
}

export interface BlogListResponse {
  total: number;
  page: number;
  limit: number;
  posts: BlogPost[];
}
