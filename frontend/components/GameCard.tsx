import Link from "next/link";
import type { FactorContribution, GameResponse, StarterInfo } from "@/lib/types";
import RecentFormBadges from "./RecentFormBadges";
import WeatherBadge from "./WeatherBadge";
import WinProbBar from "./WinProbBar";

interface GameCardProps {
  game: GameResponse;
  variant?: "default" | "featured" | "compact";
  highlightReason?: string;
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: "예정",
  in_progress: "진행 중",
  final: "종료",
  cancelled: "취소",
};

function teamName(team: GameResponse["home_team"]) {
  return team.short_name ?? team.name;
}

function formatTime(value: string | null) {
  return value?.slice(0, 5) ?? "-";
}

function statusTone(status: string) {
  if (status === "final") return "bg-slate-700/50 text-slate-400";
  if (status === "in_progress") return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20";
  return "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/20";
}

function topFactors(game: GameResponse, limit: number): FactorContribution[] {
  return (game.prediction?.factor_contributions ?? [])
    .filter((factor) => factor.available && Math.abs(factor.contribution_pp) >= 0.4)
    .sort((a, b) => Math.abs(b.contribution_pp) - Math.abs(a.contribution_pp))
    .slice(0, limit);
}

function factorTeam(game: GameResponse, factor: FactorContribution) {
  return factor.contribution_pp >= 0 ? teamName(game.home_team) : teamName(game.away_team);
}

function starterLine(starter: StarterInfo | null | undefined) {
  if (!starter) return "선발 미정";
  const era = starter.era == null ? "ERA -" : `ERA ${starter.era.toFixed(2)}`;
  return `${starter.name} · ${era}`;
}

function spreadLabel(game: GameResponse) {
  const prediction = game.prediction;
  if (!prediction) return null;

  const diff = Math.abs(prediction.home_win_prob - prediction.away_win_prob) * 100;
  if (diff <= 3) return `초접전 ${diff.toFixed(1)}%p`;
  if (diff <= 7) return `접전 ${diff.toFixed(1)}%p`;

  const favorite =
    prediction.home_win_prob >= prediction.away_win_prob ? teamName(game.home_team) : teamName(game.away_team);
  return `${favorite} 우세 ${diff.toFixed(1)}%p`;
}

function ScoreBlock({ game }: { game: GameResponse }) {
  const isFinished = game.status === "final";
  const awayWin = isFinished && (game.away_score ?? 0) > (game.home_score ?? 0);
  const homeWin = isFinished && (game.home_score ?? 0) > (game.away_score ?? 0);

  if (!isFinished) {
    return <span className="text-lg font-black text-slate-600">VS</span>;
  }

  return (
    <div className="flex items-center gap-2 text-2xl font-black tabular-nums">
      <span className={awayWin ? "text-white" : "text-slate-500"}>{game.away_score}</span>
      <span className="text-base text-slate-600">:</span>
      <span className={homeWin ? "text-white" : "text-slate-500"}>{game.home_score}</span>
    </div>
  );
}

function CompactCard({ game, highlightReason }: { game: GameResponse; highlightReason?: string }) {
  return (
    <Link
      href={`/games/${game.id}`}
      className="grid gap-3 rounded-lg border border-white/[0.06] bg-[#111827] p-3 transition hover:border-indigo-400/40 hover:bg-[#151e2f] sm:grid-cols-[1fr_auto]"
    >
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{formatTime(game.start_time)}</span>
          <span>{game.stadium ?? "-"}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusTone(game.status)}`}>
            {STATUS_LABEL[game.status] ?? game.status}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm font-black text-slate-100">
          <span className="truncate">{teamName(game.away_team)}</span>
          <span className="text-slate-600">vs</span>
          <span className="truncate">{teamName(game.home_team)}</span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">{highlightReason ?? spreadLabel(game) ?? "경기 분석 보기"}</p>
      </div>
      <div className="self-center text-right text-xs font-bold text-indigo-300">분석 보기</div>
    </Link>
  );
}

export default function GameCard({ game, variant = "default", highlightReason }: GameCardProps) {
  if (variant === "compact") {
    return <CompactCard game={game} highlightReason={highlightReason} />;
  }

  const isFeatured = variant === "featured";
  const isFinished = game.status === "final";
  const factors = topFactors(game, isFeatured ? 2 : 1);
  const summary = highlightReason ?? spreadLabel(game);

  return (
    <Link href={`/games/${game.id}`} className="block">
      <article
        className={`rounded-lg border border-white/[0.06] bg-[#111827] transition duration-200 hover:-translate-y-px hover:border-indigo-400/40 hover:bg-[#151e2f] hover:shadow-[0_12px_36px_rgba(0,0,0,0.28)] ${
          isFeatured ? "p-5" : "p-4 sm:p-5"
        }`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex min-w-0 items-center gap-2">
            <span>{game.stadium ?? "-"}</span>
            {summary && (
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                {summary}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {game.prediction?.weather && <WeatherBadge weather={game.prediction.weather} compact />}
            <span>{formatTime(game.start_time)}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusTone(game.status)}`}>
              {STATUS_LABEL[game.status] ?? game.status}
            </span>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-black text-slate-100">{teamName(game.away_team)}</p>
            <div className="mt-1">
              <RecentFormBadges form={game.away_team.recent_form} />
            </div>
          </div>
          <ScoreBlock game={game} />
          <div className="min-w-0 text-right">
            <p className="truncate text-lg font-black text-slate-100">{teamName(game.home_team)}</p>
            <div className="mt-1 flex justify-end">
              <RecentFormBadges form={game.home_team.recent_form} />
            </div>
          </div>
        </div>

        {!isFinished && game.prediction && (
          <div className="mb-4">
            <WinProbBar
              homeProb={game.prediction.home_win_prob}
              awayProb={game.prediction.away_win_prob}
              homeTeamName={teamName(game.home_team)}
              awayTeamName={teamName(game.away_team)}
            />
          </div>
        )}

        <div className="grid gap-2 border-t border-white/[0.06] pt-3 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-900/45 px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-slate-500">원정 선발</p>
            <p className="mt-1 truncate text-xs font-bold text-slate-200">{starterLine(game.starters?.away)}</p>
          </div>
          <div className="rounded-lg bg-slate-900/45 px-3 py-2 sm:text-right">
            <p className="text-[10px] font-bold uppercase text-slate-500">홈 선발</p>
            <p className="mt-1 truncate text-xs font-bold text-slate-200">{starterLine(game.starters?.home)}</p>
          </div>
        </div>

        {(factors.length > 0 || game.prediction?.data_completeness != null) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {factors.map((factor) => (
              <span
                key={factor.key}
                className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-indigo-200"
              >
                {factor.label} · {factorTeam(game, factor)} {Math.abs(factor.contribution_pp).toFixed(1)}%p
              </span>
            ))}
            {game.prediction?.data_completeness != null && (
              <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-400">
                데이터 {game.prediction.data_completeness.toFixed(0)}%
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
          <span className="text-xs text-slate-500">
            {isFeatured ? "선발, 최근 흐름, 예측 변화까지 상세 분석" : "경기 상세에서 예측 근거 확인"}
          </span>
          <span className="text-xs font-black text-indigo-300">분석 보기</span>
        </div>
      </article>
    </Link>
  );
}
