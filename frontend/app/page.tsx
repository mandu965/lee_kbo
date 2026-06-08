import Link from "next/link";
import { getAccuracy, getTeams, getTodayGames } from "@/lib/api";
import type { GameResponse } from "@/lib/types";
import AccuracyBadge from "@/components/AccuracyBadge";
import AdSense from "@/components/AdSense";
import GameCard from "@/components/GameCard";

export const revalidate = 300;
export const dynamic = "force-dynamic";

function teamName(team: GameResponse["home_team"]) {
  return team.short_name ?? team.name;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function statusCounts(games: GameResponse[]) {
  return {
    scheduled: games.filter((game) => game.status === "scheduled").length,
    inProgress: games.filter((game) => game.status === "in_progress").length,
    final: games.filter((game) => game.status === "final").length,
  };
}

function predictionSpread(game: GameResponse) {
  if (!game.prediction) return null;
  return Math.abs(game.prediction.home_win_prob - game.prediction.away_win_prob);
}

function spreadText(game: GameResponse) {
  const spread = predictionSpread(game);
  if (spread == null) return "예측 준비 중";
  if (spread <= 0.03) return `초접전 ${Math.round(spread * 1000) / 10}%p`;
  if (spread <= 0.07) return `접전 ${Math.round(spread * 1000) / 10}%p`;

  const favorite =
    game.prediction!.home_win_prob >= game.prediction!.away_win_prob ? teamName(game.home_team) : teamName(game.away_team);
  return `${favorite} 우세 ${Math.round(spread * 1000) / 10}%p`;
}

function gameTitle(game: GameResponse) {
  return `${teamName(game.away_team)} vs ${teamName(game.home_team)}`;
}

function buildHighlightReason(game: GameResponse) {
  if (game.status === "in_progress") return "현재 진행 중인 경기";

  const spread = predictionSpread(game);
  if (spread != null && spread <= 0.03) return `예측 확률 차이 ${(spread * 100).toFixed(1)}%p 초접전`;
  if (spread != null && spread <= 0.07) return `예측 확률 차이 ${(spread * 100).toFixed(1)}%p 접전`;

  if (game.starters?.home && game.starters?.away) return "양 팀 선발 정보 반영";
  if (game.prediction?.data_completeness != null && game.prediction.data_completeness >= 70) {
    return `데이터 완성도 ${game.prediction.data_completeness.toFixed(0)}%`;
  }
  if (game.home_trend && game.away_trend) return "최근 흐름 비교 가능";
  return "오늘 경기 분석 보기";
}

function pickFeaturedGame(games: GameResponse[]) {
  if (games.length === 0) return null;

  const ranked = [...games].sort((a, b) => {
    const liveA = a.status === "in_progress" ? 1 : 0;
    const liveB = b.status === "in_progress" ? 1 : 0;
    if (liveA !== liveB) return liveB - liveA;

    const spreadA = predictionSpread(a);
    const spreadB = predictionSpread(b);
    if (spreadA != null && spreadB != null) return spreadA - spreadB;
    if (spreadA != null) return -1;
    if (spreadB != null) return 1;

    const startersA = a.starters?.home && a.starters?.away ? 1 : 0;
    const startersB = b.starters?.home && b.starters?.away ? 1 : 0;
    return startersB - startersA;
  });

  return ranked[0];
}

function pickWideSpreadGame(games: GameResponse[]) {
  const withPrediction = games.filter((game) => game.prediction);
  if (withPrediction.length === 0) return null;

  return withPrediction.sort((a, b) => (predictionSpread(b) ?? 0) - (predictionSpread(a) ?? 0))[0];
}

function orderGames(games: GameResponse[], featuredId: number | null) {
  return [...games].sort((a, b) => {
    if (a.id === featuredId) return -1;
    if (b.id === featuredId) return 1;

    const liveA = a.status === "in_progress" ? 1 : 0;
    const liveB = b.status === "in_progress" ? 1 : 0;
    if (liveA !== liveB) return liveB - liveA;

    const finalA = a.status === "final" ? 1 : 0;
    const finalB = b.status === "final" ? 1 : 0;
    if (finalA !== finalB) return finalA - finalB;

    return (a.start_time ?? "").localeCompare(b.start_time ?? "");
  });
}

export default async function HomePage() {
  const [gameList, accuracy, teams] = await Promise.all([
    getTodayGames().catch(() => null),
    getAccuracy().catch(() => null),
    getTeams().catch(() => []),
  ]);

  const games = gameList?.games ?? [];
  const counts = statusCounts(games);
  const featuredGame = pickFeaturedGame(games);
  const wideSpreadGame = pickWideSpreadGame(games);
  const orderedGames = orderGames(games, featuredGame?.id ?? null);
  const top5 = teams.slice(0, 5);

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-300">KBO 데이터 분석</p>
          <h1 className="text-2xl font-black text-white sm:text-3xl">
            {gameList ? formatDate(gameList.date) : "오늘의 KBO 경기"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            오늘 경기의 예측 흐름, 선발 매치업, 최근 팀 컨디션을 한 화면에서 확인하고 관심 경기로 바로 이동하세요.
          </p>
        </div>
        {accuracy && accuracy.total > 0 && (
          <AccuracyBadge accuracy={accuracy.accuracy} total={accuracy.total} label="시즌 적중률" />
        )}
      </section>

      {gameList ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardMetric label="오늘 경기" value={`${gameList.total}경기`} helper="전체 일정" />
          <DashboardMetric label="진행 중" value={`${counts.inProgress}경기`} helper="라이브 확인" emphasis={counts.inProgress > 0} />
          <DashboardMetric
            label="접전 후보"
            value={featuredGame ? gameTitle(featuredGame) : "-"}
            helper={featuredGame ? spreadText(featuredGame) : "예측 준비 중"}
            href={featuredGame ? `/games/${featuredGame.id}` : undefined}
          />
          <DashboardMetric
            label="뚜렷한 우세"
            value={wideSpreadGame ? gameTitle(wideSpreadGame) : "-"}
            helper={wideSpreadGame ? spreadText(wideSpreadGame) : "예측 준비 중"}
            href={wideSpreadGame ? `/games/${wideSpreadGame.id}` : undefined}
          />
        </section>
      ) : null}

      {featuredGame && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-100">오늘의 주목 경기</h2>
              <p className="mt-1 text-sm text-slate-500">{buildHighlightReason(featuredGame)}</p>
            </div>
            <Link href={`/games/${featuredGame.id}`} className="shrink-0 text-xs font-bold text-indigo-300 hover:text-indigo-200">
              상세 분석
            </Link>
          </div>
          <GameCard game={featuredGame} variant="featured" highlightReason={buildHighlightReason(featuredGame)} />
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <section className="min-w-0 space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-100">전체 경기</h2>
              <p className="mt-1 text-sm text-slate-500">
                예정 {counts.scheduled} · 진행 {counts.inProgress} · 종료 {counts.final}
              </p>
            </div>
            <Link href="/schedule" className="text-xs font-bold text-indigo-300 hover:text-indigo-200">
              일정 보기
            </Link>
          </div>

          {!gameList ? (
            <EmptyState title="경기 정보를 불러오지 못했습니다." body="잠시 후 다시 확인해 주세요. 팀 순위와 선수 기록은 계속 이용할 수 있습니다." />
          ) : orderedGames.length === 0 ? (
            <EmptyState title="오늘 예정된 경기가 없습니다." body="이전 경기 결과, 팀 순위, 선수 기록을 확인해 보세요." />
          ) : (
            <div className="space-y-4">
              {orderedGames.map((game, idx) => (
                <div key={game.id}>
                  <GameCard game={game} highlightReason={game.id === featuredGame?.id ? buildHighlightReason(game) : undefined} />
                  {idx === 3 && (
                    <AdSense slot={process.env.NEXT_PUBLIC_AD_SLOT_BANNER ?? ""} format="horizontal" className="my-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          {top5.length > 0 && (
            <section className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#111827]">
              <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">팀 순위</h2>
                <Link href="/teams" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
                  전체
                </Link>
              </div>
              <div>
                {top5.map((team) => (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}`}
                    className="flex items-center border-b border-white/[0.03] px-4 py-2.5 transition-colors last:border-0 hover:bg-indigo-500/5"
                  >
                    <span className="mr-3 w-5 text-center text-xs font-black text-slate-500">{team.rank}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-200">{team.short_name ?? team.name}</span>
                    <span className="text-xs font-bold tabular-nums text-slate-400">{team.win_rate.toFixed(3)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <SideLink href="/players" label="선수 기록" />
            <SideLink href="/pitchers" label="투수 기록" />
            <SideLink href="/history" label="예측 히스토리" />
            <SideLink href="/blog" label="분석 글" />
          </section>
        </aside>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 px-5 py-4 text-xs leading-relaxed text-slate-500">
        모든 예측은 통계 모델 기반의 참고 정보입니다. 실제 경기 결과를 보장하지 않으며, 경기 전 선발·라인업·날씨 반영 상태에 따라 예측이 달라질 수 있습니다.
      </section>
    </div>
  );
}

function DashboardMetric({
  label,
  value,
  helper,
  href,
  emphasis = false,
}: {
  label: string;
  value: string;
  helper: string;
  href?: string;
  emphasis?: boolean;
}) {
  const content = (
    <div
      className={`h-full rounded-lg border p-4 transition ${
        emphasis
          ? "border-emerald-400/25 bg-emerald-500/10"
          : "border-white/[0.06] bg-[#111827] hover:border-indigo-400/30"
      }`}
    >
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-2 line-clamp-2 min-h-10 text-lg font-black leading-tight text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-5 py-16 text-center">
      <p className="text-lg font-bold text-slate-200">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{body}</p>
    </div>
  );
}

function SideLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-white/[0.06] bg-[#111827] px-4 py-3 text-sm font-bold text-slate-200 transition hover:border-indigo-400/30 hover:bg-[#151e2f]"
    >
      {label}
    </Link>
  );
}
