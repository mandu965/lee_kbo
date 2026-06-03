"use client";

import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/v1";
const fetcher = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error("not found"); return r.json(); });

function fmtIP(ip: number | null | undefined): string {
  if (ip == null) return "-";
  const whole = Math.floor(ip);
  const frac = Math.round((ip - whole) * 3);
  if (frac === 0) return `${whole}`;
  if (frac === 1) return `${whole}⅓`;
  if (frac === 2) return `${whole}⅔`;
  return ip.toFixed(1);
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: "#0d1421" }}>
      <div className={`text-2xl font-black ${color ?? "text-slate-100"}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

export default function PlayerDetailPage() {
  const params = useParams();
  const id = params.id;
  const { data, error, isLoading } = useSWR(`${BASE}/player/${id}`, fetcher);

  if (isLoading) return <div className="text-slate-500 text-center py-20">로딩 중...</div>;
  if (error || !data) return <div className="text-slate-500 text-center py-20">선수 정보를 찾을 수 없습니다.</div>;

  const p = data.pitcher_stats;
  const b = data.batter_stats;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* 프로필 헤더 */}
      <div className="rounded-2xl p-6" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black"
            style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
            {data.name.charAt(0)}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-white">{data.name}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
              {data.team_id && (
                <Link href={`/teams/${data.team_id}`} className="text-indigo-400 hover:text-indigo-300 font-bold">
                  {data.team_short ?? data.team_name}
                </Link>
              )}
              <span className="text-slate-600">·</span>
              <span>{data.is_pitcher ? "투수" : "야수"}</span>
              <span className="text-slate-600">·</span>
              <span>{data.season} 시즌</span>
            </div>
            {data.injury_status && (
              <span className="inline-block mt-2 text-xs font-bold px-2 py-0.5 rounded-full bg-red-900/40 text-red-400">
                {data.injury_status}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 투수 시즌 기록 */}
      {p && (
        <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 className="text-sm font-black text-slate-200 mb-4">투수 시즌 기록</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            <StatBox label="ERA" value={p.era?.toFixed(2) ?? "-"}
              color={(p.era ?? 99) <= 3 ? "text-emerald-400" : (p.era ?? 99) <= 4.5 ? "text-yellow-400" : "text-red-400"} />
            <StatBox label="WHIP" value={p.whip?.toFixed(2) ?? "-"} />
            <StatBox label="K/BB" value={p.k_bb_ratio?.toFixed(1) ?? "-"}
              color={(p.k_bb_ratio ?? 0) >= 4 ? "text-emerald-400" : "text-slate-100"} />
            <StatBox label="이닝" value={fmtIP(p.innings_pitched)} />
            <StatBox label="경기" value={String(p.games ?? "-")} />
            <StatBox label="승-패" value={`${p.wins ?? 0}-${p.losses ?? 0}`} color="text-blue-400" />
            <StatBox label="세이브" value={String(p.saves ?? 0)} color="text-purple-400" />
            <StatBox label="홀드" value={String(p.holds ?? 0)} color="text-amber-400" />
            <StatBox label="탈삼진" value={String(p.strikeouts ?? "-")} />
            <StatBox label="볼넷" value={String(p.walks ?? "-")} />
            <StatBox label="피안타" value={String(p.hits ?? "-")} />
            <StatBox label="피홈런" value={String(p.home_runs_allowed ?? "-")} />
          </div>
        </div>
      )}

      {/* 타자 시즌 기록 */}
      {b && (
        <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 className="text-sm font-black text-slate-200 mb-4">타자 시즌 기록</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            <StatBox label="타율" value={b.avg?.toFixed(3) ?? "-"} color="text-emerald-400" />
            <StatBox label="OPS" value={b.ops?.toFixed(3) ?? "-"} color="text-blue-400" />
            <StatBox label="출루율" value={b.obp?.toFixed(3) ?? "-"} />
            <StatBox label="장타율" value={b.slg?.toFixed(3) ?? "-"} />
            <StatBox label="경기" value={String(b.games ?? "-")} />
            <StatBox label="타석" value={String(b.plate_app ?? "-")} />
            <StatBox label="안타" value={String(b.hits ?? "-")} />
            <StatBox label="홈런" value={String(b.home_runs ?? "-")} color="text-amber-400" />
            <StatBox label="타점" value={String(b.rbi ?? "-")} />
            <StatBox label="득점" value={String(b.runs ?? "-")} />
            <StatBox label="볼넷" value={String(b.walks ?? "-")} />
            <StatBox label="삼진" value={String(b.strikeouts ?? "-")} />
          </div>
        </div>
      )}

      {/* 투수 최근 경기 로그 */}
      {data.recent_games && data.recent_games.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 className="text-sm font-black text-slate-200 mb-4">최근 등판 기록</h2>
          <div className="space-y-1.5">
            {data.recent_games.map((g: any, i: number) => (
              <div key={i} className="grid items-center text-xs rounded-lg px-3 py-2"
                style={{ background: "#0d1421", gridTemplateColumns: "3.5rem 1fr auto auto" }}>
                <span className="text-slate-600 tabular-nums">{g.game_date?.slice(5).replace("-", ".")}</span>
                <span className="text-slate-400">vs {g.opponent_name ?? "-"}
                  {g.is_starter && <span className="ml-1 text-[10px] text-indigo-400">선발</span>}
                </span>
                <span className="text-slate-300 font-bold tabular-nums mr-3">{fmtIP(g.innings_pitched)}이닝</span>
                <span className="text-slate-500 tabular-nums">{g.earned_runs}자책 {g.strikeouts}K</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!p && !b && (
        <div className="rounded-2xl p-8 text-center text-slate-500" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
          이 선수의 시즌 기록이 아직 없습니다.
        </div>
      )}

      <p className="text-center text-xs text-slate-600 pb-4">KBO 공식 기록 기준 · 시즌 누적</p>
    </div>
  );
}
