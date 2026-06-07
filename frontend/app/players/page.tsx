"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import type { BatterRankingItem, PitcherRankingItem } from "@/lib/types";

const BASE =
  (typeof window === "undefined"
    ? (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL)
    : process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:8002/v1";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

const BATTER_SORTS = [
  { key: "ops", label: "OPS" },
  { key: "avg", label: "타율" },
  { key: "hr", label: "홈런" },
  { key: "rbi", label: "타점" },
  { key: "hits", label: "안타" },
  { key: "runs", label: "득점" },
] as const;

const PITCHER_SORTS = [
  { key: "era", label: "ERA" },
  { key: "wins", label: "승" },
  { key: "strikeouts", label: "탈삼진" },
  { key: "whip", label: "WHIP" },
  { key: "saves", label: "세이브" },
  { key: "holds", label: "홀드" },
] as const;

const TEAMS = [
  { code: "", label: "전체 팀" },
  { code: "SS", label: "삼성" }, { code: "LG", label: "LG" },
  { code: "KT", label: "KT" }, { code: "KIA", label: "KIA" },
  { code: "HH", label: "한화" }, { code: "OB", label: "두산" },
  { code: "SSG", label: "SSG" }, { code: "LT", label: "롯데" },
  { code: "NC", label: "NC" }, { code: "WO", label: "키움" },
];

function fmt(v: number | null | undefined, digits = 3): string {
  if (v == null) return "-";
  return v.toFixed(digits);
}

export default function PlayersPage() {
  const [tab, setTab] = useState<"batters" | "pitchers">("batters");
  const [batterSort, setBatterSort] = useState("ops");
  const [pitcherSort, setPitcherSort] = useState("era");
  const [team, setTeam] = useState("");

  const batterUrl = `${BASE}/stats/batters?sort=${batterSort}&limit=50${team ? `&team=${team}` : ""}`;
  const pitcherUrl = `${BASE}/stats/pitchers?sort=${pitcherSort}&limit=50${team ? `&team=${team}` : ""}`;

  const { data: batters = [] } = useSWR(tab === "batters" ? batterUrl : null, fetcher);
  const { data: pitchers = [] } = useSWR(tab === "pitchers" ? pitcherUrl : null, fetcher);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white">선수 기록</h1>
        <span className="text-xs text-slate-500">2026 KBO 정규시즌</span>
      </div>

      {/* 탭 + 필터 */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          <button
            onClick={() => setTab("batters")}
            className={`px-4 py-2 text-sm font-bold transition-colors ${
              tab === "batters" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            타자
          </button>
          <button
            onClick={() => setTab("pitchers")}
            className={`px-4 py-2 text-sm font-bold transition-colors ${
              tab === "pitchers" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            투수
          </button>
        </div>

        {/* 정렬 기준 */}
        <div className="flex flex-wrap gap-1.5">
          {(tab === "batters" ? BATTER_SORTS : PITCHER_SORTS).map((s) => (
            <button
              key={s.key}
              onClick={() => tab === "batters" ? setBatterSort(s.key) : setPitcherSort(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                (tab === "batters" ? batterSort : pitcherSort) === s.key
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 border border-slate-700 text-slate-400 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* 팀 필터 */}
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-1.5 ml-auto"
        >
          {TEAMS.map((t) => (
            <option key={t.code} value={t.code}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* 타자 테이블 */}
      {tab === "batters" && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase">
                <th className="px-3 py-3 text-center w-8">#</th>
                <th className="px-3 py-3 text-left">선수</th>
                <th className="px-3 py-3 text-center">팀</th>
                <th className="px-3 py-3 text-right">경기</th>
                <th className="px-3 py-3 text-right font-bold text-emerald-400">타율</th>
                <th className="px-3 py-3 text-right">안타</th>
                <th className="px-3 py-3 text-right">홈런</th>
                <th className="px-3 py-3 text-right">타점</th>
                <th className="px-3 py-3 text-right">볼넷</th>
                <th className="px-3 py-3 text-right hidden lg:table-cell">출루율</th>
                <th className="px-3 py-3 text-right hidden lg:table-cell">장타율</th>
                <th className="px-3 py-3 text-right font-bold text-blue-400">OPS</th>
              </tr>
            </thead>
            <tbody>
              {(batters as BatterRankingItem[]).map((b) => (
                <tr key={b.player_id} className="border-b border-slate-700/40 hover:bg-slate-700/30 transition-colors">
                  <td className="px-3 py-2.5 text-center text-slate-500 text-xs">{b.rank}</td>
                  <td className="px-3 py-2.5 font-bold"><Link href={`/player/${b.player_id}`} className="text-slate-100 hover:text-indigo-400 transition-colors">{b.name}</Link></td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded font-bold">{b.team_code}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400">{b.games ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-400">{fmt(b.avg)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{b.hits ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-400">{b.home_runs ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{b.rbi ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400">{b.walks ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400 hidden lg:table-cell">{fmt(b.obp)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400 hidden lg:table-cell">{fmt(b.slg)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-blue-400">{fmt(b.ops)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 투수 테이블 */}
      {tab === "pitchers" && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase">
                <th className="px-3 py-3 text-center w-8">#</th>
                <th className="px-3 py-3 text-left">선수</th>
                <th className="px-3 py-3 text-center">팀</th>
                <th className="px-3 py-3 text-right">경기</th>
                <th className="px-3 py-3 text-right">승</th>
                <th className="px-3 py-3 text-right">패</th>
                <th className="px-3 py-3 text-right">세</th>
                <th className="px-3 py-3 text-right">홀</th>
                <th className="px-3 py-3 text-right font-bold text-emerald-400">ERA</th>
                <th className="px-3 py-3 text-right hidden md:table-cell">이닝</th>
                <th className="px-3 py-3 text-right hidden md:table-cell">삼진</th>
                <th className="px-3 py-3 text-right font-bold text-blue-400">WHIP</th>
              </tr>
            </thead>
            <tbody>
              {(pitchers as PitcherRankingItem[]).map((p) => (
                <tr key={p.player_id} className="border-b border-slate-700/40 hover:bg-slate-700/30 transition-colors">
                  <td className="px-3 py-2.5 text-center text-slate-500 text-xs">{p.rank}</td>
                  <td className="px-3 py-2.5 font-bold"><Link href={`/player/${p.player_id}`} className="text-slate-100 hover:text-indigo-400 transition-colors">{p.name}</Link></td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded font-bold">{p.team_code}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400">{p.games ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-blue-400">{p.wins ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-red-400">{p.losses ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-purple-400">{p.saves ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-400">{p.holds ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-400">{fmt(p.era, 2)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300 hidden md:table-cell">
                    {p.innings_pitched != null ? p.innings_pitched.toFixed(1) : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300 hidden md:table-cell">{p.strikeouts ?? "-"}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-blue-400">{fmt(p.whip)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        KBO 공식 기록 기준 ·{" "}
        {team
          ? "팀 선택 시 전체 선수 표시"
          : tab === "batters"
          ? "전체 순위: PA 50 이상"
          : ["era","whip","ip"].includes(pitcherSort)
          ? "전체 순위: 30이닝 이상 (선발 기준)"
          : "전체 순위: 10이닝 이상"}{" "}
        · 정렬: {tab === "batters" ? BATTER_SORTS.find(s => s.key === batterSort)?.label : PITCHER_SORTS.find(s => s.key === pitcherSort)?.label}
      </p>
    </div>
  );
}
