"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import GameCard from "@/components/GameCard";
import GameDetailTabs from "@/components/GameDetailTabs";
import RecentFormBadges from "@/components/RecentFormBadges";
import WinProbBar from "@/components/WinProbBar";
import type {
  DataFreshnessItem,
  FactorContribution,
  GameListResponse,
  GameResponse,
  PredictionInGame,
  StarterInfo,
  TeamLineupInfo,
  TeamRecentTrendInfo,
} from "@/lib/types";

const BASE = "/api";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function EloBar({ home, away }: { home: number; away: number }) {
  const total = home + away;
  const homeW = total > 0 ? Math.round((home / total) * 100) : 50;
  const awayW = 100 - homeW;
  return (
    <div className="w-full">
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-slate-700">
        <div className="bg-blue-500/60" style={{ width: `${awayW}%` }} />
        <div className="bg-red-500/60" style={{ width: `${homeW}%` }} />
      </div>
    </div>
  );
}

function StatCompareRow({
  label,
  awayVal,
  homeVal,
  awayBetter,
  unit = "",
}: {
  label: string;
  awayVal: string | number;
  homeVal: string | number;
  awayBetter?: boolean;
  unit?: string;
}) {
  return (
    <div className="grid grid-cols-3 items-center border-b border-slate-700/40 py-2.5 last:border-0">
      <div className={`pr-4 text-right text-sm font-bold ${awayBetter === true ? "text-blue-400" : "text-slate-200"}`}>
        {awayVal}{unit}
      </div>
      <div className="text-center text-xs text-slate-500">{label}</div>
      <div className={`pl-4 text-left text-sm font-bold ${awayBetter === false ? "text-red-400" : "text-slate-200"}`}>
        {homeVal}{unit}
      </div>
    </div>
  );
}

