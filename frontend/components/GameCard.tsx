import Link from "next/link";
import type { GameResponse } from "@/lib/types";
import WinProbBar from "./WinProbBar";
import RecentFormBadges from "./RecentFormBadges";
import WeatherBadge from "./WeatherBadge";

interface GameCardProps {
  game: GameResponse;
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: "예정",
  in_progress: "진행중",
  final: "종료",
  cancelled: "취소",
};

const CONFIDENCE_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  높음: { color: "#34d399", bg: "rgba(16,185,129,0.08)", border: "rgba(52,211,153,0.2)", icon: "●" },
  보통: { color: "#fbbf24", bg: "rgba(245,158,11,0.08)", border: "rgba(251,191,36,0.2)", icon: "◑" },
  낮음: { color: "#fb923c", bg: "rgba(249,115,22,0.08)", border: "rgba(251,146,60,0.2)", icon: "○" },
};

function kbbColor(ratio: number | null | undefined): string {
  if (ratio == null) return "text-slate-500";
  if (ratio >= 4.0) return "text-emerald-400";
  if (ratio >= 2.5) return "text-yellow-400";
  return "text-red-400";
}

function parseRecord(rec: string | null | undefined) {
  if (!rec) return null;
  const [w, d, l] = rec.split("-").map(Number);
  if (isNaN(w)) return null;
  const pct = (w + d + l) > 0 ? w / (w + d + l) : 0;
  return { w, d, l, pct };
}

