import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { ApiError, getGame, getGamePrediction } from "@/lib/api";
import WinProbBar from "@/components/WinProbBar";
import RecentFormBadges from "@/components/RecentFormBadges";
import StarterCard from "@/components/StarterCard";
import GameDetailTabs from "@/components/GameDetailTabs";
import type { GameResponse, PredictionInGame } from "@/lib/types";

interface Props {
  params: { id: string };
}

const getCachedGame = cache(async (id: number) => getGame(id));

async function loadGameOrNull(id: number) {
  try {
    return await getCachedGame(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function loadPredictionOrNull(id: number) {
  try {
    return await getGamePrediction(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = await loadGameOrNull(Number(params.id));
  if (!game) return { title: "경기 상세" };
  const away = game.away_team.short_name ?? game.away_team.name;
  const home = game.home_team.short_name ?? game.home_team.name;
  const status = game.status === "final"
    ? `${game.away_score}:${game.home_score} 종료`
    : `${game.start_time?.slice(0,5)} 예정`;
  const title = `${away} vs ${home} — ${game.game_date} KBO`;
  const desc = `${away} vs ${home} (${status}) 경기 예측·분석. ELO 레이팅, 선발투수, 타순 강도까지 데이터 기반 분석.`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc },
  };
}

function EloBar({ home, away }: { home: number; away: number }) {
  const total = home + away;
  const homeW = total > 0 ? Math.round((home / total) * 100) : 50;
  const awayW = 100 - homeW;
  return (
    <div className="w-full">
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-700 mt-1">
        <div className="bg-blue-500/60" style={{ width: `${awayW}%` }} />
        <div className="bg-red-500/60" style={{ width: `${homeW}%` }} />
      </div>
    </div>
  );
}

function StatCompareRow({
  label, awayVal, homeVal, awayBetter, unit = "",
}: {
  label: string; awayVal: string | number; homeVal: string | number;
  awayBetter?: boolean; unit?: string;
}) {
  return (
    <div className="grid grid-cols-3 items-center py-2.5 border-b border-slate-700/40 last:border-0">
      <div className={`text-sm font-bold text-right pr-4 ${awayBetter === true ? "text-blue-400" : "text-slate-200"}`}>
        {awayVal}{unit}
      </div>
      <div className="text-center text-xs text-slate-500">{label}</div>
      <div className={`text-sm font-bold text-left pl-4 ${awayBetter === false ? "text-red-400" : "text-slate-200"}`}>
        {homeVal}{unit}
      </div>
    </div>
  );
}

function FactorCard({ text }: { text: string }) {
  // 긍정/부정 키워드로 색상 구분
  const isPositive = /홈팀 우위|홈 우위|홈 최근|파크팩터/.test(text);
  const isNegative = /원정 우위|소진|경고/.test(text);
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${
      isPositive ? "bg-blue-950/30 border-blue-800/40" :
      isNegative ? "bg-red-950/30 border-red-800/40" :
      "bg-slate-700/30 border-slate-600/40"
    }`}>
      <span className={`mt-0.5 text-base shrink-0 ${
        isPositive ? "text-blue-400" : isNegative ? "text-red-400" : "text-slate-400"
      }`}>
        {isPositive ? "▲" : isNegative ? "▼" : "•"}
      </span>
      <p className="text-sm text-slate-200 leading-relaxed">{text}</p>
    </div>
  );
}

function ParkFactorBar({ factor }: { factor: number }) {
  // 0.85~1.15 범위 기준으로 바 위치 계산
  const min = 0.85, max = 1.15;
  const pct = Math.round(((factor - min) / (max - min)) * 100);
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative w-full h-3 bg-slate-700 rounded-full mt-2">
      {/* 중앙선 */}
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-500" />
      {/* 마커 */}
      <div
        className={`absolute top-0.5 -translate-x-1/2 w-2 h-2 rounded-full ${
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
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// "5.333" → "5⅓" 또는 "5.1" 표기 (KBO 관례: 5⅓이닝)
function fmtIP(ip: number | null | undefined): string {
  if (ip == null) return "-";
  const whole = Math.floor(ip);
  const frac = Math.round((ip - whole) * 3); // 0, 1, 2 (이닝의 /3)
  if (frac === 0) return `${whole}이닝`;
  if (frac === 1) return `${whole}⅓이닝`;
  if (frac === 2) return `${whole}⅔이닝`;
  return `${ip.toFixed(1)}이닝`;
}

function fmtUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}시간 전`;
  return `${Math.floor(diffMin / 1440)}일 전`;
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
      }이며, 확률은 경기 결과를 보장하지 않습니다.`
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
    bullets.push(
      `선발 비교에서는 ${betterTeam} ${better.name}의 ERA ${betterEra.toFixed(2)}가 상대 선발 ${otherEra.toFixed(2)}보다 낮습니다.`
    );
  }

  if (game.home_trend && game.away_trend) {
    const better = game.home_trend.run_diff >= game.away_trend.run_diff ? game.home_trend : game.away_trend;
    const betterTeam = game.home_trend.run_diff >= game.away_trend.run_diff ? home : away;
    bullets.push(
      `최근 ${better.games}경기 득실 흐름은 ${betterTeam}가 ${better.run_diff >= 0 ? "+" : ""}${better.run_diff}로 상대보다 안정적입니다.`
    );
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
    bullets.push(
      `구장 파크팩터 ${prediction.park.factor.toFixed(2)}는 ${
        prediction.park.factor > 1 ? "타자" : "투수"
      } 친화 참고 지표입니다. 현재 승률 계산에는 반영하지 않습니다.`
    );
  }

  return bullets.slice(0, 6);
}

export default async function GameDetailPage({ params }: Props) {
  const id = Number(params.id);
  if (isNaN(id)) notFound();

  const [game, prediction] = await Promise.all([
    loadGameOrNull(id),
    loadPredictionOrNull(id),
  ]);

  if (!game) notFound();

  const { home_team, away_team, starters, status, home_trend, away_trend, home_lineup, away_lineup } = game;
  const isFinished = status === "final";
  const homeWin = isFinished && (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWin = isFinished && (game.away_score ?? 0) > (game.home_score ?? 0);
  const eloDiff = Math.abs(home_team.elo_rating - away_team.elo_rating).toFixed(0);
  const eloBetter = home_team.elo_rating > away_team.elo_rating ? "home" : "away";
  const awayRoadElo = away_team.away_elo ?? away_team.elo_rating;
  const homeHomeElo = home_team.home_elo ?? home_team.elo_rating;
  const gameAnalysis = buildGameAnalysis(game, prediction);

  // ── 탭별 콘텐츠 변수 ─────────────────────────────────────
  const previewContent = (
    <div className="space-y-4">
      {/* ── 예측 승률 + 근거 ─────────────────────────── */}
      {prediction && !isFinished && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-200">데이터 예측</h2>
            <span className="text-[10px] text-slate-600 bg-slate-700 px-2 py-0.5 rounded-full">
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
                (prediction.change_from_previous_pp ?? 0) > 0 ? "text-red-400"
                : (prediction.change_from_previous_pp ?? 0) < 0 ? "text-blue-400"
                : "text-slate-400"
              }`}>
                {prediction.change_from_previous_pp != null
                  ? `홈 ${prediction.change_from_previous_pp > 0 ? "+" : ""}${prediction.change_from_previous_pp.toFixed(1)}%p`
                  : "첫 예측"}
              </p>
            </div>
          </div>

          {prediction.key_factors.length > 0 && (
            <div className="space-y-2 pt-1">
              {prediction.key_factors.map((f, i) => (
                <FactorCard key={i} text={f} />
              ))}
            </div>
          )}
        </div>
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

      {/* ── 승부 변화 레이더 ─────────────────────────── */}
      {prediction && !isFinished && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-5">
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
                      (item.change_pp ?? 0) > 0 ? "text-red-400"
                      : (item.change_pp ?? 0) < 0 ? "text-blue-400"
                      : "text-slate-600"
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
                      !factor.available ? "text-slate-600"
                      : factor.contribution_pp > 0 ? "text-red-400"
                      : factor.contribution_pp < 0 ? "text-blue-400"
                      : "text-slate-500"
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

      {/* ── 팀 비교 ──────────────────────────────────── */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
        {/* 헤더 — 왼쪽=원정, 오른쪽=홈 */}
        <div className="grid grid-cols-3 items-center mb-3">
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

        {/* 홈/원정 분리 ELO */}
        <StatCompareRow
          label="원정 ELO"
          awayVal={awayRoadElo.toFixed(0)}
          homeVal={"—"}
          awayBetter={awayRoadElo > away_team.elo_rating}
        />
        <StatCompareRow
          label="홈 ELO"
          awayVal={"—"}
          homeVal={homeHomeElo.toFixed(0)}
          awayBetter={false}
        />

        {/* ELO 시각 바 (홈 home_elo vs 원정 away_elo) */}
        <div className="px-1 pb-2">
          <EloBar home={homeHomeElo} away={awayRoadElo} />
          <p className="text-center text-xs text-slate-600 mt-1">
            홈/원정 ELO 기준 — 차이 {Math.abs(home_team.home_elo - away_team.away_elo).toFixed(0)}점
          </p>
        </div>

        <StatCompareRow
          label="최근 5경기"
          awayVal={away_team.recent_form.split("").filter(c => c === "W").length + "승"}
          homeVal={home_team.recent_form.split("").filter(c => c === "W").length + "승"}
          awayBetter={
            away_team.recent_form.split("").filter(c => c === "W").length >
            home_team.recent_form.split("").filter(c => c === "W").length
          }
        />
      </div>

      {/* ── 최근 7경기 득점 흐름 ─────────────────────── */}
      {(away_trend || home_trend) && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <div className="mb-4">
            <h2 className="text-sm font-black text-slate-200">최근 7경기 득점 흐름</h2>
            <p className="mt-1 text-xs text-slate-500">경기 결과 기준 득점·실점과 박스스코어 기반 OPS 흐름입니다.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { team: away_team, trend: away_trend, side: "원정", color: "text-blue-400" },
              { team: home_team, trend: home_trend, side: "홈", color: "text-red-400" },
            ].map(({ team, trend, side, color }) => (
              <div key={team.id} className="rounded-xl bg-slate-700/35 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-300">{team.short_name ?? team.name}</p>
                  <span className="text-[10px] text-slate-600">{side}</span>
                </div>
                {trend ? (
                  <>
                    <p className={`mt-2 text-xl font-black ${color}`}>{trend.avg_runs_for.toFixed(1)}득점</p>
                    <p className="text-[11px] text-slate-500">
                      평균 {trend.avg_runs_against.toFixed(1)}실점 · 득실차 {trend.run_diff > 0 ? "+" : ""}{trend.run_diff}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      최근 OPS {trend.avg_ops != null ? trend.avg_ops.toFixed(3) : "준비 중"}
                      {trend.ops_games > 0 ? ` · ${trend.ops_games}경기` : ""}
                    </p>
                    <p className="mt-2 text-[11px] font-bold text-slate-400">
                      {trend.wins}승 {trend.losses}패{trend.draws > 0 ? ` ${trend.draws}무` : ""}
                    </p>
                    <div className="mt-2 space-y-1">
                      {trend.recent_games.slice(0, 3).map((recent) => (
                        <p key={`${team.id}-${recent.game_date}`} className="text-[10px] text-slate-600">
                          {recent.game_date.slice(5).replace("-", ".")} vs {recent.opponent_name} ·
                          <span className={recent.result === "W" ? " text-emerald-500" : recent.result === "L" ? " text-red-500" : " text-slate-500"}>
                            {" "}{recent.result}
                          </span>
                          {" "}{recent.runs_for}:{recent.runs_against}
                        </p>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-slate-600">데이터 준비 중</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );

  const lineupContent = (
    <div className="space-y-4">
      {/* ── 확정 타순 ────────────────────────────────── */}
      {(away_lineup || home_lineup) && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <div className="mb-4">
            <h2 className="text-sm font-black text-slate-200">타순</h2>
            <p className="mt-1 text-xs text-slate-500">발표된 타순 또는 종료 경기의 관측 선발 타순입니다.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { team: away_team, lineup: away_lineup, side: "원정" },
              { team: home_team, lineup: home_lineup, side: "홈" },
            ].map(({ team, lineup, side }) => (
              <div key={team.id} className="rounded-xl bg-slate-700/35 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-300">{team.short_name ?? team.name}</p>
                  <span className={`text-[10px] font-bold ${lineup?.is_confirmed ? "text-emerald-400" : "text-slate-600"}`}>
                    {lineup?.is_confirmed ? "확정" : side}
                  </span>
                </div>
                {lineup?.strength_available && lineup.strength_ratio != null && (
                  <div className="mb-2 rounded-lg bg-slate-800/60 px-2 py-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">라인업 강도</span>
                      <span className={lineup.strength_ratio >= 1 ? "font-black text-emerald-400" : "font-black text-orange-400"}>
                        {(lineup.strength_ratio * 100).toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-600">
                      가중 OPS {lineup.weighted_ops?.toFixed(3)} · 정상 타선 {lineup.baseline_ops?.toFixed(3)}
                    </p>
                  </div>
                )}
                {lineup && (lineup.excluded_regulars.length > 0 || lineup.replacements.length > 0) && (
                  <div className="mb-2 rounded-lg border border-orange-900/50 bg-orange-950/20 px-2 py-1.5">
                    <p className="text-[10px] font-bold text-orange-300">정상 타선 대비 변경</p>
                    {lineup.excluded_regulars.length > 0 && (
                      <p className="mt-1 text-[10px] text-orange-400">
                        제외 {lineup.excluded_regulars.map((player) =>
                          `${player.name}${player.ops != null ? ` OPS ${player.ops.toFixed(3)}` : ""}`
                        ).join(" · ")}
                      </p>
                    )}
                    {lineup.replacements.length > 0 && (
                      <p className="mt-1 text-[10px] text-slate-500">
                        대체 {lineup.replacements.map((player) =>
                          `${player.name}${player.ops != null ? ` OPS ${player.ops.toFixed(3)}` : ""}`
                        ).join(" · ")}
                      </p>
                    )}
                  </div>
                )}
                {lineup ? lineup.players.map((player) => (
                  <p key={`${team.id}-${player.bat_order}-${player.name}`} className="flex items-center py-0.5 text-[11px] text-slate-400">
                    <span className="mr-2 inline-block w-3 text-right font-bold text-slate-600">{player.bat_order}</span>
                    <span>{player.name}</span>
                    <span className="ml-1 text-[10px] text-slate-600">{player.position ?? ""}</span>
                    <span className="ml-auto text-[10px] text-slate-500">{player.ops != null ? `OPS ${player.ops.toFixed(3)}` : "-"}</span>
                  </p>
                )) : (
                  <p className="text-xs text-slate-600">타순 미발표</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );

  const pitchersContent = (
    <div className="space-y-4">
      {/* ── 선발 투수 비교 ───────────────────────────── */}
      {starters && (starters.home || starters.away) && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <h2 className="text-sm font-black text-slate-200 mb-4">선발 투수 비교</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* 원정 선발 */}
            {starters.away ? (
              <div className="bg-slate-700/40 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">
                  원정 {starters.away.is_confirmed ? "✓ 확정" : "추정"}
                </p>
                <p className="text-xl font-black text-slate-100 mb-4">{starters.away.name}</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-slate-400">ERA</span>
                    <span className={`text-2xl font-black ${
                      (starters.away.era ?? 99) <= 3 ? "text-emerald-400" :
                      (starters.away.era ?? 99) <= 4.5 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {starters.away.era?.toFixed(2) ?? "-"}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-slate-400">WHIP</span>
                    <span className={`text-2xl font-black ${
                      (starters.away.whip ?? 99) <= 1.1 ? "text-emerald-400" :
                      (starters.away.whip ?? 99) <= 1.4 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {starters.away.whip?.toFixed(2) ?? "-"}
                    </span>
                  </div>
                  {starters.away.innings_pitched != null && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-slate-400">시즌 이닝</span>
                      <span className="text-lg font-bold text-slate-300">
                        {fmtIP(starters.away.innings_pitched)}
                      </span>
                    </div>
                  )}
                  {starters.away.wins != null && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-slate-400">시즌 성적</span>
                      <span className="text-base font-bold text-slate-300">
                        {starters.away.wins}승 {starters.away.losses}패
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-700/20 rounded-xl p-4 flex items-center justify-center">
                <p className="text-slate-600 text-sm">미정</p>
              </div>
            )}

            {/* 홈 선발 */}
            {starters.home ? (
              <div className="bg-slate-700/40 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1 text-right">
                  홈 {starters.home.is_confirmed ? "✓ 확정" : "추정"}
                </p>
                <p className="text-xl font-black text-slate-100 mb-4 text-right">{starters.home.name}</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className={`text-2xl font-black ${
                      (starters.home.era ?? 99) <= 3 ? "text-emerald-400" :
                      (starters.home.era ?? 99) <= 4.5 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {starters.home.era?.toFixed(2) ?? "-"}
                    </span>
                    <span className="text-sm text-slate-400">ERA</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className={`text-2xl font-black ${
                      (starters.home.whip ?? 99) <= 1.1 ? "text-emerald-400" :
                      (starters.home.whip ?? 99) <= 1.4 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {starters.home.whip?.toFixed(2) ?? "-"}
                    </span>
                    <span className="text-sm text-slate-400">WHIP</span>
                  </div>
                  {starters.home.innings_pitched != null && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-lg font-bold text-slate-300">
                        {fmtIP(starters.home.innings_pitched)}
                      </span>
                      <span className="text-sm text-slate-400">시즌 이닝</span>
                    </div>
                  )}
                  {starters.home.wins != null && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-base font-bold text-slate-300">
                        {starters.home.wins}승 {starters.home.losses}패
                      </span>
                      <span className="text-sm text-slate-400">시즌 성적</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-700/20 rounded-xl p-4 flex items-center justify-center">
                <p className="text-slate-600 text-sm">미정</p>
              </div>
            )}
          </div>

          {/* ERA 직접 비교 바 */}
          {starters.home?.era && starters.away?.era && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs text-slate-500 mb-2 text-center">ERA 비교 (낮을수록 유리)</p>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-10 text-right">
                  {starters.away.era.toFixed(2)}
                </span>
                <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-slate-700">
                  <div
                    className={`h-full transition-all duration-700 ${
                      starters.away.era < starters.home.era ? "bg-blue-500" : "bg-slate-600"
                    }`}
                    style={{ width: `${Math.min(90, Math.max(10, 50 + (starters.home.era - starters.away.era) * 8))}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-400 w-10">
                  {starters.home.era.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                <span>{away_team.short_name}</span>
                <span>{home_team.short_name}</span>
              </div>
            </div>
          )}

          {(starters.away?.recent_summary || starters.home?.recent_summary) && (
            <div className="mt-5 border-t border-slate-700 pt-5">
              <h3 className="mb-4 text-sm font-bold text-slate-300">선발 최근 5경기</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  { starter: starters.away, side: "원정", color: "text-blue-400", borderColor: "border-blue-800/30" },
                  { starter: starters.home, side: "홈", color: "text-red-400", borderColor: "border-red-800/30" },
                ].map(({ starter, side, color, borderColor }) => (
                  <div key={side} className={`rounded-xl bg-slate-700/30 border ${borderColor} p-4`}>
                    {/* 투수 이름 + 최근 요약 */}
                    <div className="mb-3">
                      <div className="flex items-baseline justify-between">
                        <p className="text-base font-black text-slate-100">{starter?.name ?? "미정"}</p>
                        <span className="text-xs text-slate-500">{side}</span>
                      </div>
                      {starter?.recent_summary && (
                        <div className="mt-1.5 flex gap-3">
                          <div className="text-center">
                            <p className={`text-xl font-black ${color}`}>
                              {starter.recent_summary.era?.toFixed(2) ?? "-"}
                            </p>
                            <p className="text-[10px] text-slate-500">ERA</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xl font-black text-slate-300">
                              {starter.recent_summary.whip?.toFixed(2) ?? "-"}
                            </p>
                            <p className="text-[10px] text-slate-500">WHIP</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xl font-black text-slate-300">
                              {fmtIP(starter.recent_summary.avg_innings)}
                            </p>
                            <p className="text-[10px] text-slate-500">평균</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 경기별 로그 */}
                    {starter?.recent_games && starter.recent_games.length > 0 ? (
                      <div className="space-y-1.5 border-t border-slate-700/50 pt-3">
                        {starter.recent_games.map((recent) => (
                          <div key={`${starter.id}-${recent.game_date}`}
                            className="grid gap-1 text-xs"
                            style={{ gridTemplateColumns: "3rem 1fr auto" }}>
                            {/* 날짜 */}
                            <span className="text-slate-600 tabular-nums">
                              {recent.game_date.slice(5).replace("-", ".")}
                            </span>
                            {/* 상대 */}
                            <span className="text-slate-400 truncate">vs {recent.opponent_name}</span>
                            {/* 이닝 */}
                            <span className={`text-right font-bold tabular-nums ${color}`}>
                              {fmtIP(recent.innings_pitched)}
                            </span>
                            {/* 세부 — 두 번째 행 */}
                            <span />
                            <span className="text-slate-600 text-[11px] col-span-2">
                              {recent.earned_runs}자책 {recent.strikeouts}K
                              {recent.hits != null ? ` ${recent.hits}H` : ""}
                              {recent.walks != null ? ` ${recent.walks}BB` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600 mt-2">최근 선발 기록 없음</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 경기 환경 ────────────────────────────────── */}
      {prediction && (prediction.park || prediction.weather || prediction.bullpen_home || prediction.bullpen_away) && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-5">
          <h2 className="text-sm font-black text-slate-200">경기 환경</h2>

          {/* 파크팩터 */}
          {prediction.park && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs font-bold text-slate-400">구장 파크팩터</p>
                <span className={`text-sm font-black ${
                  prediction.park.factor > 1.03 ? "text-orange-400" :
                  prediction.park.factor < 0.97 ? "text-cyan-400" : "text-slate-300"
                }`}>
                  {prediction.park.factor.toFixed(2)}
                  <span className="text-xs font-normal ml-1 text-slate-500">
                    {prediction.park.factor > 1.03 ? "타자 친화" :
                     prediction.park.factor < 0.97 ? "투수 친화" : "중립"}
                  </span>
                </span>
              </div>
              <ParkFactorBar factor={prediction.park.factor} />
              <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                <span>투수 유리 ← 0.85</span>
                <span>1.00</span>
                <span>1.15 → 타자 유리</span>
              </div>
              {prediction.park.notes && (
                <p className="text-xs text-slate-500 mt-2 bg-slate-700/30 rounded-lg px-3 py-2">
                  {prediction.park.notes}
                </p>
              )}
            </div>
          )}

          {/* 날씨 */}
          {prediction.weather && prediction.weather.description !== "날씨 영향 미미" && prediction.weather.description !== "돔 구장 — 날씨 영향 없음" && (
            <div className={`rounded-xl p-4 ${
              prediction.weather.rain_risk
                ? "bg-yellow-950/40 border border-yellow-800/40"
                : "bg-slate-700/30"
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{prediction.weather.rain_risk ? "🌧️" : "🌤️"}</span>
                <p className="text-sm font-bold text-slate-200">{prediction.weather.description}</p>
              </div>
              {prediction.weather.temperature && (
                <p className="text-xs text-slate-500">{prediction.weather.temperature}°C</p>
              )}
            </div>
          )}
          {prediction.weather && (prediction.weather.description === "날씨 영향 미미" || prediction.weather.description === "돔 구장 — 날씨 영향 없음") && (
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <span>☀️</span>
              <span>{prediction.weather.description}</span>
            </div>
          )}

          {/* 불펜 소진도 */}
          {(prediction.bullpen_home || prediction.bullpen_away) && (
            <div>
              <p className="text-xs font-bold text-slate-400 mb-3">불펜 소진도 (최근 3일)</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { label: away_team.short_name ?? away_team.name, bp: prediction.bullpen_away, side: "원정" },
                  { label: home_team.short_name ?? home_team.name, bp: prediction.bullpen_home, side: "홈" },
                ].map(({ label, bp, side }) => (
                  <div key={label} className="bg-slate-700/40 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-slate-400">{label} <span className="text-slate-600">({side})</span></span>
                      {bp && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          bp.level === "소진" ? "bg-red-900/50 text-red-400" :
                          bp.level === "경고" ? "bg-yellow-900/50 text-yellow-400" :
                          "bg-emerald-900/50 text-emerald-400"
                        }`}>{bp.level}</span>
                      )}
                    </div>
                    {bp ? (
                      <>
                        <div className="w-full bg-slate-600 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              bp.level === "소진" ? "bg-red-500" :
                              bp.level === "경고" ? "bg-yellow-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(100, bp.fatigue_score * 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-400 mt-1 font-semibold">{fmtIP(bp.recent_innings)} 등판</p>
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
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                  pitcher.availability === "휴식 권장" ? "bg-red-900/40 text-red-400" :
                                  pitcher.availability === "주의" ? "bg-yellow-900/40 text-yellow-400" :
                                  "bg-emerald-900/40 text-emerald-400"
                                }`}>{pitcher.availability}</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                3일 {pitcher.appearances}경기 · {fmtIP(pitcher.recent_innings)}
                                {pitcher.consecutive_days > 0 ? ` · ${pitcher.consecutive_days}일 연속` : ""}
                              </p>
                              {pitcher.logs.map((log) => (
                                <div key={`${pitcher.player_id}-${log.game_date}`}
                                  className="mt-1.5 grid text-xs text-slate-600"
                                  style={{ gridTemplateColumns: "2.8rem 1fr auto" }}>
                                  <span className="tabular-nums">{log.game_date.slice(5).replace("-", ".")}</span>
                                  <span>vs {log.opponent_name || "-"}</span>
                                  <span className="font-bold text-slate-400 text-right">{fmtIP(log.innings_pitched)}</span>
                                  <span />
                                  <span className="col-span-2 text-[11px]">
                                    {log.hits ?? 0}H {log.walks ?? 0}BB {log.strikeouts ?? 0}K {log.runs ?? 0}R
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
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
          )}
        </div>
      )}

    </div>
  );

  const analysisContent = (
    <div className="space-y-4">
      {/* ── 데이터 기준 시각 ─────────────────────────── */}
      {game.data_freshness && game.data_freshness.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 className="text-sm font-black text-slate-200 mb-3">데이터 기준 시각</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {game.data_freshness.map((f) => (
              <div key={f.key} className="rounded-xl px-3 py-2.5" style={{ background: "#0d1421" }}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-bold text-slate-300">{f.label}</span>
                  {f.is_stale ? (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-900/40 text-orange-400">갱신 지연</span>
                  ) : f.note ? (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-500">{f.note}</span>
                  ) : (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-900/30 text-emerald-500">최신</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {f.updated_at ? fmtUpdatedAt(f.updated_at) : "—"}
                </p>
                <p className="text-[10px] text-slate-600">{f.source}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 데이터 안내 ──────────────────────────────── */}
      <p className="text-center text-xs text-slate-600 pb-2">
        예측은 확보된 데이터를 기준으로 계산하며, 참고용입니다.
      </p>
    </div>
  );
  // ── 경기 헤더 (탭 밖 — 항상 표시) ────────────────────────
  const gameHeader = (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 sm:p-6">
      {/* 구장 / 시간 / 상태 */}
      <div className="flex justify-between items-center mb-5 text-xs text-slate-500">
        <span>{game.stadium ?? "-"}</span>
        <div className="flex items-center gap-2">
          <span>{game.start_time?.slice(0, 5)}</span>
          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
            isFinished ? "bg-slate-700 text-slate-400"
            : status === "in_progress" ? "bg-emerald-900 text-emerald-400"
            : "bg-blue-900 text-blue-300"
          }`}>{isFinished ? "종료" : status === "in_progress" ? "진행중" : "예정"}</span>
        </div>
      </div>
      {/* 팀 매치업 */}
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className={`text-xl font-black sm:text-3xl ${awayWin ? "text-white" : isFinished ? "text-slate-500" : "text-slate-100"}`}>
            {away_team.short_name ?? away_team.name}
          </span>
          <span className="text-xs text-slate-500 mt-1">원정</span>
          <div className="mt-2"><RecentFormBadges form={away_team.recent_form} /></div>
        </div>
        <div className="flex flex-col items-center px-1 sm:px-4">
          {isFinished ? (
            <div className="flex items-center gap-1 sm:gap-3">
              <span className={`text-3xl font-black tabular-nums sm:text-4xl ${awayWin ? "text-white" : "text-slate-500"}`}>{game.away_score}</span>
              <span className="text-xl text-slate-600 sm:text-2xl">:</span>
              <span className={`text-3xl font-black tabular-nums sm:text-4xl ${homeWin ? "text-white" : "text-slate-500"}`}>{game.home_score}</span>
            </div>
          ) : (
            <span className="text-2xl text-slate-600 font-bold">VS</span>
          )}
          <span className="text-xs text-slate-600 mt-1">{game.game_date}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className={`text-xl font-black sm:text-3xl ${homeWin ? "text-white" : isFinished ? "text-slate-500" : "text-slate-100"}`}>
            {home_team.short_name ?? home_team.name}
          </span>
          <span className="text-xs text-slate-500 mt-1">홈</span>
          <div className="mt-2"><RecentFormBadges form={home_team.recent_form} /></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4">
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
