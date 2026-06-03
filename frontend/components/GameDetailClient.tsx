"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import RecentFormBadges from "@/components/RecentFormBadges";
import StarterCard from "@/components/StarterCard";
import WinProbBar from "@/components/WinProbBar";
import type { GameResponse, LineupPlayerInfo, PredictionInGame } from "@/lib/types";

type Tab = "preview" | "lineup" | "pitchers" | "analysis";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8002/v1";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "preview", label: "프리뷰" },
  { key: "lineup", label: "타순" },
  { key: "pitchers", label: "선발" },
  { key: "analysis", label: "예측 분석" },
];

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function fmtPct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {children}
    </div>
  );
}

function LoadingCard({ text }: { text: string }) {
  return (
    <SectionCard>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-32 rounded bg-slate-700" />
        <div className="h-16 rounded-xl bg-slate-700/60" />
        <p className="text-sm text-slate-500">{text}</p>
      </div>
    </SectionCard>
  );
}

function ErrorCard({ text }: { text: string }) {
  return (
    <SectionCard>
      <p className="text-sm text-rose-300">{text}</p>
    </SectionCard>
  );
}

function LineupTable({ title, side, players }: { title: string; side: string; players: LineupPlayerInfo[] }) {
  return (
    <div className="rounded-xl bg-slate-700/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-black text-slate-100">{title}</h3>
        <span className="text-xs text-slate-500">{side}</span>
      </div>
      <div className="space-y-2">
        {players.map((player) => (
          <div key={`${title}-${player.bat_order}-${player.name}`} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
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
    </div>
  );
}

export default function GameDetailClient({ summary }: { summary: GameResponse }) {
  const [tab, setTab] = useState<Tab>("preview");
  const [primeGameData, setPrimeGameData] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setPrimeGameData(true), 600);
    return () => window.clearTimeout(timer);
  }, []);

  const shouldLoadGame = primeGameData || tab === "lineup" || tab === "pitchers" || tab === "analysis";
  const shouldLoadPrediction = tab === "analysis";

  const { data: fullGame, isLoading: gameLoading, error: gameError } = useSWR<GameResponse>(
    shouldLoadGame ? `${BASE}/games/${summary.id}` : null,
    fetcher,
  );
  const { data: fullPrediction, isLoading: predictionLoading, error: predictionError } = useSWR<PredictionInGame>(
    shouldLoadPrediction ? `${BASE}/games/${summary.id}/prediction` : null,
    fetcher,
  );

  const game = fullGame ?? summary;
  const prediction = fullPrediction ?? summary.prediction;
  const { away_team, home_team, starters, status } = game;
  const isFinished = status === "final";
  const awayWin = isFinished && (game.away_score ?? 0) > (game.home_score ?? 0);
  const homeWin = isFinished && (game.home_score ?? 0) > (game.away_score ?? 0);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <SectionCard>
        <div className="mb-5 flex items-center justify-between text-xs text-slate-500">
          <span>{game.stadium ?? "-"}</span>
          <div className="flex items-center gap-2">
            <span>{game.start_time?.slice(0, 5) ?? "-"}</span>
            <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
              {status === "final" ? "종료" : status === "in_progress" ? "진행중" : "예정"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 flex-col items-center">
            <span className={`text-3xl font-black ${awayWin ? "text-white" : isFinished ? "text-slate-500" : "text-slate-100"}`}>
              {away_team.short_name ?? away_team.name}
            </span>
            <span className="mt-1 text-xs text-slate-500">원정</span>
            <div className="mt-3">
              <RecentFormBadges form={away_team.recent_form} />
            </div>
          </div>
          <div className="px-4 text-center">
            {isFinished ? (
              <div className="flex items-center gap-2">
                <span className={`text-4xl font-black ${awayWin ? "text-white" : "text-slate-500"}`}>{game.away_score}</span>
                <span className="text-2xl text-slate-600">:</span>
                <span className={`text-4xl font-black ${homeWin ? "text-white" : "text-slate-500"}`}>{game.home_score}</span>
              </div>
            ) : (
              <span className="text-4xl font-black text-slate-500">VS</span>
            )}
            <span className="mt-2 block text-xs text-slate-600">{game.game_date}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center">
            <span className={`text-3xl font-black ${homeWin ? "text-white" : isFinished ? "text-slate-500" : "text-slate-100"}`}>
              {home_team.short_name ?? home_team.name}
            </span>
            <span className="mt-1 text-xs text-slate-500">홈</span>
            <div className="mt-3">
              <RecentFormBadges form={home_team.recent_form} />
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="flex gap-1 rounded-xl p-1" style={{ background: "#111827" }}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="flex-1 rounded-lg py-2 text-sm font-bold transition-all"
            style={tab === key ? { background: "rgba(99,102,241,0.2)", color: "#a5b4fc" } : { color: "#64748b" }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "preview" && (
        <div className="space-y-4">
          {prediction && !isFinished && (
            <SectionCard>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-200">오늘의 승부 예측</h2>
                <span className="text-xs text-slate-500">
                  {prediction.data_completeness != null ? `데이터 ${fmtPct(prediction.data_completeness / 100)}` : "요약 보기"}
                </span>
              </div>
              <WinProbBar
                homeProb={prediction.home_win_prob}
                awayProb={prediction.away_win_prob}
                homeTeamName={home_team.short_name ?? home_team.name}
                awayTeamName={away_team.short_name ?? away_team.name}
              />
              {prediction.key_factors.length > 0 && (
                <div className="mt-4 space-y-2">
                  {prediction.key_factors.map((factor) => (
                    <div key={factor} className="rounded-lg bg-slate-700/30 px-3 py-2 text-sm text-slate-300">
                      {factor}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard>
            <h2 className="mb-4 text-sm font-black text-slate-200">선발 매치업</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-700/30 p-4">
                <StarterCard starter={starters?.away ?? null} label="원정" />
              </div>
              <div className="rounded-xl bg-slate-700/30 p-4">
                <StarterCard starter={starters?.home ?? null} label="홈" align="right" />
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {tab === "lineup" && (
        gameLoading ? (
          <LoadingCard text="타순 데이터를 불러오는 중입니다." />
        ) : gameError ? (
          <ErrorCard text="타순 데이터를 불러오지 못했습니다." />
        ) : fullGame?.home_lineup || fullGame?.away_lineup ? (
          <div className="space-y-4">
            <SectionCard>
              <h2 className="mb-4 text-sm font-black text-slate-200">예상/확정 타순</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {fullGame?.away_lineup?.players?.length ? (
                  <LineupTable title={away_team.short_name ?? away_team.name} side="원정" players={fullGame.away_lineup.players} />
                ) : (
                  <div className="rounded-xl bg-slate-700/30 p-6 text-center text-sm text-slate-500">원정 타순 미발표</div>
                )}
                {fullGame?.home_lineup?.players?.length ? (
                  <LineupTable title={home_team.short_name ?? home_team.name} side="홈" players={fullGame.home_lineup.players} />
                ) : (
                  <div className="rounded-xl bg-slate-700/30 p-6 text-center text-sm text-slate-500">홈 타순 미발표</div>
                )}
              </div>
            </SectionCard>
          </div>
        ) : (
          <SectionCard>
            <p className="text-center text-sm text-slate-500">아직 발표된 타순이 없습니다.</p>
          </SectionCard>
        )
      )}

      {tab === "pitchers" && (
        gameLoading ? (
          <LoadingCard text="선발 상세 데이터를 불러오는 중입니다." />
        ) : gameError ? (
          <ErrorCard text="선발 상세 데이터를 불러오지 못했습니다." />
        ) : (
          <div className="space-y-4">
            <SectionCard>
              <h2 className="mb-4 text-sm font-black text-slate-200">선발 투수 비교</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-700/30 p-4">
                  <StarterCard starter={fullGame?.starters?.away ?? null} label="원정" />
                  {fullGame?.starters?.away?.recent_summary && (
                    <p className="mt-3 text-xs text-slate-400">
                      최근 {fullGame.starters.away.recent_summary.games}경기 평균 {fullGame.starters.away.recent_summary.avg_innings?.toFixed(1) ?? "-"}이닝
                    </p>
                  )}
                </div>
                <div className="rounded-xl bg-slate-700/30 p-4">
                  <StarterCard starter={fullGame?.starters?.home ?? null} label="홈" align="right" />
                  {fullGame?.starters?.home?.recent_summary && (
                    <p className="mt-3 text-right text-xs text-slate-400">
                      최근 {fullGame.starters.home.recent_summary.games}경기 평균 {fullGame.starters.home.recent_summary.avg_innings?.toFixed(1) ?? "-"}이닝
                    </p>
                  )}
                </div>
              </div>
            </SectionCard>
          </div>
        )
      )}

      {tab === "analysis" && (
        gameLoading || predictionLoading ? (
          <LoadingCard text="예측 분석 데이터를 불러오는 중입니다." />
        ) : gameError || predictionError ? (
          <ErrorCard text="예측 분석 데이터를 불러오지 못했습니다." />
        ) : fullPrediction ? (
          <div className="space-y-4">
            <SectionCard>
              <h2 className="mb-4 text-sm font-black text-slate-200">예측 변화</h2>
              {fullPrediction.trend.length > 0 ? (
                <div className="space-y-2">
                  {fullPrediction.trend.map((item) => (
                    <div key={`${item.generated_at}-${item.prediction_type}`} className="flex items-center justify-between rounded-xl bg-slate-700/30 px-3 py-3 text-sm">
                      <div>
                        <p className="font-bold text-slate-200">{item.prediction_type}</p>
                        <p className="text-xs text-slate-500">{item.generated_at.slice(5, 16).replace("T", " ")}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-rose-300">{fmtPct(item.home_win_prob)}</p>
                        <p className="text-xs text-slate-500">{item.change_pp != null ? `${item.change_pp > 0 ? "+" : ""}${item.change_pp.toFixed(1)}%p` : "기준값"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">아직 예측 변화 기록이 없습니다.</p>
              )}
            </SectionCard>

            <SectionCard>
              <h2 className="mb-4 text-sm font-black text-slate-200">모델 설명력</h2>
              {fullPrediction.factor_contributions.length > 0 ? (
                <div className="space-y-3">
                  {fullPrediction.factor_contributions.map((factor) => (
                    <div key={factor.key}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className={factor.available ? "text-slate-300" : "text-slate-500"}>{factor.label}</span>
                        <span className={factor.available ? "text-slate-400" : "text-slate-600"}>
                          {factor.available ? `${factor.contribution_pp > 0 ? "+" : ""}${factor.contribution_pp.toFixed(1)}%p` : "대기중"}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className={factor.contribution_pp >= 0 ? "h-full bg-rose-400" : "h-full bg-blue-400"}
                          style={{ width: `${Math.min(100, Math.abs(factor.contribution_pp) * 10)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">아직 요인별 기여도가 없습니다.</p>
              )}
            </SectionCard>

            {fullGame?.data_freshness?.length ? (
              <SectionCard>
                <h2 className="mb-4 text-sm font-black text-slate-200">데이터 신선도</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {fullGame.data_freshness.map((item) => (
                    <div key={item.key} className="rounded-xl bg-slate-700/30 px-3 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300">{item.label}</span>
                        <span className={`text-[10px] font-bold ${item.is_stale ? "text-orange-400" : "text-emerald-400"}`}>
                          {item.is_stale ? "지연" : "최신"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{item.source}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ) : null}
          </div>
        ) : (
          <SectionCard>
            <p className="text-sm text-slate-500">예측 분석 데이터가 아직 없습니다.</p>
          </SectionCard>
        )
      )}
    </div>
  );
}