export default function GameCard({ game }: GameCardProps) {
  const { home_team, away_team, prediction, starters, status } = game;
  const isFinished = status === "final";

  const confidenceLevel = prediction?.confidence_level ?? "보통";
  const confidence = prediction?.confidence ?? 0;
  const confCfg = CONFIDENCE_CONFIG[confidenceLevel] ?? CONFIDENCE_CONFIG["보통"];

  // K/BB 색상
  const homeKbb = starters?.home?.k_bb_ratio;
  const awayKbb = starters?.away?.k_bb_ratio;

  // 홈팀 홈 성적 / 원정팀 원정 성적 인사이트
  const ht = home_team as any;
  const at = away_team as any;
  const homeRec = parseRecord(ht?.home_record);
  const awayRec = parseRecord(at?.away_record);
  const parkFactor = prediction?.park?.factor;

  const insights: string[] = [];
  if (homeRec && homeRec.pct >= 0.6) insights.push(`${home_team.short_name ?? home_team.name} 홈 강세 ${(homeRec.pct*100).toFixed(0)}%`);
  else if (homeRec && homeRec.pct <= 0.35) insights.push(`${home_team.short_name ?? home_team.name} 홈 약세`);
  if (awayRec && awayRec.pct >= 0.6) insights.push(`${away_team.short_name ?? away_team.name} 원정 강함`);
  else if (awayRec && awayRec.pct <= 0.35) insights.push(`${away_team.short_name ?? away_team.name} 원정 고전`);
  if (parkFactor && parkFactor >= 1.07) insights.push("타자 친화 구장");
  else if (parkFactor && parkFactor <= 0.93) insights.push("투수 친화 구장");
  const groundInsight = !isFinished && insights.length > 0 ? insights.join(" · ") : null;

  return (
    <Link href={`/games/${game.id}`}>
      <div className="rounded-2xl p-4 transition-all duration-200 cursor-pointer hover:-translate-y-px hover:border-indigo-500/30 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] sm:p-5"
        style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}
      >

        {/* 헤더 */}
        <div className="flex flex-wrap justify-between items-center gap-2 mb-4 text-xs text-slate-400">
          <div className="flex min-w-0 items-center gap-2">
            <span>{game.stadium ?? "-"}</span>
            {prediction?.park && prediction.park.factor !== 1.0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                prediction.park.factor > 1.0 ? "bg-orange-900/40 text-orange-400" : "bg-cyan-900/40 text-cyan-400"
              }`}>
                {prediction.park.factor > 1.0 ? "타자" : "투수"} {prediction.park.factor.toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {prediction?.weather && <WeatherBadge weather={prediction.weather} compact />}
            <span>{game.start_time?.slice(0, 5) ?? "-"}</span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
              style={
                status === "final"
                  ? { background: "rgba(71,85,105,0.3)", color: "#64748b" }
                  : status === "in_progress"
                  ? { background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }
                  : { background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(165,180,252,0.2)" }
              }>
              {STATUS_LABEL[status] ?? status}
            </span>
          </div>
        </div>

        {/* 팀 매치업 — 왼쪽=원정, 오른쪽=홈 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col items-start gap-1 w-2/5">
            <span className="text-lg font-bold text-slate-100">{away_team.short_name ?? away_team.name}</span>
            <RecentFormBadges form={away_team.recent_form} />
          </div>
          <div className="flex flex-col items-center">
            {isFinished ? (
              <div className="flex items-center gap-2 text-2xl font-black">
                <span className={game.away_score! > game.home_score! ? "text-white" : "text-slate-500"}>{game.away_score}</span>
                <span className="text-slate-600 text-base">:</span>
                <span className={game.home_score! > game.away_score! ? "text-white" : "text-slate-500"}>{game.home_score}</span>
              </div>
            ) : (
              <span className="text-slate-500 font-bold text-lg">VS</span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 w-2/5">
            <span className="text-lg font-bold text-slate-100">{home_team.short_name ?? home_team.name}</span>
            <RecentFormBadges form={home_team.recent_form} />
          </div>
        </div>

        {/* 예측 승률 바 */}
        {!isFinished && prediction && (
          <div className="mb-3">
            <WinProbBar
              homeProb={prediction.home_win_prob}
              awayProb={prediction.away_win_prob}
              homeTeamName={home_team.short_name ?? home_team.name}
              awayTeamName={away_team.short_name ?? away_team.name}
            />

            {/* 신뢰도 배지 + 핵심 변화 요인 */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs"
              style={{ background: confCfg.bg, border: `1px solid ${confCfg.border}` }}>
              <span className="font-black" style={{ color: confCfg.color }}>{confCfg.icon} 신뢰도 {confidenceLevel}</span>
              <span style={{ color: "#334155" }}>|</span>
              <span style={{ color: "#64748b" }}>
                {confidenceLevel === "높음" ? "지표 일치 — 예측 확신" :
                 confidenceLevel === "보통" ? "지표 혼재 — 참고용" :
                 "지표 엇갈림 — 변수 많음"}
              </span>
              <span className="ml-auto text-[10px]" style={{ color: "#334155" }}>{Math.round(confidence * 100)}%</span>
            </div>

            {/* 핵심 기여 요인 1줄 — 가장 큰 기여도 항목 */}
            {(() => {
              const contribs = prediction.factor_contributions?.filter(f => f.available && Math.abs(f.contribution_pp) >= 0.5);
              if (!contribs?.length) return null;
              const top = contribs.reduce((a, b) => Math.abs(a.contribution_pp) > Math.abs(b.contribution_pp) ? a : b);
              const isHome = top.contribution_pp > 0;
              const teamName = isHome ? (home_team.short_name ?? home_team.name) : (away_team.short_name ?? away_team.name);
              return (
                <div className="mt-1.5 px-3 py-1 rounded-lg text-[11px]"
                  style={{ background: "rgba(255,255,255,0.03)" }}>
                  <span style={{ color: isHome ? "#f87171" : "#60a5fa" }}>
                    {top.label} → {teamName} {isHome ? "+" : ""}{top.contribution_pp.toFixed(1)}%p 유리
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        {/* 선발 투수 + K/BB */}
        {starters && (starters.home || starters.away) && (
          <div className="border-t border-slate-700 pt-3 mt-1">
            <div className="flex justify-between items-start">
              {/* 원정 선발 */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] text-slate-500">원정 선발{starters.away?.is_confirmed ? " ✓" : ""}</span>
                {starters.away ? (
                  <>
                    <span className="text-sm font-bold text-slate-200">{starters.away.name}</span>
                    <div className="flex gap-2 text-xs">
                      <span className="text-slate-500">ERA <span className={`font-bold ${(starters.away.era ?? 99) <= 3 ? "text-emerald-400" : (starters.away.era ?? 99) <= 4.5 ? "text-yellow-400" : "text-red-400"}`}>{starters.away.era?.toFixed(2) ?? "-"}</span></span>
                      <span className="text-slate-500">K/BB <span className={`font-bold ${kbbColor(awayKbb)}`}>{awayKbb?.toFixed(1) ?? "-"}</span></span>
                    </div>
                    {starters.away.wins != null && (
                      <span className="text-[10px] text-slate-600">{starters.away.wins}승 {starters.away.losses}패</span>
                    )}
                  </>
                ) : <span className="text-xs text-slate-500">미정</span>}
              </div>

              {/* 홈 선발 */}
              <div className="flex flex-col gap-0.5 items-end min-w-0">
                <span className="text-[10px] text-slate-500">{starters.home?.is_confirmed ? "✓ " : ""}홈 선발</span>
                {starters.home ? (
                  <>
                    <span className="text-sm font-bold text-slate-200">{starters.home.name}</span>
                    <div className="flex gap-2 text-xs flex-row-reverse">
                      <span className="text-slate-500">ERA <span className={`font-bold ${(starters.home.era ?? 99) <= 3 ? "text-emerald-400" : (starters.home.era ?? 99) <= 4.5 ? "text-yellow-400" : "text-red-400"}`}>{starters.home.era?.toFixed(2) ?? "-"}</span></span>
                      <span className="text-slate-500">K/BB <span className={`font-bold ${kbbColor(homeKbb)}`}>{homeKbb?.toFixed(1) ?? "-"}</span></span>
                    </div>
                    {starters.home.wins != null && (
                      <span className="text-[10px] text-slate-600">{starters.home.wins}승 {starters.home.losses}패</span>
                    )}
                  </>
                ) : <span className="text-xs text-slate-500">미정</span>}
              </div>
            </div>

            {/* 홈/원정 구장 인사이트 */}
            {groundInsight && (
              <div className="mt-2 pt-2 border-t border-slate-700/40 text-[11px] text-slate-500">
                ⚑ {groundInsight}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
