"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import GameDetailTabs from "@/components/GameDetailTabs";
import RecentFormBadges from "@/components/RecentFormBadges";
import WinProbBar from "@/components/WinProbBar";
import type { GameResponse, PredictionInGame } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8002/v1";

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
  const isPositive = /홈팀 우위|홈 우위|홈 최근|파크팩터/.test(text);
  const isNegative = /원정 우위|소진|경고/.test(text);
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${
      isPositive ? "border-blue-800/40 bg-blue-950/30" :
      isNegative ? "border-red-800/40 bg-red-950/30" :
      "border-slate-600/40 bg-slate-700/30"
    }`}>
      <span className={`mt-0.5 shrink-0 text-base ${
        isPositive ? "text-blue-400" : isNegative ? "text-red-400" : "text-slate-400"
      }`}>
        {isPositive ? "▲" : isNegative ? "▼" : "•"}
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

  const previewContent = (
    <div className="space-y-4">
      {prediction && !isFinished ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-200">데이터 예측</h2>
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
        </div>
      ) : (
        <LoadingCard text="예측 요약을 불러오는 중입니다." />
      )}

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

      <BullpenUsageSection
        awayTeamName={away_team.short_name ?? away_team.name}
        homeTeamName={home_team.short_name ?? home_team.name}
        bullpenAway={prediction?.bullpen_away ?? null}
        bullpenHome={prediction?.bullpen_home ?? null}
      />
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
                      <span className="text-slate-500">라인업 강도</span>
                      <span className="font-black text-slate-200">
                        {lineup.strength_ratio != null ? `${(lineup.strength_ratio * 100).toFixed(0)}%` : "-"}
                      </span>
                    </div>
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
                    <p className="text-base font-black text-slate-100">{starter?.name ?? "미정"}</p>
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
          {(prediction.park || prediction.weather || prediction.bullpen_home || prediction.bullpen_away) && (
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 space-y-5">
              <h2 className="text-sm font-black text-slate-200">경기 환경</h2>

              {prediction.park && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-400">구장 파크팩터</p>
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
        lineupContent={lineupContent}
        pitchersContent={pitchersContent}
        analysisContent={analysisContent}
      />
    </div>
  );
}
