"use client";

import { useEffect, useState } from "react";

interface WinProbBarProps {
  homeProb: number;
  awayProb: number;
  homeTeamName: string;
  awayTeamName: string;
}

// 표시 방향: 왼쪽=원정(파란색), 오른쪽=홈(빨간색) — 팀 배치와 일치
export default function WinProbBar({
  homeProb,
  awayProb,
  homeTeamName,
  awayTeamName,
}: WinProbBarProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, []);

  const homePct = Math.round(homeProb * 100);
  const awayPct = Math.round(awayProb * 100);

  // 왼쪽=원정, 오른쪽=홈
  const awayWidth = animated ? `${awayPct}%` : "50%";
  const homeWidth = animated ? `${homePct}%` : "50%";

  const awayFav = awayProb > homeProb;

  return (
    <div className="w-full">
      {/* 퍼센트 라벨 — 왼쪽=원정, 오른쪽=홈 */}
      <div className="flex justify-between mb-1 text-sm font-bold">
        <span className={awayFav ? "text-blue-400" : "text-slate-400"}>
          {awayPct}%
        </span>
        <span className="text-slate-500 text-xs self-center">예측 승률</span>
        <span className={!awayFav ? "text-red-400" : "text-slate-400"}>
          {homePct}%
        </span>
      </div>

      {/* 바: 왼쪽=원정(파란색), 오른쪽=홈(빨간색) */}
      <div className="flex h-4 rounded-full overflow-hidden bg-slate-700">
        <div
          className="bg-blue-500 transition-all duration-700 ease-out"
          style={{ width: awayWidth }}
        />
        <div
          className="bg-red-500 transition-all duration-700 ease-out"
          style={{ width: homeWidth }}
        />
      </div>

      {/* 팀명 — 왼쪽=원정, 오른쪽=홈 */}
      <div className="flex justify-between mt-1 text-xs text-slate-400">
        <span>{awayTeamName} <span className="text-slate-600">(원정)</span></span>
        <span><span className="text-slate-600">(홈)</span> {homeTeamName}</span>
      </div>
    </div>
  );
}
