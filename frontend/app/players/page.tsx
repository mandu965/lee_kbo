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
type SortOrder = "asc" | "desc";

const BATTER_SORTS = [
  { key: "ops", label: "OPS", defaultOrder: "desc" },
  { key: "avg", label: "타율", defaultOrder: "desc" },
  { key: "hr", label: "홈런", defaultOrder: "desc" },
  { key: "rbi", label: "타점", defaultOrder: "desc" },
  { key: "hits", label: "안타", defaultOrder: "desc" },
  { key: "runs", label: "득점", defaultOrder: "desc" },
] as const;

const PITCHER_SORTS = [
  { key: "era", label: "ERA", defaultOrder: "asc" },
  { key: "wins", label: "승", defaultOrder: "desc" },
  { key: "strikeouts", label: "탈삼진", defaultOrder: "desc" },
  { key: "whip", label: "WHIP", defaultOrder: "asc" },
  { key: "hits", label: "피안타", defaultOrder: "asc" },
  { key: "hr", label: "피홈런", defaultOrder: "asc" },
  { key: "runs", label: "실점", defaultOrder: "asc" },
  { key: "earned_runs", label: "자책점", defaultOrder: "asc" },
  { key: "walks", label: "볼넷", defaultOrder: "asc" },
  { key: "hbp", label: "사구", defaultOrder: "asc" },
  { key: "saves", label: "세이브", defaultOrder: "desc" },
  { key: "holds", label: "홀드", defaultOrder: "desc" },
] as const;

const TEAMS = [
  { code: "", label: "전체 팀" },
  { code: "SS", label: "삼성" },
  { code: "LG", label: "LG" },
  { code: "KT", label: "KT" },
  { code: "KIA", label: "KIA" },
  { code: "HH", label: "한화" },
  { code: "OB", label: "두산" },
  { code: "SSG", label: "SSG" },
  { code: "LT", label: "롯데" },
  { code: "NC", label: "NC" },
  { code: "WO", label: "키움" },
];

function fmt(v: number | null | undefined, digits = 3): string {
  if (v == null) return "-";
  return v.toFixed(digits);
}

function cellValue(v: number | null | undefined) {
  return v ?? "-";
}

function toggleOrder(order: SortOrder): SortOrder {
  return order === "asc" ? "desc" : "asc";
}

function orderLabel(order: SortOrder) {
  return order === "asc" ? "오름차순" : "내림차순";
}

function orderMark(order: SortOrder) {
  return order === "asc" ? "↑" : "↓";
}

