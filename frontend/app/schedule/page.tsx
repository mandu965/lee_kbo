"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { GameListResponse, GameResponse } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8002/v1";

async function fetcher<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`API error ${res.status}`);
    }
    return res.json() as Promise<T>;
  } finally {
    window.clearTimeout(timer);
  }
}

function todayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
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
  const apiUrl = `${BASE}/games?date=${date}&summary=true`;
  const { data, isLoading, error, mutate } = useSWR<GameListResponse>(apiUrl, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  const games = data?.games ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-white">경기 일정 · 결과</h1>
        <span className="text-xs text-slate-500">2026 KBO 정규시즌</span>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 sm:gap-3">
        <button
          onClick={() => setDate(addDays(date, -1))}
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
          aria-label="이전 날짜"
        >
          ◀
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={() => setDate(addDays(date, 1))}
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
          aria-label="다음 날짜"
        >
          ▶
        </button>
        <button
          onClick={() => setDate(todayStr())}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-500"
        >
          오늘
        </button>
        <span className="w-full text-sm text-slate-400 sm:w-auto">{fmtDate(date)}</span>
      </div>

      {isLoading && games.length === 0 ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-700 bg-slate-800" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800 py-16 text-center">
          <p className="text-slate-300">경기 정보를 불러오지 못했습니다.</p>
          <p className="mt-2 text-xs text-slate-600">잠시 후 다시 시도해 주세요.</p>
          <button
            onClick={() => mutate()}
            className="mt-4 rounded-lg bg-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-600"
          >
            다시 불러오기
          </button>
        </div>
      ) : games.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800 py-16 text-center text-slate-500">
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
                className="block rounded-xl border border-slate-700 bg-slate-800 p-4 transition-colors hover:border-slate-500 hover:bg-slate-750"
              >
                <div className="flex items-center justify-between">
                  <div className="flex w-16 shrink-0 flex-col items-center sm:w-24">
                    <span className="font-mono text-sm text-slate-300">
                      {g.start_time ? g.start_time.slice(0, 5) : "--:--"}
                    </span>
                    <span className="mt-0.5 text-xs text-slate-500">{g.stadium ?? ""}</span>
                    <span className={`mt-1 text-xs font-bold ${STATUS_COLOR[g.status] ?? "text-slate-400"}`}>
                      {STATUS_LABEL[g.status] ?? g.status}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col items-center">
                    <span className={`text-lg font-black ${awayWin ? "text-white" : "text-slate-400"}`}>
                      {g.away_team?.short_name ?? g.away_team?.name ?? "?"}
                    </span>
                    <span className="hidden text-xs text-slate-500 sm:inline">{g.away_team?.name}</span>
                  </div>

                  <div className="flex items-center gap-1 px-1 sm:gap-3 sm:px-4">
                    {isFinal ? (
                      <>
                        <span className={`tabular-nums text-3xl font-black ${awayWin ? "text-white" : "text-slate-500"}`}>
                          {g.away_score}
                        </span>
                        <span className="font-bold text-slate-600">:</span>
                        <span className={`tabular-nums text-3xl font-black ${homeWin ? "text-white" : "text-slate-500"}`}>
                          {g.home_score}
                        </span>
                      </>
                    ) : (
                      <span className="text-lg font-bold text-slate-500">vs</span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col items-center">
                    <span className={`text-lg font-black ${homeWin ? "text-white" : "text-slate-400"}`}>
                      {g.home_team?.short_name ?? g.home_team?.name ?? "?"}
                    </span>
                    <span className="hidden text-xs text-slate-500 sm:inline">{g.home_team?.name}</span>
                  </div>

                  <div className="hidden w-20 shrink-0 flex-col items-center sm:flex">
                    {g.prediction ? (
                      <>
                        <div className="mb-1 flex h-2 w-full overflow-hidden rounded-full bg-slate-700">
                          <div
                            className="bg-blue-500"
                            style={{ width: `${(g.prediction.away_win_prob * 100).toFixed(0)}%` }}
                          />
                        </div>
                        <div className="flex w-full justify-between text-xs">
                          <span className="text-blue-400">{(g.prediction.away_win_prob * 100).toFixed(0)}%</span>
                          <span className="text-red-400">{(g.prediction.home_win_prob * 100).toFixed(0)}%</span>
                        </div>
                        <span className="text-xs text-slate-600">예측</span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-600">예측 없음</span>
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
