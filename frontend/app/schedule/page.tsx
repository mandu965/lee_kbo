"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { GameResponse } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/v1";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${["일","월","화","수","목","금","토"][d.getDay()]})`;
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: "예정",
  final: "종료",
  cancelled: "취소",
  in_progress: "진행",
};
const STATUS_COLOR: Record<string, string> = {
  scheduled: "text-blue-400",
  final: "text-slate-500",
  cancelled: "text-red-500",
  in_progress: "text-emerald-400",
};

export default function SchedulePage() {
  const [date, setDate] = useState(todayStr());

  const { data, isLoading, error } = useSWR(`${BASE}/games?date=${date}`, fetcher);
  const games = data?.games ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <h1 className="text-2xl font-black text-white">경기 일정 · 결과</h1>
        <span className="text-xs text-slate-500">2026 KBO 정규시즌</span>
      </div>

      {/* 날짜 이동 */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        <button
          onClick={() => setDate(addDays(date, -1))}
          className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
        >
          ◀
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-4 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={() => setDate(addDays(date, 1))}
          className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
        >
          ▶
        </button>
        <button
          onClick={() => setDate(todayStr())}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-500 transition-colors"
        >
          오늘
        </button>
        <span className="w-full text-slate-400 text-sm sm:w-auto">{fmtDate(date)}</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-800 border border-slate-700 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16 bg-slate-800 rounded-xl border border-slate-700">
          <p className="text-slate-400">경기 정보를 불러오지 못했습니다.</p>
          <p className="text-slate-600 text-xs mt-2">잠시 후 다시 시도해 주세요.</p>
        </div>
      ) : games.length === 0 ? (
        <div className="text-slate-500 text-center py-16 bg-slate-800 rounded-xl border border-slate-700">
          해당 날짜의 경기가 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {(games as GameResponse[]).map((g) => {
            const isFinal = g.status === "final";
            const homeWin = isFinal && (g.home_score ?? 0) > (g.away_score ?? 0);
            const awayWin = isFinal && (g.away_score ?? 0) > (g.home_score ?? 0);
            return (
              <Link
                key={g.id}
                href={`/games/${g.id}`}
                className="block bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-500 hover:bg-slate-750 transition-colors"
              >
                <div className="flex items-center justify-between">
                  {/* 시간 + 구장 */}
                  <div className="flex flex-col items-center w-16 shrink-0 sm:w-24">
                    <span className="text-slate-300 font-mono text-sm">
                      {g.start_time ? g.start_time.slice(0, 5) : "--:--"}
                    </span>
                    <span className="text-slate-500 text-xs mt-0.5">{g.stadium ?? ""}</span>
                    <span className={`text-xs font-bold mt-1 ${STATUS_COLOR[g.status] ?? "text-slate-400"}`}>
                      {STATUS_LABEL[g.status] ?? g.status}
                    </span>
                  </div>

                  {/* 원정팀 */}
                  <div className="flex flex-col items-center flex-1">
                    <span className={`font-black text-lg ${awayWin ? "text-white" : "text-slate-400"}`}>
                      {g.away_team?.short_name ?? g.away_team?.name ?? "?"}
                    </span>
                    <span className="hidden text-slate-500 text-xs sm:inline">{g.away_team?.name}</span>
                  </div>

                  {/* 점수 */}
                  <div className="flex items-center gap-1 px-1 sm:gap-3 sm:px-4">
                    {isFinal ? (
                      <>
                        <span className={`font-black text-3xl tabular-nums ${awayWin ? "text-white" : "text-slate-500"}`}>
                          {g.away_score}
                        </span>
                        <span className="text-slate-600 font-bold">:</span>
                        <span className={`font-black text-3xl tabular-nums ${homeWin ? "text-white" : "text-slate-500"}`}>
                          {g.home_score}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-500 text-lg font-bold">vs</span>
                    )}
                  </div>

                  {/* 홈팀 */}
                  <div className="flex flex-col items-center flex-1">
                    <span className={`font-black text-lg ${homeWin ? "text-white" : "text-slate-400"}`}>
                      {g.home_team?.short_name ?? g.home_team?.name ?? "?"}
                    </span>
                    <span className="hidden text-slate-500 text-xs sm:inline">{g.home_team?.name}</span>
                  </div>

                  {/* 예측 */}
                  <div className="hidden flex-col items-center w-20 shrink-0 sm:flex">
                    {g.prediction ? (
                      <>
                        <div className="flex w-full h-2 rounded-full overflow-hidden bg-slate-700 mb-1">
                          <div
                            className="bg-blue-500"
                            style={{ width: `${(g.prediction.away_win_prob * 100).toFixed(0)}%` }}
                          />
                        </div>
                        <div className="flex justify-between w-full text-xs">
                          <span className="text-blue-400">{(g.prediction.away_win_prob * 100).toFixed(0)}%</span>
                          <span className="text-red-400">{(g.prediction.home_win_prob * 100).toFixed(0)}%</span>
                        </div>
                        <span className="text-slate-600 text-xs">예측</span>
                      </>
                    ) : (
                      <span className="text-slate-600 text-xs">예측 없음</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
