import { getTodayPitchers } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 300; // 5분 — 오늘 선발 업데이트 반영

export default async function PitchersPage() {
  const pitchers = await getTodayPitchers().catch(() => []);

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-2">오늘의 선발 투수</h1>
      <p className="text-slate-400 text-sm mb-6">ERA 기준 정렬</p>

      {pitchers.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p>오늘 등록된 선발 투수 정보가 없습니다.</p>
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">투수</th>
                <th className="px-4 py-3 text-left">팀</th>
                <th className="px-4 py-3 text-right">ERA</th>
                <th className="px-4 py-3 text-right">WHIP</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">이닝</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">삼진</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">볼넷</th>
              </tr>
            </thead>
            <tbody>
              {pitchers.map((p) => {
                const s = p.season_stats;
                const era = s?.era ?? null;
                const eraColor =
                  era === null ? "text-slate-400"
                  : era <= 3.0 ? "text-green-400"
                  : era <= 4.0 ? "text-yellow-400"
                  : "text-red-400";
                return (
                  <tr key={p.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                    <td className="px-4 py-3 font-semibold text-slate-100">{p.name}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{p.team_name ?? "-"}</td>
                    <td className={`px-4 py-3 text-right font-bold font-mono ${eraColor}`}>
                      {era?.toFixed(2) ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {s?.whip?.toFixed(2) ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400 hidden sm:table-cell">
                      {s?.innings_pitched?.toFixed(1) ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400 hidden md:table-cell">
                      {s?.strikeouts ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400 hidden md:table-cell">
                      {s?.walks ?? "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
