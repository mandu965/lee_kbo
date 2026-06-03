"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import EloChart from "@/components/EloChart";
import RecentFormBadges from "@/components/RecentFormBadges";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/v1";
const fetcher = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error("err"); return r.json(); });

type Tab = "overview" | "roster" | "games";

const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: "overview", label: "개요" },
  { key: "roster",   label: "로스터" },
  { key: "games",    label: "최근 경기" },
];

function fmtIP(ip: number | null | undefined) {
  if (ip == null) return "-";
  const w = Math.floor(ip), f = Math.round((ip - w) * 3);
  return f === 0 ? `${w}` : f === 1 ? `${w}⅓` : `${w}⅔`;
}

export default function TeamDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [tab, setTab] = useState<Tab>("overview");

  const { data: team } = useSWR(`${BASE}/teams/${id}`, fetcher);
  const { data: recentGames = [] } = useSWR(`${BASE}/teams/${id}/recent?n=10`, fetcher);
  const { data: eloHistory = [] } = useSWR(`${BASE}/teams/${id}/elo-history?limit=30`, fetcher);
  const { data: standings } = useSWR(`${BASE}/teams`, fetcher);
  const { data: roster } = useSWR(tab === "roster" ? `${BASE}/teams/${id}/roster` : null, fetcher);

  if (!team) return <div className="text-slate-500 text-center py-20">로딩 중...</div>;

  const played = (team.wins ?? 0) + (team.losses ?? 0) + (team.draws ?? 0);
  const teamRanking = standings?.find?.((t: any) => t.id === Number(id));

  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* 헤더 */}
      <div className="rounded-2xl p-6" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              {teamRanking?.rank && (
                <span className="text-xs font-black px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}>
                  {teamRanking.rank}위
                </span>
              )}
              <h1 className="text-2xl font-black text-white">{team.name}</h1>
            </div>
            <p className="text-slate-500 text-sm">{team.stadium}</p>
            {teamRanking?.streak && (
              <p className="text-xs mt-1" style={{ color: teamRanking.streak.includes("승") ? "#34d399" : "#f87171" }}>
                {teamRanking.streak} · {teamRanking.last10}
              </p>
            )}
          </div>
          <div className="flex gap-5 text-center">
            {[
              { val: team.wins, label: "승", color: "#34d399" },
              { val: team.losses, label: "패", color: "#f87171" },
              { val: team.draws, label: "무", color: "#64748b" },
              { val: played > 0 ? `${(team.win_rate * 100).toFixed(1)}%` : "-", label: "승률", color: "#a5b4fc" },
              { val: team.elo_rating?.toFixed(0), label: "ELO", color: "#f1f5f9" },
            ].map(({ val, label, color }) => (
              <div key={label}>
                <div className="text-xl font-black" style={{ color }}>{val}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
        {/* 홈/원정 성적 */}
        {teamRanking && (
          <div className="flex gap-4 mt-4 pt-4 border-t border-slate-700/50 text-xs text-slate-500">
            <span>홈 <span className="text-slate-300 font-bold">{teamRanking.home_record}</span></span>
            <span>원정 <span className="text-slate-300 font-bold">{teamRanking.away_record}</span></span>
            <span>GB <span className="text-slate-300 font-bold">{teamRanking.games_behind === 0 ? "-" : teamRanking.games_behind?.toFixed(1)}</span></span>
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "#111827" }}>
        {TAB_LABELS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
            style={tab === key
              ? { background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }
              : { color: "#64748b" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 개요 탭 ─────────────────────────────────────────── */}
      {tab === "overview" && (
        <>
          {eloHistory.length > 0 && (
            <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h2 className="text-sm font-black text-slate-200 mb-4">ELO 변동 추이</h2>
              <EloChart history={eloHistory} teamName={team.name} />
            </div>
          )}

          {/* 최근 폼 배지 */}
          {recentGames.length > 0 && (
            <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h2 className="text-sm font-black text-slate-200 mb-3">최근 {recentGames.length}경기 흐름</h2>
              <div className="flex gap-2 flex-wrap">
                {recentGames.map((g: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] ${
                      g.result === "W" ? "bg-emerald-900/60 text-emerald-400" :
                      g.result === "L" ? "bg-red-900/60 text-red-400" : "bg-slate-700 text-slate-400"
                    }`}>{g.result ?? "D"}</span>
                    <span>{g.opponent_name}</span>
                    <span className="text-slate-600">{g.my_score}-{g.opp_score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 로스터 탭 ────────────────────────────────────────── */}
      {tab === "roster" && (
        roster ? (
          <div className="space-y-4">
            {/* 팀 집계 */}
            <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h2 className="text-sm font-black text-slate-200 mb-3">팀 시즌 집계</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-4 text-center" style={{ background: "#0d1421" }}>
                  <div className="text-xs text-slate-500 mb-2">투수</div>
                  <div className="flex justify-around">
                    <div><div className="text-lg font-black text-red-400">{roster.team_stats.avg_era?.toFixed(2) ?? "-"}</div><div className="text-[10px] text-slate-600">평균 ERA</div></div>
                    <div><div className="text-lg font-black text-slate-200">{roster.team_stats.avg_whip?.toFixed(2) ?? "-"}</div><div className="text-[10px] text-slate-600">평균 WHIP</div></div>
                  </div>
                </div>
                <div className="rounded-xl p-4 text-center" style={{ background: "#0d1421" }}>
                  <div className="text-xs text-slate-500 mb-2">타자</div>
                  <div className="flex justify-around">
                    <div><div className="text-lg font-black text-blue-400">{roster.team_stats.team_ops?.toFixed(3) ?? "-"}</div><div className="text-[10px] text-slate-600">팀 OPS</div></div>
                    <div><div className="text-lg font-black text-emerald-400">{roster.team_stats.team_avg?.toFixed(3) ?? "-"}</div><div className="text-[10px] text-slate-600">팀 타율</div></div>
                  </div>
                </div>
              </div>
            </div>

            {/* 투수 */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="px-4 py-3 border-b border-white/[0.05]">
                <h2 className="text-sm font-black text-slate-200">투수 <span className="text-slate-600 text-xs font-normal">{roster.pitchers.length}명</span></h2>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="text-[10px] text-slate-600 uppercase border-b border-white/[0.03]">
                  <th className="px-3 py-2 text-left">선수</th>
                  <th className="px-3 py-2 text-right">ERA</th>
                  <th className="px-3 py-2 text-right">K/BB</th>
                  <th className="px-3 py-2 text-right">이닝</th>
                  <th className="px-3 py-2 text-right hidden sm:table-cell">승-패</th>
                  <th className="px-3 py-2 text-right hidden sm:table-cell">세-홀</th>
                </tr></thead>
                <tbody>
                  {roster.pitchers.map((p: any) => (
                    <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="px-3 py-2">
                        <Link href={`/player/${p.id}`} className="font-bold text-slate-200 hover:text-indigo-400 transition-colors">
                          {p.name}
                        </Link>
                        {p.injury && <span className="ml-1 text-[9px] text-red-400">부상</span>}
                      </td>
                      <td className={`px-3 py-2 text-right font-bold ${(p.era??99)<=3?"text-emerald-400":(p.era??99)<=4.5?"text-yellow-400":"text-red-400"}`}>{p.era?.toFixed(2)??"-"}</td>
                      <td className="px-3 py-2 text-right text-slate-300">{p.k_bb?.toFixed(1)??"-"}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{fmtIP(p.innings_pitched)}</td>
                      <td className="px-3 py-2 text-right text-slate-400 hidden sm:table-cell">{p.wins??0}-{p.losses??0}</td>
                      <td className="px-3 py-2 text-right text-slate-400 hidden sm:table-cell">{p.saves??0}-{p.holds??0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 타자 */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="px-4 py-3 border-b border-white/[0.05]">
                <h2 className="text-sm font-black text-slate-200">타자 <span className="text-slate-600 text-xs font-normal">{roster.batters.length}명</span></h2>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="text-[10px] text-slate-600 uppercase border-b border-white/[0.03]">
                  <th className="px-3 py-2 text-left">선수</th>
                  <th className="px-3 py-2 text-right">타율</th>
                  <th className="px-3 py-2 text-right">OPS</th>
                  <th className="px-3 py-2 text-right">홈런</th>
                  <th className="px-3 py-2 text-right hidden sm:table-cell">타점</th>
                  <th className="px-3 py-2 text-right hidden sm:table-cell">타석</th>
                </tr></thead>
                <tbody>
                  {roster.batters.map((b: any) => (
                    <tr key={b.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="px-3 py-2">
                        <Link href={`/player/${b.id}`} className="font-bold text-slate-200 hover:text-indigo-400 transition-colors">
                          {b.name}
                        </Link>
                        {b.injury && <span className="ml-1 text-[9px] text-red-400">부상</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-400">{b.avg?.toFixed(3)??"-"}</td>
                      <td className="px-3 py-2 text-right font-bold text-blue-400">{b.ops?.toFixed(3)??"-"}</td>
                      <td className="px-3 py-2 text-right text-amber-400 font-bold">{b.home_runs??"-"}</td>
                      <td className="px-3 py-2 text-right text-slate-400 hidden sm:table-cell">{b.rbi??"-"}</td>
                      <td className="px-3 py-2 text-right text-slate-400 hidden sm:table-cell">{b.plate_app??"-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-center py-10">로딩 중...</div>
        )
      )}

      {/* ── 최근 경기 탭 ─────────────────────────────────────── */}
      {tab === "games" && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-600 uppercase border-b border-white/[0.05]">
                <th className="px-4 py-3 text-left">날짜</th>
                <th className="px-4 py-3 text-left">상대</th>
                <th className="px-4 py-3 text-center">H/A</th>
                <th className="px-4 py-3 text-center">결과</th>
                <th className="px-4 py-3 text-center">스코어</th>
              </tr>
            </thead>
            <tbody>
              {recentGames.map((g: any, i: number) => (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-slate-500 text-xs tabular-nums">{g.game_date?.slice(5)}</td>
                  <td className="px-4 py-2.5 text-slate-200 font-medium">{g.opponent_name}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${g.is_home ? "bg-indigo-900/40 text-indigo-400" : "bg-slate-700/50 text-slate-500"}`}>
                      {g.is_home ? "홈" : "원정"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center font-black text-sm">
                    <span className={g.result==="W"?"text-emerald-400":g.result==="L"?"text-red-400":"text-slate-500"}>
                      {g.result ?? "-"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-slate-300 text-xs">
                    {g.my_score !== null && g.opp_score !== null ? `${g.my_score}-${g.opp_score}` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