function FactorCard({ text }: { text: string }) {
  // key_factor는 팀명(한화/두산)으로 표기되어 자유 텍스트만으로는 홈/원정 유불리를
  // 판별할 수 없다. 신뢰성 있게 구분 가능한 위험 신호만 강조하고 나머지는 중립 처리.
  const isSevere = /소진|⚠️/.test(text);
  const isCaution = /경고/.test(text);
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${
      isSevere ? "border-red-800/40 bg-red-950/30" :
      isCaution ? "border-yellow-800/40 bg-yellow-950/30" :
      "border-slate-600/40 bg-slate-700/30"
    }`}>
      <span className={`mt-0.5 shrink-0 text-base ${
        isSevere ? "text-red-400" : isCaution ? "text-yellow-400" : "text-slate-400"
      }`}>
        {isSevere || isCaution ? "▼" : "•"}
      </span>
      <p className="text-sm leading-relaxed text-slate-200">{text}</p>
    </div>
  );
}

function ParkFactorBar({ factor }: { factor: number }) {
  const min = 0.85;
  const max = 1.15;
  const pct = Math.round(((factor - min) / (max - min)) * 100);
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative mt-2 h-3 w-full rounded-full bg-slate-700">
      <div className="absolute bottom-0 left-1/2 top-0 w-px bg-slate-500" />
      <div
        className={`absolute top-0.5 h-2 w-2 -translate-x-1/2 rounded-full ${
          factor > 1.03 ? "bg-orange-400" : factor < 0.97 ? "bg-cyan-400" : "bg-slate-300"
        }`}
        style={{ left: `${clamped}%` }}
      />
    </div>
  );
}

const PREDICTION_TYPE_LABEL: Record<string, string> = {
  baseline: "기본 예측",
  preliminary: "초기 예측",
  starter_confirmed: "선발 반영",
  lineup_confirmed: "라인업 반영",
  weather_updated: "날씨 반영",
  final: "최종 예측",
  manual: "수동 갱신",
};

function formatRunTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const [, , month, day, hour, minute] = match;
    return `${Number(month)}.${Number(day)} ${hour}:${minute}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${month}.${day} ${hour}:${minute}`;
}

function fmtIP(ip: number | null | undefined): string {
  if (ip == null) return "-";
  const whole = Math.floor(ip);
  const frac = Math.round((ip - whole) * 3);
  if (frac === 0) return `${whole}이닝`;
  if (frac === 1) return `${whole}⅓이닝`;
  if (frac === 2) return `${whole}⅔이닝`;
  return `${ip.toFixed(1)}이닝`;
}

function fmtUpdatedAt(iso: string): string {
  return formatRunTime(iso);
}

function BullpenUsageSection({
  awayTeamName,
  homeTeamName,
  bullpenAway,
  bullpenHome,
}: {
  awayTeamName: string;
  homeTeamName: string;
  bullpenAway: PredictionInGame["bullpen_away"];
  bullpenHome: PredictionInGame["bullpen_home"];
}) {
  if (!bullpenAway && !bullpenHome) return null;

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 space-y-5">
      <h2 className="text-sm font-black text-slate-200">불펜 소모 명단</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          { label: awayTeamName, bp: bullpenAway, side: "원정" },
          { label: homeTeamName, bp: bullpenHome, side: "홈" },
        ].map(({ label, bp, side }) => (
          <div key={label} className="rounded-xl bg-slate-700/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-slate-400">{label} <span className="text-slate-600">({side})</span></span>
              {bp && (
                <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                  bp.level === "소진" ? "bg-red-900/50 text-red-400" :
                  bp.level === "경고" ? "bg-yellow-900/50 text-yellow-400" :
                  "bg-emerald-900/50 text-emerald-400"
                }`}>{bp.level}</span>
              )}
            </div>
            {bp ? (
              <>
                <div className="h-2 w-full rounded-full bg-slate-600">
                  <div
                    className={`h-2 rounded-full ${
                      bp.level === "소진" ? "bg-red-500" :
                      bp.level === "경고" ? "bg-yellow-500" :
                      "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, bp.fatigue_score * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-400">{fmtIP(bp.recent_innings)} 등판</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{bp.description}</p>

                {bp.pitchers.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {bp.pitchers.map((pitcher) => (
                      <div key={pitcher.player_id} className="rounded-lg bg-slate-800/60 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-sm font-bold text-slate-200">{pitcher.name}</span>
                            <span className="ml-1.5 text-xs text-slate-500">
                              {pitcher.saves > 0 ? `${pitcher.saves}SV ` : ""}
                              {pitcher.holds > 0 ? `${pitcher.holds}HLD` : ""}
                            </span>
                          </div>
                          <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                            pitcher.availability === "휴식 권장" ? "bg-red-900/40 text-red-400" :
                            pitcher.availability === "주의" ? "bg-yellow-900/40 text-yellow-400" :
                            "bg-emerald-900/40 text-emerald-400"
                          }`}>
                            {pitcher.availability}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          3일 {pitcher.appearances}경기 · {fmtIP(pitcher.recent_innings)}
                          {pitcher.consecutive_days > 0 ? ` · ${pitcher.consecutive_days}일 연속` : ""}
                        </p>
                        {pitcher.logs.map((log) => (
                          <div
                            key={`${pitcher.player_id}-${log.game_date}-${log.opponent_name}`}
                            className="mt-1.5 grid text-xs text-slate-600"
                            style={{ gridTemplateColumns: "2.8rem 1fr auto" }}
                          >
                            <span className="tabular-nums">{log.game_date.slice(5).replace("-", ".")}</span>
                            <span>vs {log.opponent_name || "-"}</span>
                            <span className="text-right font-bold text-slate-400">{fmtIP(log.innings_pitched)}</span>
                            <span />
                            <span className="col-span-2 text-[11px]">
                              {log.hits ?? 0}H {log.walks ?? 0}BB {log.strikeouts ?? 0}K {log.runs ?? 0}R
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {bp.injured_pitchers.length > 0 && (
                  <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/20 p-2">
                    <p className="text-[10px] font-bold text-red-400">투수 부상자 명단</p>
                    {bp.injured_pitchers.map((pitcher) => (
                      <p key={pitcher.player_id} className="mt-1 text-[10px] text-red-300">
                        {pitcher.name} · {pitcher.status}
                      </p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-600">데이터 없음</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildGameAnalysis(game: GameResponse, prediction: PredictionInGame | null): string[] {
  const home = game.home_team.short_name ?? game.home_team.name;
  const away = game.away_team.short_name ?? game.away_team.name;
  const bullets: string[] = [];

  if (prediction) {
    const favored = prediction.home_win_prob >= prediction.away_win_prob ? home : away;
    const favoredProb = Math.max(prediction.home_win_prob, prediction.away_win_prob) * 100;
    bullets.push(
      `${favored}가 ${favoredProb.toFixed(1)}%로 근소하게 앞섭니다. 데이터 완성도는 ${
        prediction.data_completeness != null ? `${prediction.data_completeness.toFixed(0)}%` : "집계 중"
      }이며, 확률은 경기 결과를 보장하지 않습니다.`,
    );

    const contributions = prediction.factor_contributions
      .filter((factor) => factor.available && Math.abs(factor.contribution_pp) >= 0.3)
      .sort((a, b) => Math.abs(b.contribution_pp) - Math.abs(a.contribution_pp))
      .slice(0, 2);
    for (const factor of contributions) {
      const team = factor.contribution_pp >= 0 ? home : away;
      bullets.push(`${factor.label}에서 ${team}에 ${Math.abs(factor.contribution_pp).toFixed(1)}%p 유리한 신호가 잡혔습니다.`);
    }
  }

  const homeStarter = game.starters?.home;
  const awayStarter = game.starters?.away;
  if (homeStarter?.era != null && awayStarter?.era != null) {
    const homeEra = homeStarter.era;
    const awayEra = awayStarter.era;
    const homeStarterBetter = homeEra <= awayEra;
    const better = homeStarterBetter ? homeStarter : awayStarter;
    const betterEra = homeStarterBetter ? homeEra : awayEra;
    const betterTeam = homeStarterBetter ? home : away;
    const otherEra = homeStarterBetter ? awayEra : homeEra;
    bullets.push(`선발 비교에서는 ${betterTeam} ${better.name}의 ERA ${betterEra.toFixed(2)}가 상대 선발 ${otherEra.toFixed(2)}보다 낮습니다.`);
  }

  if (game.home_trend && game.away_trend) {
    const better = game.home_trend.run_diff >= game.away_trend.run_diff ? game.home_trend : game.away_trend;
    const betterTeam = game.home_trend.run_diff >= game.away_trend.run_diff ? home : away;
    bullets.push(`최근 ${better.games}경기 득실 흐름은 ${betterTeam}가 ${better.run_diff >= 0 ? "+" : ""}${better.run_diff}로 상대보다 안정적입니다.`);
  }

  if (prediction?.bullpen_home || prediction?.bullpen_away) {
    const homeBp = prediction.bullpen_home;
    const awayBp = prediction.bullpen_away;
    const tired = [
      homeBp && { team: home, bp: homeBp },
      awayBp && { team: away, bp: awayBp },
    ].filter((item): item is { team: string; bp: NonNullable<PredictionInGame["bullpen_home"]> } => !!item)
      .sort((a, b) => b.bp.fatigue_score - a.bp.fatigue_score)[0];
    if (tired && tired.bp.level !== "양호") {
      bullets.push(`${tired.team} 불펜은 최근 3일 ${fmtIP(tired.bp.recent_innings)}을 소화해 ${tired.bp.level} 상태입니다.`);
    }
  }

  if (prediction?.park && prediction.park.factor !== 1.0) {
    bullets.push(`구장 파크팩터 ${prediction.park.factor.toFixed(2)}는 ${prediction.park.factor > 1 ? "타자" : "투수"} 친화 참고 지표입니다. 현재 승률 계산에는 반영하지 않습니다.`);
  }

  return bullets.slice(0, 6);
}

function LoadingCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-slate-700 p-5" style={{ background: "#111827" }}>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-32 rounded bg-slate-700" />
        <div className="h-16 rounded-xl bg-slate-700/60" />
        <p className="text-sm text-slate-500">{text}</p>
      </div>
    </div>
  );
}

function formatOps(value: number | null | undefined) {
  return value == null ? "-" : value.toFixed(3);
}

function formatOneDecimal(value: number | null | undefined) {
  return value == null ? "-" : value.toFixed(1);
}

function trendRecord(trend: TeamRecentTrendInfo | null | undefined) {
  if (!trend) return "-";
  const draw = trend.draws ? ` ${trend.draws}무` : "";
  return `${trend.wins}승 ${trend.losses}패${draw}`;
}

function TrendMetric({
  label,
  away,
  home,
  awayBetter,
}: {
  label: string;
  away: string | number;
  home: string | number;
  awayBetter?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 items-center rounded-xl bg-slate-900/30 px-3 py-3">
      <p className={`text-right text-sm font-black ${awayBetter === true ? "text-blue-400" : "text-slate-200"}`}>
        {away}
      </p>
      <p className="text-center text-xs font-bold text-slate-500">{label}</p>
      <p className={`text-left text-sm font-black ${awayBetter === false ? "text-red-400" : "text-slate-200"}`}>
        {home}
      </p>
    </div>
  );
}

function starterAttackNote(starter: StarterInfo | null | undefined, opponentName: string) {
  if (!starter) return `${opponentName} 상대 선발 정보가 아직 부족합니다.`;

  const notes: string[] = [];
  if (starter.recent_summary?.era != null) {
    notes.push(`최근 ERA ${starter.recent_summary.era.toFixed(2)}`);
  }
  if (starter.recent_summary?.avg_innings != null) {
    notes.push(`평균 ${fmtIP(starter.recent_summary.avg_innings)}`);
  }
  if (starter.whip != null) {
    notes.push(`WHIP ${starter.whip.toFixed(2)}`);
  }
  if (starter.bb_per_9 != null && starter.bb_per_9 >= 4) {
    notes.push(`BB/9 ${starter.bb_per_9.toFixed(1)}`);
  }
  if (starter.hr_per_9 != null && starter.hr_per_9 >= 1) {
    notes.push(`HR/9 ${starter.hr_per_9.toFixed(1)}`);
  }

  return notes.length
    ? `${starter.name} 공략 포인트: ${notes.join(" · ")}`
    : `${starter.name} 상대로 출루와 장타 흐름을 함께 확인해야 합니다.`;
}

function LineupTeamCard({
  teamName,
  side,
  lineup,
}: {
  teamName: string;
  side: string;
  lineup: TeamLineupInfo | null;
}) {
  const hasPlayers = !!lineup?.players?.length;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/25 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-slate-100">{teamName}</h3>
          <p className="text-xs text-slate-500">{side}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
          hasPlayers ? "bg-emerald-900/40 text-emerald-400" : "bg-slate-700/60 text-slate-500"
        }`}>
          {hasPlayers ? "확정" : "대기"}
        </span>
      </div>

      {lineup?.strength_available && (
        <div className="mb-3 rounded-lg bg-slate-800/70 px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">라인업 강도</span>
            <span className={`font-black ${
              lineup.strength_ratio != null && lineup.strength_ratio >= 1
                ? "text-emerald-400"
                : lineup.strength_ratio != null && lineup.strength_ratio < 0.95
                  ? "text-orange-400"
                  : "text-slate-200"
            }`}>
              {lineup.strength_ratio != null ? `${(lineup.strength_ratio * 100).toFixed(0)}%` : "-"}
            </span>
          </div>
        </div>
      )}

      {hasPlayers ? (
        <div className="space-y-2">
          {lineup.players.map((player) => (
            <div key={`${side}-${player.bat_order}-${player.name}`} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="w-5 text-xs font-black text-indigo-300">{player.bat_order}</span>
                <div>
                  <p className="text-sm font-bold text-slate-100">{player.name}</p>
                  <p className="text-[11px] text-slate-500">{player.position ?? "-"}</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-400">OPS {formatOps(player.ops)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-slate-800/50 px-3 py-3 text-sm leading-relaxed text-slate-500">
          확정 타순 발표 전입니다. 현재 공격력 평가는 최근 팀 타격 흐름과 상대 선발 지표를 기준으로 봅니다.
        </p>
      )}
    </div>
  );
}

function predictionSummary(game: GameResponse, prediction: PredictionInGame) {
  const home = game.home_team.short_name ?? game.home_team.name;
  const away = game.away_team.short_name ?? game.away_team.name;
  const favorite = prediction.home_win_prob >= prediction.away_win_prob ? home : away;
  const underdog = prediction.home_win_prob >= prediction.away_win_prob ? away : home;
  const favoriteProb = Math.max(prediction.home_win_prob, prediction.away_win_prob) * 100;
  const margin = Math.abs(prediction.home_win_prob - prediction.away_win_prob) * 100;
  const available = prediction.factor_contributions
    .filter((factor) => factor.available && Math.abs(factor.contribution_pp) >= 0.4)
    .sort((a, b) => Math.abs(b.contribution_pp) - Math.abs(a.contribution_pp))
    .slice(0, 2)
    .map((factor) => factor.label);
  const reason = available.length ? `${available.join(", ")} 지표가 크게 작용했습니다` : "현재 반영된 지표 차이가 크지 않습니다";
  const closeness = margin < 3 ? "접전 구도" : margin < 7 ? "근소 우세" : "우세";

  return `${favorite} ${favoriteProb.toFixed(1)}% ${closeness}입니다. ${reason}. ${underdog}도 뒤집을 여지가 있어 수치 차이를 과신하면 안 됩니다.`;
}

function factorStatusLabel(key: string) {
  const labels: Record<string, string> = {
    elo: "ELO 전력",
    starter: "선발",
    form: "최근 흐름",
    home_adv: "홈 이점",
    park: "구장",
    weather: "날씨",
    bullpen: "불펜",
    lineup: "확정 타순",
    h2h: "상대전적",
  };
  return labels[key] ?? key;
}

function factorStatusTone(factor: { available: boolean; contribution_pp: number }) {
  if (!factor.available) return "border-slate-700/60 bg-slate-900/40 text-slate-500";
  if (factor.contribution_pp > 0.3) return "border-red-900/40 bg-red-950/20 text-red-300";
  if (factor.contribution_pp < -0.3) return "border-blue-900/40 bg-blue-950/20 text-blue-300";
  return "border-emerald-900/30 bg-emerald-950/10 text-emerald-300";
}

function freshnessName(item: DataFreshnessItem) {
  const labels: Record<string, string> = {
    pitcher: "투수 기록",
    batter: "타자 기록",
    standings: "팀 순위",
    lineup: "확정 타순",
    weather: "날씨",
    prediction: "예측",
  };
  return labels[item.key] ?? item.label;
}

function freshnessStatus(item: DataFreshnessItem) {
  if (item.is_stale) return { label: "갱신 주의", tone: "text-orange-300 bg-orange-950/40 border-orange-900/40" };
  if (item.note) return { label: item.note, tone: "text-slate-400 bg-slate-900/40 border-slate-700/60" };
  if (!item.updated_at && item.key !== "weather") return { label: "대기", tone: "text-slate-400 bg-slate-900/40 border-slate-700/60" };
  return { label: "반영", tone: "text-emerald-300 bg-emerald-950/20 border-emerald-900/30" };
}

function DataStatusCard({
  freshness,
  prediction,
}: {
  freshness: DataFreshnessItem[];
  prediction: PredictionInGame | null;
}) {
  if (!freshness.length && !prediction) return null;

  const ready = freshness.filter((item) => !item.is_stale && !item.note && (item.updated_at || item.key === "weather"));
  const waiting = freshness.filter((item) => item.is_stale || item.note || (!item.updated_at && item.key !== "weather"));
  const predictionFreshness = freshness.find((item) => item.key === "prediction");
  const lastUpdated = prediction?.generated_at ?? predictionFreshness?.updated_at ?? null;

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-200">데이터 상태</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            예측에 반영된 데이터와 아직 대기 중인 데이터를 구분해서 보여줍니다.
          </p>
        </div>
        <div className="shrink-0 rounded-xl bg-slate-900/50 px-3 py-2 text-right">
          <p className="text-[10px] font-bold text-slate-500">마지막 예측</p>
          <p className="text-xs font-black text-slate-200">
            {lastUpdated ? formatRunTime(lastUpdated) : "-"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-emerald-950/10 p-3">
          <p className="font-black text-emerald-300">반영 완료</p>
          <p className="mt-1 leading-relaxed text-slate-400">
            {ready.length ? ready.map(freshnessName).join(" · ") : "-"}
          </p>
        </div>
        <div className="rounded-xl bg-slate-900/30 p-3">
          <p className="font-black text-slate-300">대기/주의</p>
          <p className="mt-1 leading-relaxed text-slate-500">
            {waiting.length ? waiting.map(freshnessName).join(" · ") : "없음"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {freshness.map((item) => {
          const status = freshnessStatus(item);
          return (
            <div key={item.key} className={`rounded-xl border px-3 py-2.5 ${status.tone}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black">{freshnessName(item)}</span>
                <span className="text-[10px] font-bold">{status.label}</span>
              </div>
              <p className="mt-1 text-[11px] opacity-75">
                {item.updated_at ? fmtUpdatedAt(item.updated_at) : item.key === "lineup" ? "발표 전" : "-"}
              </p>
            </div>
          );
        })}
      </div>

      {freshness.some((item) => item.key === "lineup" && !item.updated_at) && (
        <p className="mt-3 rounded-xl border border-yellow-900/40 bg-yellow-950/20 px-3 py-2 text-xs leading-relaxed text-yellow-200/80">
          확정 타순은 원천 데이터가 공개되어야 반영됩니다. 발표 전에는 공격력 탭의 최근 타격 흐름과 상대 선발 공략 지표를 우선 참고하세요.
        </p>
      )}
    </section>
  );
}

function PredictionTrustSummary({
  freshness,
  prediction,
  isFinished,
}: {
  freshness: DataFreshnessItem[];
  prediction: PredictionInGame | null;
  isFinished: boolean;
}) {
  if (!prediction) return null;

  const completeness = prediction.data_completeness ?? 0;
  const availableFactors = prediction.factor_contributions.filter((factor) => factor.available).length;
  const totalFactors = prediction.factor_contributions.length;
  const waitingFeatures = prediction.missing_features.length;
  const staleItems = freshness.filter((item) => item.is_stale).length;
  const predictionType = prediction.prediction_type
    ? (PREDICTION_TYPE_LABEL[prediction.prediction_type] ?? prediction.prediction_type)
    : "기본 예측";
  const generatedAt = prediction.generated_at ? formatRunTime(prediction.generated_at) : "-";

  const level =
    completeness >= 90 && waitingFeatures === 0 && staleItems === 0 ? "높음" :
    completeness >= 70 && staleItems <= 1 ? "보통" :
    "참고용";
  const levelTone =
    level === "높음" ? "border-emerald-900/50 bg-emerald-950/20 text-emerald-300" :
    level === "보통" ? "border-yellow-900/50 bg-yellow-950/20 text-yellow-300" :
    "border-slate-700 bg-slate-900/40 text-slate-300";

  const cards = [
    { label: "예측 생성", value: generatedAt, hint: predictionType },
    {
      label: "데이터 완성도",
      value: prediction.data_completeness != null ? `${prediction.data_completeness.toFixed(0)}%` : "-",
      hint: isFinished ? "경기 전 기준" : "현재 반영 기준",
    },
    {
      label: "반영 지표",
      value: totalFactors ? `${availableFactors}/${totalFactors}` : "-",
      hint: "ELO, 선발, 흐름 등",
    },
    {
      label: "대기 데이터",
      value: waitingFeatures ? `${waitingFeatures}개` : "없음",
      hint: staleItems ? `갱신 주의 ${staleItems}개` : "누락 지표 기준",
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-200">예측 신뢰도</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            이 승률이 어떤 데이터 상태에서 만들어졌는지 먼저 확인할 수 있게 정리했습니다.
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-black ${levelTone}`}>
          {level}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl bg-slate-900/35 px-3 py-3">
            <p className="text-[10px] font-bold text-slate-500">{card.label}</p>
            <p className="mt-1 text-sm font-black text-slate-100">{card.value}</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">{card.hint}</p>
          </div>
        ))}
      </div>

      {waitingFeatures > 0 && (
        <p className="mt-3 rounded-xl border border-yellow-900/40 bg-yellow-950/20 px-3 py-2 text-xs leading-relaxed text-yellow-100/80">
          아직 반영되지 않은 데이터: {prediction.missing_features.join(" · ")}
        </p>
      )}
    </section>
  );
}

function displayTeamName(team: GameResponse["home_team"]) {
  return team.short_name ?? team.name;
}

function buildKeyFactors(prediction: PredictionInGame | null): FactorContribution[] {
  return (prediction?.factor_contributions ?? [])
    .filter((factor) => factor.available && Math.abs(factor.contribution_pp) >= 0.4)
    .sort((a, b) => Math.abs(b.contribution_pp) - Math.abs(a.contribution_pp))
    .slice(0, 3);
}

function keyFactorTeam(game: GameResponse, factor: FactorContribution) {
  return factor.contribution_pp >= 0 ? displayTeamName(game.home_team) : displayTeamName(game.away_team);
}

function keyFactorTone(factor: FactorContribution) {
  return factor.contribution_pp >= 0
    ? "border-red-500/20 bg-red-500/10 text-red-100"
    : "border-blue-500/20 bg-blue-500/10 text-blue-100";
}

function KeyFactorsSection({
  game,
  prediction,
}: {
  game: GameResponse;
  prediction: PredictionInGame | null;
}) {
  const factors = buildKeyFactors(prediction);
  if (!prediction || factors.length === 0) return null;

  return (
    <section className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-black text-indigo-100">승부처 요약</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          현재 예측에 가장 크게 반영된 핵심 변수입니다. 수치가 클수록 해당 팀 쪽으로 승률이 이동했습니다.
        </p>
      </div>
      <div className="grid gap-2">
        {factors.map((factor, index) => {
          const team = keyFactorTeam(game, factor);
          return (
            <div key={factor.key} className={`rounded-xl border px-3 py-3 ${keyFactorTone(factor)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black">
                    {index + 1}. {factor.label}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    {team}에 유리하게 반영된 지표입니다.
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black">{team}</p>
                  <p className="text-xs font-bold opacity-80">{Math.abs(factor.contribution_pp).toFixed(1)}%p</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function predictionSpread(game: GameResponse) {
  if (!game.prediction) return null;
  return Math.abs(game.prediction.home_win_prob - game.prediction.away_win_prob);
}

function otherGameReason(game: GameResponse) {
  if (game.status === "in_progress") return "진행 중인 경기";
  const spread = predictionSpread(game);
  if (spread != null && spread <= 0.03) return `초접전 ${(spread * 100).toFixed(1)}%p`;
  if (spread != null && spread <= 0.07) return `접전 ${(spread * 100).toFixed(1)}%p`;
  if (game.starters?.home && game.starters?.away) return "선발 매치업 확인";
  return "경기 분석 보기";
}

function pickOtherGames(currentGame: GameResponse, games: GameResponse[]) {
  return games
    .filter((game) => game.id !== currentGame.id)
    .sort((a, b) => {
      const liveA = a.status === "in_progress" ? 1 : 0;
      const liveB = b.status === "in_progress" ? 1 : 0;
      if (liveA !== liveB) return liveB - liveA;

      const finalA = a.status === "final" ? 1 : 0;
      const finalB = b.status === "final" ? 1 : 0;
      if (finalA !== finalB) return finalA - finalB;

      const spreadA = predictionSpread(a);
      const spreadB = predictionSpread(b);
      if (spreadA != null && spreadB != null) return spreadA - spreadB;
      if (spreadA != null) return -1;
      if (spreadB != null) return 1;

      return (a.start_time ?? "").localeCompare(b.start_time ?? "");
    })
    .slice(0, 3);
}

function OtherGamesSection({
  currentGame,
  games,
  isLoading,
}: {
  currentGame: GameResponse;
  games: GameResponse[] | undefined;
  isLoading: boolean;
}) {
  const otherGames = games ? pickOtherGames(currentGame, games) : [];

  if (isLoading) {
    return <LoadingCard text="오늘의 다른 경기를 불러오는 중입니다." />;
  }

  if (otherGames.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <div>
        <h2 className="text-sm font-black text-slate-200">오늘의 다른 경기</h2>
        <p className="mt-1 text-xs text-slate-500">현재 경기와 함께 보면 좋은 경기입니다.</p>
      </div>
      <div className="space-y-2">
        {otherGames.map((otherGame) => (
          <GameCard
            key={otherGame.id}
            game={otherGame}
            variant="compact"
            highlightReason={otherGameReason(otherGame)}
          />
        ))}
      </div>
    </section>
  );
}

export default function GameDetailClient({ summary }: { summary: GameResponse }) {
  const [primeGameData, setPrimeGameData] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setPrimeGameData(true), 600);
    return () => window.clearTimeout(timer);
  }, []);

  const shouldLoadGame = primeGameData;

  const { data: fullGame, isLoading: gameLoading } = useSWR<GameResponse>(
    shouldLoadGame ? `${BASE}/games/${summary.id}` : null,
    fetcher,
  );
  const { data: fullPrediction, isLoading: predictionLoading } = useSWR<PredictionInGame>(
    `${BASE}/games/${summary.id}/prediction`,
    fetcher,
  );
  const { data: todayGames, isLoading: todayGamesLoading } = useSWR<GameListResponse>(
    shouldLoadGame ? `${BASE}/games?date=${summary.game_date}` : null,
    fetcher,
  );

  const game = fullGame ?? summary;
  const prediction = fullPrediction ?? summary.prediction;
  const { home_team, away_team, starters, status, home_trend, away_trend, home_lineup, away_lineup } = game;
  const isFinished = status === "final";
  const homeWin = isFinished && (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWin = isFinished && (game.away_score ?? 0) > (game.home_score ?? 0);
  const eloBetter = home_team.elo_rating > away_team.elo_rating ? "home" : "away";
  const awayRoadElo = away_team.away_elo ?? away_team.elo_rating;
  const homeHomeElo = home_team.home_elo ?? home_team.elo_rating;
  const gameAnalysis = buildGameAnalysis(game, prediction);

  // 종료 경기용 예측 적중 여부
  const isDraw = isFinished && (game.home_score ?? 0) === (game.away_score ?? 0);
  const predictedHomeWin = prediction ? prediction.home_win_prob >= prediction.away_win_prob : null;
  const predictedTeamName =
    predictedHomeWin == null ? null
    : predictedHomeWin ? (home_team.short_name ?? home_team.name)
    : (away_team.short_name ?? away_team.name);
  const predictionHit =
    isFinished && !isDraw && predictedHomeWin != null ? predictedHomeWin === homeWin : null;

  const previewContent = (
    <div className="space-y-4">
      {!prediction ? (
        <LoadingCard text="예측 요약을 불러오는 중입니다." />
      ) : (
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-200">{isFinished ? "경기 전 예측" : "데이터 예측"}</h2>
            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] text-slate-600">
              ELO + 선발 + 흐름 + 환경
            </span>
          </div>

          <WinProbBar
            homeProb={prediction.home_win_prob}
            awayProb={prediction.away_win_prob}
            homeTeamName={home_team.short_name ?? home_team.name}
            awayTeamName={away_team.short_name ?? away_team.name}
          />

          {isFinished ? (
            <div className="rounded-xl bg-slate-700/30 p-3 text-xs">
              {isDraw || predictionHit == null ? (
                <p className="text-center text-slate-400">무승부로 종료된 경기입니다.</p>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">예측 결과</span>
                  <span className={`font-black ${predictionHit ? "text-emerald-400" : "text-red-400"}`}>
                    {predictedTeamName} 승 예측 · {predictionHit ? "적중" : "빗나감"}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-700/30 p-3 text-xs">
                <div>
                  <p className="text-slate-500">데이터 완성도</p>
                  <p className="mt-1 font-black text-slate-200">
                    {prediction.data_completeness != null ? `${prediction.data_completeness.toFixed(0)}%` : "계산 중"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500">직전 예측 대비</p>
                  <p className={`mt-1 font-black ${
                    (prediction.change_from_previous_pp ?? 0) > 0 ? "text-red-400" :
                    (prediction.change_from_previous_pp ?? 0) < 0 ? "text-blue-400" :
                    "text-slate-400"
                  }`}>
                    {prediction.change_from_previous_pp != null
                      ? `홈 ${prediction.change_from_previous_pp > 0 ? "+" : ""}${prediction.change_from_previous_pp.toFixed(1)}%p`
                      : "첫 예측"}
                  </p>
                </div>
              </div>

              {prediction.key_factors.length > 0 && (
                <div className="space-y-2 pt-1">
                  {prediction.key_factors.map((factor, index) => (
                    <FactorCard key={`${factor}-${index}`} text={factor} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <PredictionTrustSummary
        freshness={game.data_freshness ?? []}
        prediction={prediction}
        isFinished={isFinished}
      />

      <DataStatusCard freshness={game.data_freshness ?? []} prediction={prediction} />

      {gameAnalysis.length > 0 && (
        <section className="rounded-2xl border border-indigo-900/50 bg-indigo-950/20 p-5">
          <div className="mb-3">
            <h2 className="text-sm font-black text-indigo-200">오늘 경기 핵심 분석</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              수집된 기록을 바탕으로 이 경기에서 먼저 확인할 포인트를 정리했습니다.
            </p>
          </div>
          <ul className="space-y-2">
            {gameAnalysis.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-relaxed text-slate-300">
                <span className="mt-0.5 shrink-0 text-indigo-400">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {prediction && !isFinished && (
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 space-y-5">
          <div>
            <h2 className="text-sm font-black text-slate-200">승부 변화 레이더</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              데이터가 확정될 때마다 홈 승률이 어떻게 움직였는지 보여 줍니다.
            </p>
          </div>

          {prediction.trend.length > 0 ? (
            <div className="space-y-2">
              {prediction.trend.map((item, index) => (
                <div key={`${item.generated_at}-${index}`} className="flex items-center gap-3 rounded-xl bg-slate-700/30 px-3 py-2.5">
                  <div className="w-20 shrink-0 text-[11px] text-slate-500">{formatRunTime(item.generated_at)}</div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-300">
                      {PREDICTION_TYPE_LABEL[item.prediction_type] ?? item.prediction_type}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      완성도 {item.data_completeness != null ? `${item.data_completeness.toFixed(0)}%` : "-"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-red-300">홈 {(item.home_win_prob * 100).toFixed(1)}%</p>
                    <p className={`text-[11px] font-bold ${
                      (item.change_pp ?? 0) > 0 ? "text-red-400" :
                      (item.change_pp ?? 0) < 0 ? "text-blue-400" :
                      "text-slate-600"
                    }`}>
                      {item.change_pp != null ? `${item.change_pp > 0 ? "+" : ""}${item.change_pp.toFixed(1)}%p` : "기준"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">예측 변화 이력을 준비 중입니다.</p>
          )}

          {prediction.factor_contributions.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-bold text-slate-400">요인별 홈 승률 기여도</p>
              <div className="space-y-2">
                {prediction.factor_contributions.map((factor) => (
                  <div key={factor.key} className="flex items-center gap-3 text-xs">
                    <span className={`w-24 shrink-0 ${factor.available ? "text-slate-400" : "text-slate-600"}`}>
                      {factor.label}
                    </span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-700">
                      <div className="absolute left-1/2 top-0 h-full w-px bg-slate-500" />
                      {factor.available && (
                        <div
                          className={`absolute top-0 h-full ${factor.contribution_pp >= 0 ? "bg-red-500/80" : "bg-blue-500/80"}`}
                          style={{
                            left: factor.contribution_pp >= 0 ? "50%" : `${50 - Math.min(50, Math.abs(factor.contribution_pp) * 8)}%`,
                            width: `${Math.min(50, Math.abs(factor.contribution_pp) * 8)}%`,
                          }}
                        />
                      )}
                    </div>
                    <span className={`w-14 text-right font-bold ${
                      !factor.available ? "text-slate-600" :
                      factor.contribution_pp > 0 ? "text-red-400" :
                      factor.contribution_pp < 0 ? "text-blue-400" :
                      "text-slate-500"
                    }`}>
                      {factor.available ? `${factor.contribution_pp > 0 ? "+" : ""}${factor.contribution_pp.toFixed(1)}%p` : "대기"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {prediction.missing_features.length > 0 && (
            <div className="rounded-xl border border-yellow-900/50 bg-yellow-950/20 px-3 py-3">
              <p className="text-xs font-bold text-yellow-500">아직 반영되지 않은 데이터</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {prediction.missing_features.join(" · ")}
              </p>
            </div>
          )}

          <p className="text-[11px] text-slate-600">
            {prediction.model_version ?? "모델 버전 미상"}
            {prediction.generated_at ? ` · ${formatRunTime(prediction.generated_at)} 갱신` : ""}
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <div className="mb-3 grid grid-cols-3 items-center">
          <div className="text-center">
            <p className="font-black text-slate-100">{away_team.short_name ?? away_team.name}</p>
            <p className="text-xs text-slate-500">원정</p>
          </div>
          <p className="text-center text-xs font-bold text-slate-400">팀 비교</p>
          <div className="text-center">
            <p className="font-black text-slate-100">{home_team.short_name ?? home_team.name}</p>
            <p className="text-xs text-slate-500">홈</p>
          </div>
        </div>

        <StatCompareRow
          label="ELO 전력"
          awayVal={away_team.elo_rating.toFixed(0)}
          homeVal={home_team.elo_rating.toFixed(0)}
          awayBetter={eloBetter === "away"}
        />
        <StatCompareRow
          label="원정 ELO"
          awayVal={awayRoadElo.toFixed(0)}
          homeVal="—"
          awayBetter={awayRoadElo > away_team.elo_rating}
        />
        <StatCompareRow
          label="홈 ELO"
          awayVal="—"
          homeVal={homeHomeElo.toFixed(0)}
          awayBetter={false}
        />
        <div className="px-1 pb-2">
          <EloBar home={homeHomeElo} away={awayRoadElo} />
          <p className="mt-1 text-center text-xs text-slate-600">
            홈/원정 ELO 기준 — 차이 {Math.abs(homeHomeElo - awayRoadElo).toFixed(0)}점
          </p>
        </div>

        {home_trend && away_trend ? (
          <>
            <StatCompareRow label="최근 7경기 득실" awayVal={away_trend.run_diff} homeVal={home_trend.run_diff} awayBetter={away_trend.run_diff > home_trend.run_diff} />
            <StatCompareRow label="최근 7경기 득점" awayVal={away_trend.avg_runs_for.toFixed(1)} homeVal={home_trend.avg_runs_for.toFixed(1)} awayBetter={away_trend.avg_runs_for > home_trend.avg_runs_for} />
            <StatCompareRow label="최근 7경기 실점" awayVal={away_trend.avg_runs_against.toFixed(1)} homeVal={home_trend.avg_runs_against.toFixed(1)} awayBetter={away_trend.avg_runs_against < home_trend.avg_runs_against} />
          </>
        ) : (
          <div className="py-3 text-center text-xs text-slate-500">최근 흐름 상세 데이터 로딩 중</div>
        )}
      </div>
    </div>
  );

  const lineupContent = (
    <div className="space-y-4">
      {(away_lineup || home_lineup) ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
          <div className="mb-4">
            <h2 className="text-sm font-black text-slate-200">예상/확정 타순</h2>
            <p className="mt-1 text-xs text-slate-500">타순이 발표되면 라인업 강도와 대체 선수 영향까지 함께 표시합니다.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { team: away_team, lineup: away_lineup, side: "원정" },
              { team: home_team, lineup: home_lineup, side: "홈" },
            ].map(({ team, lineup, side }) => (
              <div key={side} className="rounded-xl border border-slate-700/50 bg-slate-700/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-slate-100">{team.short_name ?? team.name}</h3>
                    <p className="text-xs text-slate-500">{side}</p>
                  </div>
                  {lineup?.is_confirmed ? (
                    <span className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400">확정</span>
                  ) : (
                    <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-bold text-slate-500">미발표</span>
                  )}
                </div>

                {lineup?.strength_available && (
                  <div className="mb-3 rounded-lg bg-slate-800/70 px-3 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">라인업 강도 <span className="text-slate-600">(예상 주전 대비)</span></span>
                      <span className={`font-black ${
                        lineup.strength_ratio != null && lineup.strength_ratio >= 1
                          ? "text-emerald-400"
                          : lineup.strength_ratio != null && lineup.strength_ratio < 0.95
                            ? "text-orange-400"
                            : "text-slate-200"
                      }`}>
                        {lineup.strength_ratio != null ? `${(lineup.strength_ratio * 100).toFixed(0)}%` : "-"}
                      </span>
                    </div>
                    {(lineup.excluded_regulars.length > 0 || lineup.replacements.length > 0) && (
                      <div className="mt-2 space-y-1 border-t border-slate-700/50 pt-2 text-[11px]">
                        {lineup.excluded_regulars.length > 0 && (
                          <p className="text-slate-500">
                            <span className="font-bold text-orange-400/80">빠진 주전</span>{" "}
                            {lineup.excluded_regulars.map((p) => p.ops != null ? `${p.name}(OPS ${p.ops.toFixed(3)})` : p.name).join(", ")}
                          </p>
                        )}
                        {lineup.replacements.length > 0 && (
                          <p className="text-slate-500">
                            <span className="font-bold text-slate-400">대체 투입</span>{" "}
                            {lineup.replacements.map((p) => p.ops != null ? `${p.name}(OPS ${p.ops.toFixed(3)})` : p.name).join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {lineup?.players?.length ? (
                  <div className="space-y-2">
                    {lineup.players.map((player) => (
                      <div key={`${side}-${player.bat_order}-${player.name}`} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className="w-5 text-xs font-black text-indigo-300">{player.bat_order}</span>
                          <div>
                            <p className="text-sm font-bold text-slate-100">{player.name}</p>
                            <p className="text-[11px] text-slate-500">{player.position ?? "-"}</p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-slate-400">
                          OPS {player.ops != null ? player.ops.toFixed(3) : "-"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">아직 발표된 타순이 없습니다.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : gameLoading ? (
        <LoadingCard text="타순 데이터를 불러오는 중입니다." />
      ) : (
        <div className="rounded-2xl border border-slate-700 p-10 text-center text-slate-500" style={{ background: "#111827" }}>
          타순이 아직 발표되지 않았습니다.
        </div>
      )}
    </div>
  );

  const offenseContent = (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-200">공격 흐름 비교</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              확정 타순이 없어도 최근 득점력과 OPS 흐름으로 양 팀 공격 컨디션을 먼저 비교합니다.
            </p>
          </div>
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            최근 7경기
          </span>
        </div>

        <div className="mb-4 grid grid-cols-3 items-center">
          <div className="text-center">
            <p className="font-black text-blue-100">{away_team.short_name ?? away_team.name}</p>
            <p className="text-xs text-slate-500">원정</p>
          </div>
          <p className="text-center text-xs font-bold text-slate-500">공격 지표</p>
          <div className="text-center">
            <p className="font-black text-red-100">{home_team.short_name ?? home_team.name}</p>
            <p className="text-xs text-slate-500">홈</p>
          </div>
        </div>

        {home_trend && away_trend ? (
          <div className="space-y-2">
            <TrendMetric
              label="최근 성적"
              away={trendRecord(away_trend)}
              home={trendRecord(home_trend)}
              awayBetter={away_trend.wins > home_trend.wins}
            />
            <TrendMetric
              label="평균 득점"
              away={away_trend.avg_runs_for.toFixed(1)}
              home={home_trend.avg_runs_for.toFixed(1)}
              awayBetter={away_trend.avg_runs_for > home_trend.avg_runs_for}
            />
            <TrendMetric
              label="평균 OPS"
              away={formatOps(away_trend.avg_ops)}
              home={formatOps(home_trend.avg_ops)}
              awayBetter={(away_trend.avg_ops ?? 0) > (home_trend.avg_ops ?? 0)}
            />
            <TrendMetric
              label="평균 안타"
              away={formatOneDecimal(away_trend.avg_hits)}
              home={formatOneDecimal(home_trend.avg_hits)}
              awayBetter={(away_trend.avg_hits ?? 0) > (home_trend.avg_hits ?? 0)}
            />
            <TrendMetric
              label="평균 홈런"
              away={formatOneDecimal(away_trend.avg_home_runs)}
              home={formatOneDecimal(home_trend.avg_home_runs)}
              awayBetter={(away_trend.avg_home_runs ?? 0) > (home_trend.avg_home_runs ?? 0)}
            />
            <TrendMetric
              label="볼넷/삼진"
              away={away_trend.walk_strikeout_ratio != null ? away_trend.walk_strikeout_ratio.toFixed(2) : "-"}
              home={home_trend.walk_strikeout_ratio != null ? home_trend.walk_strikeout_ratio.toFixed(2) : "-"}
              awayBetter={(away_trend.walk_strikeout_ratio ?? 0) > (home_trend.walk_strikeout_ratio ?? 0)}
            />
            <TrendMetric
              label="득실 마진"
              away={away_trend.run_diff > 0 ? `+${away_trend.run_diff}` : away_trend.run_diff}
              home={home_trend.run_diff > 0 ? `+${home_trend.run_diff}` : home_trend.run_diff}
              awayBetter={away_trend.run_diff > home_trend.run_diff}
            />
            <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-900/25 p-3">
                <p className="text-xs font-bold text-blue-300">{away_team.short_name ?? away_team.name} 세부 흐름</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  경기당 볼넷 {formatOneDecimal(away_trend.avg_walks)}개, 삼진 {formatOneDecimal(away_trend.avg_strikeouts)}개
                  {away_trend.stat_games ? ` · 표본 ${away_trend.stat_games}경기` : ""}
                </p>
              </div>
              <div className="rounded-xl bg-slate-900/25 p-3">
                <p className="text-xs font-bold text-red-300">{home_team.short_name ?? home_team.name} 세부 흐름</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  경기당 볼넷 {formatOneDecimal(home_trend.avg_walks)}개, 삼진 {formatOneDecimal(home_trend.avg_strikeouts)}개
                  {home_trend.stat_games ? ` · 표본 ${home_trend.stat_games}경기` : ""}
                </p>
              </div>
            </div>
          </div>
        ) : gameLoading ? (
          <LoadingCard text="최근 공격 흐름을 불러오는 중입니다." />
        ) : (
          <p className="rounded-xl bg-slate-900/30 p-4 text-sm text-slate-500">
            최근 공격 흐름 데이터가 아직 준비되지 않았습니다.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-black text-slate-200">상대 선발 공략 포인트</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            타순 발표 전에는 상대 선발의 최근 컨디션과 출루/장타 허용 리스크가 가장 실용적인 공격 지표입니다.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-blue-900/30 bg-blue-950/20 p-4">
            <p className="text-xs font-bold text-blue-300">{away_team.short_name ?? away_team.name} 공격</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {starterAttackNote(starters?.home, away_team.short_name ?? away_team.name)}
            </p>
          </div>
          <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4">
            <p className="text-xs font-bold text-red-300">{home_team.short_name ?? home_team.name} 공격</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {starterAttackNote(starters?.away, home_team.short_name ?? home_team.name)}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-200">확정 타순</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              네이버 스포츠에 확정 타순이 공개되면 1-9번과 라인업 강도를 자동으로 표시합니다.
            </p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            home_lineup?.players?.length || away_lineup?.players?.length
              ? "bg-emerald-900/40 text-emerald-400"
              : "bg-slate-700 text-slate-500"
          }`}>
            {home_lineup?.players?.length || away_lineup?.players?.length ? "반영됨" : "발표 대기"}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LineupTeamCard
            teamName={away_team.short_name ?? away_team.name}
            side="원정"
            lineup={away_lineup}
          />
          <LineupTeamCard
            teamName={home_team.short_name ?? home_team.name}
            side="홈"
            lineup={home_lineup}
          />
        </div>
      </section>
    </div>
  );

  const starterMatchup = (() => {
    const away = starters?.away;
    const home = starters?.home;
    const rows: { label: string; awayVal: string; homeVal: string; awayBetter: boolean | undefined }[] = [];
    if (!away || !home) return { rows, summary: null as string | null };
    // tie: 이 값 미만의 차이는 노이즈로 보고 우열을 가리지 않음 (박빙 처리)
    const specs: { label: string; a: number | null; h: number | null; lower: boolean; digits: number; tie: number }[] = [
      { label: "ERA", a: away.era, h: home.era, lower: true, digits: 2, tie: 0.3 },
      { label: "WHIP", a: away.whip, h: home.whip, lower: true, digits: 2, tie: 0.05 },
      { label: "K/9", a: away.k_per_9, h: home.k_per_9, lower: false, digits: 1, tie: 0.5 },
      { label: "BB/9", a: away.bb_per_9, h: home.bb_per_9, lower: true, digits: 1, tie: 0.3 },
      { label: "HR/9", a: away.hr_per_9, h: home.hr_per_9, lower: true, digits: 1, tie: 0.2 },
    ];
    let awayWins = 0;
    let homeWins = 0;
    for (const s of specs) {
      if (s.a == null || s.h == null) continue;
      const awayBetter =
        Math.abs(s.a - s.h) < s.tie ? undefined : s.lower ? s.a < s.h : s.a > s.h;
      if (awayBetter === true) awayWins += 1;
      else if (awayBetter === false) homeWins += 1;
      rows.push({ label: s.label, awayVal: s.a.toFixed(s.digits), homeVal: s.h.toFixed(s.digits), awayBetter });
    }
    const summary =
      rows.length === 0 ? null
      : awayWins > homeWins ? `원정 선발이 ${awayWins}개 지표 우위`
      : homeWins > awayWins ? `홈 선발이 ${homeWins}개 지표 우위`
      : awayWins === 0 ? "전 지표 박빙"
      : `${awayWins} : ${homeWins} 호각`;
    return { rows, summary };
  })();

  const pitchersContent = (
    <div className="space-y-4">
      {starters ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
          <div className="mb-4">
            <h2 className="text-sm font-black text-slate-200">선발 투수 비교</h2>
            <p className="mt-1 text-xs text-slate-500">시즌 기록과 최근 선발 흐름을 함께 봅니다.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { starter: starters.away, side: "원정", color: "text-blue-400", borderColor: "border-blue-800/30" },
              { starter: starters.home, side: "홈", color: "text-red-400", borderColor: "border-red-800/30" },
            ].map(({ starter, side, color, borderColor }) => (
              <div key={side} className={`rounded-xl border ${borderColor} bg-slate-700/30 p-4`}>
                <div className="mb-3">
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-base font-black text-slate-100">{starter?.name ?? "미정"}</p>
                      {starter && !starter.is_confirmed && (
                        <span className="rounded bg-slate-600/50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                          예상
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">{side}</span>
                  </div>
                  <div className="mt-2 flex gap-3">
                    <div className="text-center">
                      <p className={`text-xl font-black ${color}`}>{starter?.era?.toFixed(2) ?? "-"}</p>
                      <p className="text-[10px] text-slate-500">ERA</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-black text-slate-300">{starter?.whip?.toFixed(2) ?? "-"}</p>
                      <p className="text-[10px] text-slate-500">WHIP</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-black text-slate-300">{starter?.k_bb_ratio?.toFixed(1) ?? "-"}</p>
                      <p className="text-[10px] text-slate-500">K/BB</p>
                    </div>
                  </div>
                </div>

                {starter && (starter.wins != null || starter.losses != null || starter.games != null || starter.innings_pitched != null) && (
                  <div className="mb-3 space-y-1 border-t border-slate-700/40 pt-3">
                    <p className="text-xs font-semibold text-slate-400">
                      {[
                        (starter.wins != null || starter.losses != null) ? `${starter.wins ?? 0}승 ${starter.losses ?? 0}패` : null,
                        starter.games != null ? `${starter.games}등판` : null,
                        starter.innings_pitched != null ? fmtIP(starter.innings_pitched) : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                    {(starter.k_per_9 != null || starter.bb_per_9 != null || starter.hr_per_9 != null) && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                        {starter.k_per_9 != null && <span>K/9 <b className="font-bold text-slate-300">{starter.k_per_9.toFixed(1)}</b></span>}
                        {starter.bb_per_9 != null && <span>BB/9 <b className="font-bold text-slate-300">{starter.bb_per_9.toFixed(1)}</b></span>}
                        {starter.hr_per_9 != null && <span>HR/9 <b className="font-bold text-slate-300">{starter.hr_per_9.toFixed(1)}</b></span>}
                      </div>
                    )}
                  </div>
                )}

                {starter?.recent_summary && (
                  <div className="rounded-lg bg-slate-800/60 px-3 py-2 text-xs text-slate-400">
                    최근 {starter.recent_summary.games}경기 평균 {fmtIP(starter.recent_summary.avg_innings)}
                  </div>
                )}

                {starter?.recent_games?.length ? (
                  <div className="mt-3 space-y-1.5 border-t border-slate-700/50 pt-3">
                    {starter.recent_games.map((recent) => (
                      <div
                        key={`${starter.id}-${recent.game_date}`}
                        className="grid gap-1 text-xs"
                        style={{ gridTemplateColumns: "3rem 1fr auto" }}
                      >
                        <span className="tabular-nums text-slate-600">
                          {recent.game_date.slice(5).replace("-", ".")}
                        </span>
                        <span className="truncate text-slate-400">vs {recent.opponent_name}</span>
                        <span className={`tabular-nums text-right font-bold ${color}`}>{fmtIP(recent.innings_pitched)}</span>
                        <span />
                        <span className="col-span-2 text-[11px] text-slate-600">
                          {recent.earned_runs}자책 {recent.strikeouts}K
                          {recent.hits != null ? ` ${recent.hits}H` : ""}
                          {recent.walks != null ? ` ${recent.walks}BB` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {starterMatchup.rows.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
              <div className="mb-1 grid grid-cols-3 items-center">
                <p className="truncate text-right text-sm font-black text-blue-400">{starters.away?.name}</p>
                <p className="text-center text-[11px] font-bold text-slate-500">선발 맞대결</p>
                <p className="truncate text-left text-sm font-black text-red-400">{starters.home?.name}</p>
              </div>
              {starterMatchup.rows.map((row) => (
                <StatCompareRow
                  key={row.label}
                  label={row.label}
                  awayVal={row.awayVal}
                  homeVal={row.homeVal}
                  awayBetter={row.awayBetter}
                />
              ))}
              {starterMatchup.summary && (
                <p className="mt-2 border-t border-slate-700/40 pt-2 text-center text-xs">
                  <span className="text-slate-500">종합 · </span>
                  <span className="font-bold text-slate-300">{starterMatchup.summary}</span>
                </p>
              )}
              <p className="mt-1 text-center text-[10px] text-slate-600">ERA·WHIP·BB/9·HR/9는 낮을수록, K/9는 높을수록 유리</p>
            </div>
          )}

          {(starters.home?.is_confirmed === false || starters.away?.is_confirmed === false) && (
            <p className="mt-3 text-[11px] text-slate-500">
              <span className="font-bold text-slate-400">예상</span> 표시는 예고 선발 미발표로, 팀 시즌 주력 투수를 대신 보여 줍니다.
            </p>
          )}
        </div>
      ) : (
        <LoadingCard text="선발 상세 데이터를 불러오는 중입니다." />
      )}
    </div>
  );

  const analysisContent = (
    <div className="space-y-4">
      {prediction ? (
        <>
          <KeyFactorsSection game={game} prediction={prediction} />

          <section className="rounded-2xl border border-indigo-900/50 bg-indigo-950/20 p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-indigo-200">예측 요약</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">
                  {predictionSummary(game, prediction)}
                </p>
              </div>
              <div className="shrink-0 rounded-xl bg-slate-950/40 px-3 py-2 text-right">
                <p className="text-[10px] font-bold text-slate-500">데이터 완성도</p>
                <p className="text-lg font-black text-indigo-200">
                  {prediction.data_completeness != null ? `${prediction.data_completeness.toFixed(0)}%` : "-"}
                </p>
              </div>
            </div>

            <WinProbBar
              homeProb={prediction.home_win_prob}
              awayProb={prediction.away_win_prob}
              homeTeamName={home_team.short_name ?? home_team.name}
              awayTeamName={away_team.short_name ?? away_team.name}
            />

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {prediction.factor_contributions.map((factor) => (
                <div
                  key={factor.key}
                  className={`rounded-xl border px-3 py-2.5 ${factorStatusTone(factor)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black">{factorStatusLabel(factor.key)}</span>
                    <span className="text-[10px] font-bold">
                      {factor.available ? "반영됨" : "대기"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs opacity-80">
                    {factor.available
                      ? `${factor.contribution_pp > 0 ? "홈 +" : factor.contribution_pp < 0 ? "원정 +" : "영향 "}${Math.abs(factor.contribution_pp).toFixed(1)}%p`
                      : "아직 승률에 반영되지 않았습니다"}
                  </p>
                </div>
              ))}
            </div>

            {prediction.missing_features.length > 0 && (
              <div className="mt-4 rounded-xl border border-yellow-900/50 bg-yellow-950/20 px-3 py-3">
                <p className="text-xs font-bold text-yellow-400">아직 대기 중인 데이터</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {prediction.missing_features.join(" · ")}
                </p>
              </div>
            )}
          </section>

          {prediction.trend.length > 0 && (
            <section className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
              <div className="mb-4">
                <h2 className="text-sm font-black text-slate-200">승률 변화 타임라인</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  선발, 타순, 날씨처럼 데이터가 추가될 때 홈 승률이 어떻게 움직였는지 보여줍니다.
                </p>
              </div>
              <div className="space-y-2">
                {prediction.trend.map((item, index) => (
                  <div key={`${item.generated_at}-${index}`} className="flex items-center gap-3 rounded-xl bg-slate-900/30 px-3 py-2.5">
                    <div className="w-20 shrink-0 text-[11px] text-slate-500">{formatRunTime(item.generated_at)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-300">
                        {PREDICTION_TYPE_LABEL[item.prediction_type] ?? item.prediction_type}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        완성도 {item.data_completeness != null ? `${item.data_completeness.toFixed(0)}%` : "-"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-red-300">홈 {(item.home_win_prob * 100).toFixed(1)}%</p>
                      <p className={`text-[11px] font-bold ${
                        (item.change_pp ?? 0) > 0 ? "text-red-400" :
                        (item.change_pp ?? 0) < 0 ? "text-blue-400" :
                        "text-slate-600"
                      }`}>
                        {item.change_pp != null ? `${item.change_pp > 0 ? "+" : ""}${item.change_pp.toFixed(1)}%p` : "기준"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(prediction.park || prediction.weather || prediction.bullpen_home || prediction.bullpen_away) && (
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 space-y-5">
              <h2 className="text-sm font-black text-slate-200">경기 환경</h2>

              {prediction.park && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-slate-400">구장 파크팩터</p>
                      <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">참고 · 승률 미반영</span>
                    </div>
                    <span className={`text-sm font-black ${
                      prediction.park.factor > 1.03 ? "text-orange-400" :
                      prediction.park.factor < 0.97 ? "text-cyan-400" :
                      "text-slate-300"
                    }`}>
                      {prediction.park.factor.toFixed(2)}
                      <span className="ml-1 text-xs font-normal text-slate-500">
                        {prediction.park.factor > 1.03 ? "타자 친화" :
                         prediction.park.factor < 0.97 ? "투수 친화" :
                         "중립"}
                      </span>
                    </span>
                  </div>
                  <ParkFactorBar factor={prediction.park.factor} />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-600">
                    <span>투수 유리 ← 0.85</span>
                    <span>1.00</span>
                    <span>1.15 → 타자 유리</span>
                  </div>
                  {prediction.park.notes && (
                    <p className="mt-2 rounded-lg bg-slate-700/30 px-3 py-2 text-xs text-slate-500">
                      {prediction.park.notes}
                    </p>
                  )}
                </div>
              )}

              {prediction.weather && (
                <div className={`rounded-xl p-4 ${
                  prediction.weather.rain_risk ? "border border-yellow-800/40 bg-yellow-950/40" : "bg-slate-700/30"
                }`}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-base">{prediction.weather.rain_risk ? "🌧️" : "🌤️"}</span>
                    <p className="text-sm font-bold text-slate-200">{prediction.weather.description}</p>
                  </div>
                  {prediction.weather.temperature != null && (
                    <p className="text-xs text-slate-500">{prediction.weather.temperature}°C</p>
                  )}
                </div>
              )}

              <BullpenUsageSection
                awayTeamName={away_team.short_name ?? away_team.name}
                homeTeamName={home_team.short_name ?? home_team.name}
                bullpenAway={prediction.bullpen_away}
                bullpenHome={prediction.bullpen_home}
              />
            </div>
          )}

          {game.data_freshness?.length ? (
            <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h2 className="mb-3 text-sm font-black text-slate-200">데이터 기준 시각</h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {game.data_freshness.map((item) => (
                  <div key={item.key} className="rounded-xl px-3 py-2.5" style={{ background: "#0d1421" }}>
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">{item.label}</span>
                      {item.is_stale ? (
                        <span className="rounded-full bg-orange-900/40 px-1.5 py-0.5 text-[9px] font-bold text-orange-400">갱신 지연</span>
                      ) : item.note ? (
                        <span className="rounded-full bg-slate-700/50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{item.note}</span>
                      ) : (
                        <span className="rounded-full bg-emerald-900/30 px-1.5 py-0.5 text-[9px] font-bold text-emerald-500">최신</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {item.updated_at ? fmtUpdatedAt(item.updated_at) : "—"}
                    </p>
                    <p className="text-[10px] text-slate-600">{item.source}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : predictionLoading ? (
            <LoadingCard text="예측 분석 데이터를 불러오는 중입니다." />
          ) : null}
        </>
      ) : (
        <LoadingCard text="예측 분석 데이터를 불러오는 중입니다." />
      )}
      <p className="pb-2 text-center text-xs text-slate-600">
        예측은 확보된 데이터를 기준으로 계산하며, 참고용입니다.
      </p>
    </div>
  );

  const matchupContent = (
    <div className="space-y-4">
      {pitchersContent}
      {lineupContent}
      {offenseContent}
    </div>
  );

  const predictionChangeContent = (
    <div className="space-y-4">
      {prediction ? (
        <>
          <section className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
            <div className="mb-4">
              <h2 className="text-sm font-black text-slate-200">승률 변화 타임라인</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                선발, 타순, 날씨처럼 데이터가 추가될 때 홈 승률이 어떻게 움직였는지 보여줍니다.
              </p>
            </div>
            {prediction.trend.length > 0 ? (
              <div className="space-y-2">
                {prediction.trend.map((item, index) => (
                  <div key={`${item.generated_at}-${index}`} className="flex items-center gap-3 rounded-xl bg-slate-900/30 px-3 py-2.5">
                    <div className="w-20 shrink-0 text-[11px] text-slate-500">{formatRunTime(item.generated_at)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-300">
                        {PREDICTION_TYPE_LABEL[item.prediction_type] ?? item.prediction_type}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        완성도 {item.data_completeness != null ? `${item.data_completeness.toFixed(0)}%` : "-"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-red-300">홈 {(item.home_win_prob * 100).toFixed(1)}%</p>
                      <p className={`text-[11px] font-bold ${
                        (item.change_pp ?? 0) > 0 ? "text-red-400" :
                        (item.change_pp ?? 0) < 0 ? "text-blue-400" :
                        "text-slate-600"
                      }`}>
                        {item.change_pp != null ? `${item.change_pp > 0 ? "+" : ""}${item.change_pp.toFixed(1)}%p` : "기준"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-900/30 px-3 py-4 text-center text-xs text-slate-500">
                예측 변화 이력을 준비 중입니다.
              </p>
            )}
          </section>

          {(prediction.park || prediction.weather || prediction.bullpen_home || prediction.bullpen_away) && (
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 space-y-5">
              <h2 className="text-sm font-black text-slate-200">경기 환경</h2>

              {prediction.park && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-slate-400">구장 파크팩터</p>
                      <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">참고 · 승률 미반영</span>
                    </div>
                    <span className={`text-sm font-black ${
                      prediction.park.factor > 1.03 ? "text-orange-400" :
                      prediction.park.factor < 0.97 ? "text-cyan-400" :
                      "text-slate-300"
                    }`}>
                      {prediction.park.factor.toFixed(2)}
                      <span className="ml-1 text-xs font-normal text-slate-500">
                        {prediction.park.factor > 1.03 ? "타자 친화" :
                         prediction.park.factor < 0.97 ? "투수 친화" :
                         "중립"}
                      </span>
                    </span>
                  </div>
                  <ParkFactorBar factor={prediction.park.factor} />
                </div>
              )}

              {prediction.weather && (
                <div className={`rounded-xl p-4 ${
                  prediction.weather.rain_risk ? "border border-yellow-800/40 bg-yellow-950/40" : "bg-slate-700/30"
                }`}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-base">{prediction.weather.rain_risk ? "🌧️" : "🌤️"}</span>
                    <p className="text-sm font-bold text-slate-200">{prediction.weather.description}</p>
                  </div>
                  {prediction.weather.temperature != null && (
                    <p className="text-xs text-slate-500">{prediction.weather.temperature}°C</p>
                  )}
                </div>
              )}

              <BullpenUsageSection
                awayTeamName={away_team.short_name ?? away_team.name}
                homeTeamName={home_team.short_name ?? home_team.name}
                bullpenAway={prediction.bullpen_away}
                bullpenHome={prediction.bullpen_home}
              />
            </div>
          )}

          {game.data_freshness?.length ? (
            <DataStatusCard freshness={game.data_freshness} prediction={prediction} />
          ) : predictionLoading ? (
            <LoadingCard text="예측 변화 데이터를 불러오는 중입니다." />
          ) : null}
        </>
      ) : (
        <LoadingCard text="예측 변화 데이터를 불러오는 중입니다." />
      )}
    </div>
  );

  const gameHeader = (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between text-xs text-slate-500">
        <span>{game.stadium ?? "-"}</span>
        <div className="flex items-center gap-2">
          <span>{game.start_time?.slice(0, 5)}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            isFinished ? "bg-slate-700 text-slate-400" :
            status === "in_progress" ? "bg-emerald-900 text-emerald-400" :
            "bg-blue-900 text-blue-300"
          }`}>
            {isFinished ? "종료" : status === "in_progress" ? "진행중" : "예정"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className={`text-xl font-black sm:text-3xl ${awayWin ? "text-white" : isFinished ? "text-slate-500" : "text-slate-100"}`}>
            {away_team.short_name ?? away_team.name}
          </span>
          <span className="mt-1 text-xs text-slate-500">원정</span>
          <div className="mt-2"><RecentFormBadges form={away_team.recent_form} /></div>
        </div>
        <div className="flex flex-col items-center px-1 sm:px-4">
          {isFinished ? (
            <div className="flex items-center gap-1 sm:gap-3">
              <span className={`tabular-nums text-3xl font-black sm:text-4xl ${awayWin ? "text-white" : "text-slate-500"}`}>{game.away_score}</span>
              <span className="text-xl text-slate-600 sm:text-2xl">:</span>
              <span className={`tabular-nums text-3xl font-black sm:text-4xl ${homeWin ? "text-white" : "text-slate-500"}`}>{game.home_score}</span>
            </div>
          ) : (
            <span className="text-2xl font-bold text-slate-600">VS</span>
          )}
          <span className="mt-1 text-xs text-slate-600">{game.game_date}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className={`text-xl font-black sm:text-3xl ${homeWin ? "text-white" : isFinished ? "text-slate-500" : "text-slate-100"}`}>
            {home_team.short_name ?? home_team.name}
          </span>
          <span className="mt-1 text-xs text-slate-500">홈</span>
          <div className="mt-2"><RecentFormBadges form={home_team.recent_form} /></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {gameHeader}
      <GameDetailTabs
        game={game}
        prediction={prediction}
        previewContent={previewContent}
        lineupContent={matchupContent}
        pitchersContent={analysisContent}
        analysisContent={predictionChangeContent}
      />
      <OtherGamesSection
        currentGame={game}
        games={todayGames?.games}
        isLoading={todayGamesLoading}
      />
    </div>
  );
}
