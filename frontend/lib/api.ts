import type {
  AccuracyResponse,
  BatterRankingItem,
  EloHistoryItem,
  GameListResponse,
  GameResponse,
  MonthlyAccuracy,
  PitcherDetail,
  PitcherRankingItem,
  PredictionHistoryItem,
  PredictionInGame,
  RecentGameItem,
  StreakResponse,
  TeamDetail,
  TeamInRanking,
} from "./types";

export class ApiError extends Error {
  status: number;
  path: string;

  constructor(status: number, path: string) {
    super(`API error ${status}: ${path}`);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }
}

const BASE =
  (typeof window === "undefined"
    ? (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL)
    : process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:8002/v1";

async function get<T>(path: string, revalidate?: number): Promise<T> {
  const init: RequestInit = revalidate !== undefined
    ? { next: { revalidate } as NextFetchRequestConfig }
    : { cache: "no-store" };
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new ApiError(res.status, path);
  return res.json() as Promise<T>;
}

// ── 경기 ────────────────────────────────────────────────────────
export const getTodayGames = () =>
  get<GameListResponse>("/games/today", 3600);          // ISR 1시간

export const getGamesByDate = (date: string) =>
  get<GameListResponse>(`/games?date=${date}`, 3600);

export const getGame = (id: number) =>
  get<GameResponse>(`/games/${id}`, 60);               // ISR 1분

export const getGamePrediction = (id: number) =>
  get<PredictionInGame>(`/games/${id}/prediction`, 60); // ISR 1분

// ── 팀 ─────────────────────────────────────────────────────────
export const getTeams = () =>
  get<TeamInRanking[]>("/teams", 86400);                // ISR 1일

export const getTeam = (id: number) =>
  get<TeamDetail>(`/teams/${id}`, 3600);

export const getTeamRecent = (id: number, n = 10) =>
  get<RecentGameItem[]>(`/teams/${id}/recent?n=${n}`, 3600);

export const getTeamEloHistory = (id: number) =>
  get<EloHistoryItem[]>(`/teams/${id}/elo-history`, 3600);

// ── 투수 ────────────────────────────────────────────────────────
export const getTodayPitchers = () =>
  get<PitcherDetail[]>("/pitchers/today", 3600);

export const getPitcherStats = (id: number) =>
  get<PitcherDetail>(`/players/${id}/stats`, 86400);

// ── 예측 ────────────────────────────────────────────────────────
export const getAccuracy = () =>
  get<AccuracyResponse>("/predictions/accuracy", 3600);

export const getPredictionHistory = (month?: number) =>
  get<PredictionHistoryItem[]>(
    `/predictions/history${month ? `?month=${month}` : ""}`,
    3600,
  );

export const getMonthlyAccuracy = () =>
  get<MonthlyAccuracy[]>("/predictions/history/monthly", 3600);

export const getStreak = () =>
  get<StreakResponse>("/predictions/streak", 3600);

// ── 선수 기록 순위 ───────────────────────────────────────────────
export const getBatterRankings = (params?: { sort?: string; team?: string; limit?: number }) => {
  const q = new URLSearchParams();
  if (params?.sort) q.set("sort", params.sort);
  if (params?.team) q.set("team", params.team);
  if (params?.limit) q.set("limit", String(params.limit));
  return get<BatterRankingItem[]>(`/stats/batters?${q}`, 3600);
};

export const getPitcherRankings = (params?: { sort?: string; team?: string; limit?: number }) => {
  const q = new URLSearchParams();
  if (params?.sort) q.set("sort", params.sort);
  if (params?.team) q.set("team", params.team);
  if (params?.limit) q.set("limit", String(params.limit));
  return get<PitcherRankingItem[]>(`/stats/pitchers?${q}`, 3600);
};

export const getTeamRoster = (id: number) =>
  get<any>(`/teams/${id}/roster`, 1800);

// ── 블로그 ───────────────────────────────────────────────────────
import type { BlogListResponse, BlogPostDetail } from "./types";

export const getBlogPosts = (page = 1, limit = 20) =>
  get<BlogListResponse>(`/blog/posts?page=${page}&limit=${limit}`, 1800);

export const getBlogPost = (date: string, slug: string) =>
  get<BlogPostDetail>(`/blog/posts/${date}/${slug}`, 1800);
