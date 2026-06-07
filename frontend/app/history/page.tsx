"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import type { AccuracyResponse, MonthlyAccuracy, PredictionHistoryItem } from "@/lib/types";

const BASE =
  (typeof window === "undefined"
    ? (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL)
    : process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:8002/v1";
const fetcher = <T,>(url: string): Promise<T> => fetch(url).then((r) => r.json());

const MONTH_NAMES = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const CURRENT_MONTH = new Date().getMonth() + 1;
const SEASON_MONTHS = Array.from({ length: CURRENT_MONTH }, (_, i) => i + 1);

export default function HistoryPage() {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const historyUrl = selectedMonth
    ? `${BASE}/predictions/history?month=${selectedMonth}&limit=100`
    : `${BASE}/predictions/history?limit=100`;

  const { data: history = [], isLoading } = useSWR<PredictionHistoryItem[]>(historyUrl, fetcher, { refreshInterval: 60000 });
  const { data: accuracy } = useSWR<AccuracyResponse>(`${BASE}/predictions/accuracy`, fetcher, { refreshInterval: 60000 });
  const { data: perf } = useSWR<any>(`${BASE}/predictions/performance`, fetcher, { refreshInterval: 60000 });
  const { data: monthly = [] } = useSWR<MonthlyAccuracy[]>(`${BASE}/predictions/history/monthly`, fetcher, { refreshInterval: 60000 });

  // 날짜별 그룹핑
  const grouped: Record<string, typeof history> = {};
  for (const item of history) {
    const key = item.game_date?.slice(0, 10) ?? "unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // 누적 적중률 계산 (시간순)
  const settled = [...history].filter((h) => h.is_correct !== null).reverse();
  let cumCorrect = 0;
  const cumData = settled.map((h, i) => {
    if (h.is_correct) cumCorrect++;
    return { idx: i + 1, pct: Math.round((cumCorrect / (i + 1)) * 100) };
  });

  const totalSettled = history.filter((h) => h.is_correct !== null).length;
  const totalCorrect = history.filter((h) => h.is_correct === true).length;
  const currentPct = totalSettled > 0 ? Math.round((totalCorrect / totalSettled) * 100) : null;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-white">예측 히스토리</h1>
        {accuracy && accuracy.total > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">시즌 적중률</span>
            <span className={`text-xl font-black ${
              accuracy.accuracy >= 0.6 ? "text-emerald-400" :
              accuracy.accuracy >= 0.5 ? "text-yellow-400" : "text-red-400"
            }`}>
              {Math.round(accuracy.accuracy * 100)}%
            </span>
            <span className="text-xs text-slate-600">({accuracy.total}경기)</span>
          </div>
        )}
      </div>

      {/* 월별 적중률 탭 */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-300">월별 적중률</h2>
          <button
            onClick={() => setSelectedMonth(null)}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${
              selectedMonth === null
                ? "bg-blue-600 text-white font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            전체
          </button>
        </div>
        <div className="flex gap-3 flex-wrap">
          {SEASON_MONTHS.map((m) => {
            const mData = monthly.find((x) => x.month === m);
            const pct = mData ? Math.round(mData.accuracy * 100) : null;
            const isSelected = selectedMonth === m;
            return (
              <button
                key={m}
                onClick={() => setSelectedMonth(isSelected ? null : m)}
                className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-900/30"
                    : "border-slate-700 hover:border-slate-500"
                }`}
              >
                <span className={`text-sm font-black ${
                  pct === null ? "text-slate-600" :
                  pct >= 60 ? "text-emerald-400" :
                  pct >= 50 ? "text-yellow-400" : "text-red-400"
                }`}>
                  {pct !== null ? `${pct}%` : "-"}
                </span>
                <span className="text-xs text-slate-500">{MONTH_NAMES[m - 1]}</span>
                {mData && (
                  <span className="text-[10px] text-slate-600">{mData.total}경기</span>
                )}
              </button>
            );
          })}
        </div>
      </div>


      {/* 모델 성과 지표 */}
      {perf && perf.total > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-4">모델 성과 지표</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Accuracy", value: `${Math.round(perf.accuracy*100)}%`, sub: "승패 적중률", color: perf.accuracy>=0.6?"text-emerald-400":perf.accuracy>=0.5?"text-yellow-400":"text-red-400" },
              { label: "Brier Score", value: perf.avg_brier?.toFixed(3)??"-", sub: "낮을수록 정확", color: (perf.avg_brier??1)<=0.2?"text-emerald-400":"text-slate-200" },
              { label: "Log Loss", value: perf.avg_log_loss?.toFixed(3)??"-", sub: "확신 오답 패널티", color: "text-slate-200" },
              { label: "Coverage", value: `${Math.round((perf.coverage??0)*100)}%`, sub: "예측 보유율", color: "text-indigo-400" },
            ].map(m => (
              <div key={m.label} className="bg-slate-900/50 rounded-xl p-3 text-center">
                <div className={`text-xl font-black ${m.color}`}>{m.value}</div>
                <div className="text-xs font-bold text-slate-400 mt-0.5">{m.label}</div>
                <div className="text-[10px] text-slate-600">{m.sub}</div>
              </div>
            ))}
          </div>
          {perf.calibration && perf.calibration.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Calibration — 예측% vs 실제 적중%</p>
              <div className="flex gap-2 flex-wrap">
                {perf.calibration.map((c: any) => (
                  <div key={c.bucket} className="text-center">
                    <div className="text-[10px] text-slate-500 mb-1">{c.bucket}</div>
                    <div className="flex flex-col gap-1 items-center">
                      <div className="w-8 bg-indigo-900/40 rounded-sm" style={{ height: `${Math.max(4, c.predicted_pct)}px` }} title={`예측 ${c.predicted_pct}%`} />
                      <div className="w-8 bg-emerald-900/40 rounded-sm" style={{ height: `${Math.max(4, c.actual_pct)}px` }} title={`실제 ${c.actual_pct}%`} />
                    </div>
                    <div className="text-[9px] text-slate-600 mt-1">{c.count}건</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-2 text-[10px] text-slate-600">
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-800 rounded-sm inline-block" />예측</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-800 rounded-sm inline-block" />실제</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 간단 누적 적중률 바 */}
      {cumData.length > 1 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-300">
              {selectedMonth ? `${MONTH_NAMES[selectedMonth - 1]} ` : ""}누적 적중률 추이
            </h2>
            {currentPct !== null && (
              <span className={`text-sm font-black ${
                currentPct >= 60 ? "text-emerald-400" :
                currentPct >= 50 ? "text-yellow-400" : "text-red-400"
              }`}>
                현재 {currentPct}%
              </span>
            )}
          </div>
          {/* 단순 bar chart */}
          <div className="flex items-end gap-1 h-16">
            {cumData.map((d, i) => (
              <div
                key={i}
                className="flex-1 min-w-0 rounded-t"
                style={{ height: `${d.pct}%` }}
                title={`${i + 1}경기 후: ${d.pct}%`}
              >
                <div
                  className={`w-full h-full rounded-t transition-colors ${
                    d.pct >= 60 ? "bg-emerald-500/70" :
                    d.pct >= 50 ? "bg-yellow-500/70" : "bg-red-500/70"
                  }`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>1경기</span>
            <span>50% 기준선</span>
            <span>{cumData.length}경기</span>
          </div>
        </div>
      )}

      {/* 예측 목록 — 날짜별 그룹 */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-slate-500 text-center py-12">로딩 중...</div>
        ) : dates.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center text-slate-500">
            {selectedMonth ? `${MONTH_NAMES[selectedMonth - 1]} 예측 데이터가 없습니다.` : "예측 데이터가 없습니다."}
          </div>
        ) : (
          dates.map((date) => {
            const items = grouped[date];
            const daySettled = items.filter((h: any) => h.is_correct !== null);
            const dayCorrect = daySettled.filter((h: any) => h.is_correct === true).length;
            const dayPct = daySettled.length > 0
              ? Math.round((dayCorrect / daySettled.length) * 100)
              : null;

            return (
              <div key={date} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                {/* 날짜 헤더 */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700 bg-slate-800/80">
                  <span className="text-sm font-bold text-slate-300">
                    {date.slice(5).replace("-", "월 ")}일
                  </span>
                  {dayPct !== null && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      dayPct >= 60 ? "bg-emerald-900/50 text-emerald-400" :
                      dayPct >= 50 ? "bg-yellow-900/50 text-yellow-400" :
                      "bg-red-900/50 text-red-400"
                    }`}>
                      {dayCorrect}/{daySettled.length} ({dayPct}%)
                    </span>
                  )}
                </div>

                {/* 경기 목록 */}
                <table className="w-full text-sm">
                  <tbody>
                    {items.map((item: any) => (
                      <tr key={item.game_id} className="border-b border-slate-700/30 last:border-0 hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 w-8">
                          {item.is_correct === null ? (
                            <span className="text-slate-600 text-base">·</span>
                          ) : item.is_correct ? (
                            <span className="text-emerald-400 font-bold text-base">✓</span>
                          ) : (
                            <span className="text-red-400 font-bold text-base">✗</span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-slate-200 font-medium">
                          <Link href={`/games/${item.game_id}`} className="hover:text-blue-400 transition-colors">
                            {item.away_team} @ {item.home_team}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-right text-xs text-slate-500 hidden sm:table-cell whitespace-nowrap">
                          홈 {Math.round(item.home_win_prob * 100)}%
                        </td>
                        <td className="px-3 py-3 text-right text-xs whitespace-nowrap">
                          <span className="text-slate-400">예측 </span>
                          <span className="text-slate-200 font-medium">{item.predicted_winner ?? "-"}</span>
                        </td>
                        <td className="px-3 py-3 text-right text-xs whitespace-nowrap">
                          {item.actual_winner ? (
                            <>
                              <span className="text-slate-500">결과 </span>
                              <span className={item.is_correct ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                                {item.actual_winner}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-600">미정</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </div>

      {/* 데이터 안내 */}
      <p className="text-xs text-slate-600 text-center pb-4">
        매일 23:30 경기 결과 수집 · 23:50 자동 정산 · 데이터는 1분마다 갱신됩니다
      </p>
    </div>
  );
}