export default function PlayersPage() {
  const [tab, setTab] = useState<"batters" | "pitchers">("batters");
  const [batterSort, setBatterSort] = useState("ops");
  const [batterOrder, setBatterOrder] = useState<SortOrder>("desc");
  const [pitcherSort, setPitcherSort] = useState("era");
  const [pitcherOrder, setPitcherOrder] = useState<SortOrder>("asc");
  const [team, setTeam] = useState("");

  const batterUrl = `${BASE}/stats/batters?sort=${batterSort}&order=${batterOrder}&limit=50${team ? `&team=${team}` : ""}`;
  const pitcherUrl = `${BASE}/stats/pitchers?sort=${pitcherSort}&order=${pitcherOrder}&limit=50${team ? `&team=${team}` : ""}`;

  const { data: batters = [] } = useSWR<BatterRankingItem[]>(tab === "batters" ? batterUrl : null, fetcher);
  const { data: pitchers = [] } = useSWR<PitcherRankingItem[]>(tab === "pitchers" ? pitcherUrl : null, fetcher);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">선수 기록</h1>
        <span className="text-xs text-slate-500">2026 KBO 정규시즌</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-slate-700">
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

        <div className="flex flex-wrap gap-1.5">
          {tab === "batters"
            ? BATTER_SORTS.map((sort) => {
                const active = batterSort === sort.key;
                return (
                  <button
                    key={sort.key}
                    title={active ? orderLabel(batterOrder) : orderLabel(sort.defaultOrder)}
                    onClick={() => {
                      if (active) {
                        setBatterOrder(toggleOrder(batterOrder));
                      } else {
                        setBatterSort(sort.key);
                        setBatterOrder(sort.defaultOrder);
                      }
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      active
                        ? "bg-emerald-600 text-white"
                        : "border border-slate-700 bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {sort.label} {active ? orderMark(batterOrder) : ""}
                  </button>
                );
              })
            : PITCHER_SORTS.map((sort) => {
                const active = pitcherSort === sort.key;
                return (
                  <button
                    key={sort.key}
                    title={active ? orderLabel(pitcherOrder) : orderLabel(sort.defaultOrder)}
                    onClick={() => {
                      if (active) {
                        setPitcherOrder(toggleOrder(pitcherOrder));
                      } else {
                        setPitcherSort(sort.key);
                        setPitcherOrder(sort.defaultOrder);
                      }
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      active
                        ? "bg-emerald-600 text-white"
                        : "border border-slate-700 bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {sort.label} {active ? orderMark(pitcherOrder) : ""}
                  </button>
                );
              })}
        </div>

        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="ml-auto rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300"
        >
          {TEAMS.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {tab === "batters" && (
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase text-slate-400">
                <th className="w-8 px-3 py-3 text-center">#</th>
                <th className="px-3 py-3 text-left">선수</th>
                <th className="px-3 py-3 text-center">팀</th>
                <th className="px-3 py-3 text-right">경기</th>
                <th className="px-3 py-3 text-right font-bold text-emerald-400">타율</th>
                <th className="px-3 py-3 text-right">안타</th>
                <th className="px-3 py-3 text-right">홈런</th>
                <th className="px-3 py-3 text-right">타점</th>
                <th className="px-3 py-3 text-right">볼넷</th>
                <th className="px-3 py-3 text-right">삼진</th>
                <th className="px-3 py-3 text-right">출루율</th>
                <th className="px-3 py-3 text-right">장타율</th>
                <th className="px-3 py-3 text-right font-bold text-blue-400">OPS</th>
              </tr>
            </thead>
            <tbody>
              {batters.map((batter) => (
                <tr key={batter.player_id} className="border-b border-slate-700/40 transition-colors hover:bg-slate-700/30">
                  <td className="px-3 py-2.5 text-center text-xs text-slate-500">{batter.rank}</td>
                  <td className="px-3 py-2.5 font-bold">
                    <Link href={`/player/${batter.player_id}`} className="text-slate-100 transition-colors hover:text-indigo-400">
                      {batter.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-bold text-slate-300">{batter.team_code}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400">{cellValue(batter.games)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-400">{fmt(batter.avg)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{cellValue(batter.hits)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-400">{cellValue(batter.home_runs)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{cellValue(batter.rbi)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400">{cellValue(batter.walks)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400">{cellValue(batter.strikeouts)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400">{fmt(batter.obp)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400">{fmt(batter.slg)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-blue-400">{fmt(batter.ops)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "pitchers" && (
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase text-slate-400">
                <th className="w-8 px-3 py-3 text-center">#</th>
                <th className="px-3 py-3 text-left">선수</th>
                <th className="px-3 py-3 text-center">팀</th>
                <th className="px-3 py-3 text-right">경기</th>
                <th className="px-3 py-3 text-right">승</th>
                <th className="px-3 py-3 text-right">패</th>
                <th className="px-3 py-3 text-right">세</th>
                <th className="px-3 py-3 text-right">홀</th>
                <th className="px-3 py-3 text-right font-bold text-emerald-400">ERA</th>
                <th className="px-3 py-3 text-right">이닝</th>
                <th className="px-3 py-3 text-right">삼진</th>
                <th className="px-3 py-3 text-right">피안타</th>
                <th className="px-3 py-3 text-right">피홈런</th>
                <th className="px-3 py-3 text-right">실점</th>
                <th className="px-3 py-3 text-right">자책점</th>
                <th className="px-3 py-3 text-right">볼넷</th>
                <th className="px-3 py-3 text-right">사구</th>
                <th className="px-3 py-3 text-right font-bold text-blue-400">WHIP</th>
              </tr>
            </thead>
            <tbody>
              {pitchers.map((pitcher) => (
                <tr key={pitcher.player_id} className="border-b border-slate-700/40 transition-colors hover:bg-slate-700/30">
                  <td className="px-3 py-2.5 text-center text-xs text-slate-500">{pitcher.rank}</td>
                  <td className="px-3 py-2.5 font-bold">
                    <Link href={`/player/${pitcher.player_id}`} className="text-slate-100 transition-colors hover:text-indigo-400">
                      {pitcher.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-bold text-slate-300">{pitcher.team_code}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400">{cellValue(pitcher.games)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-blue-400">{cellValue(pitcher.wins)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-red-400">{cellValue(pitcher.losses)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-purple-400">{cellValue(pitcher.saves)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-400">{cellValue(pitcher.holds)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-400">{fmt(pitcher.era, 2)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                    {pitcher.innings_pitched != null ? pitcher.innings_pitched.toFixed(1) : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{cellValue(pitcher.strikeouts)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{cellValue(pitcher.hits)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{cellValue(pitcher.home_runs_allowed)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-orange-300">{cellValue(pitcher.runs)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-orange-400">{cellValue(pitcher.earned_runs)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{cellValue(pitcher.walks)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{cellValue(pitcher.hbp)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-blue-400">{fmt(pitcher.whip)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        KBO 공식 기록 기준 ·{" "}
        {team
          ? "선택 팀 전체 선수 표시"
          : tab === "batters"
            ? "전체 순위: PA 50 이상"
            : ["era", "whip", "ip"].includes(pitcherSort)
              ? "전체 순위: 30이닝 이상"
              : "전체 순위: 10이닝 이상"}{" "}
        · 정렬:{" "}
        {tab === "batters"
          ? `${BATTER_SORTS.find((sort) => sort.key === batterSort)?.label} ${orderLabel(batterOrder)}`
          : `${PITCHER_SORTS.find((sort) => sort.key === pitcherSort)?.label} ${orderLabel(pitcherOrder)}`}
      </p>
    </div>
  );
}
