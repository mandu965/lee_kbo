import Link from "next/link";
import { getTeams } from "@/lib/api";
import RecentFormBadges from "@/components/RecentFormBadges";

export const revalidate = 1800; // 30분 — 순위는 하루 몇 번만 갱신

function StreakBadge({ streak }: { streak: string | null }) {
  if (!streak) return <span className="text-slate-500">-</span>;
  const isWin = streak.includes("승");
  return (
    <span className={`font-bold ${isWin ? "text-blue-400" : "text-red-400"}`}>
      {streak}
    </span>
  );
}

function RecordSplit({ record }: { record: string | null }) {
  if (!record) return <span className="text-slate-500">-</span>;
  const parts = record.split("-");
  if (parts.length === 3) {
    const [w, d, l] = parts;
    return (
      <span className="font-mono text-xs">
        <span className="text-blue-400">{w}</span>
        <span className="text-slate-500">-{d}-</span>
        <span className="text-red-400">{l}</span>
      </span>
    );
  }
  return <span className="text-slate-400 font-mono text-xs">{record}</span>;
}

export default async function TeamsPage() {
  const teams = await getTeams().catch(() => []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white">팀 순위</h1>
        <span className="text-xs text-slate-500">2026 KBO 정규시즌</span>
      </div>

      {/* 데스크톱 테이블 */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[780px]">
          <thead>
            <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wide">
              <th className="px-3 py-3 text-center w-8">순위</th>
              <th className="px-3 py-3 text-left">팀</th>
              <th className="px-3 py-3 text-center">경기</th>
              <th className="px-3 py-3 text-center">승</th>
              <th className="px-3 py-3 text-center">패</th>
              <th className="px-3 py-3 text-center">무</th>
              <th className="px-3 py-3 text-center">승률</th>
              <th className="px-3 py-3 text-center">GB</th>
              <th className="px-3 py-3 text-center">연속</th>
              <th className="px-3 py-3 text-center hidden lg:table-cell">최근10</th>
              <th className="px-3 py-3 text-center hidden xl:table-cell">홈</th>
              <th className="px-3 py-3 text-center hidden xl:table-cell">원정</th>
              <th className="px-3 py-3 text-right hidden md:table-cell">ELO</th>
              <th className="px-3 py-3 text-center hidden lg:table-cell">최근5</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => {
              const rank = team.rank ?? 0;
              const isTop3 = rank <= 3;
              return (
                <tr
                  key={team.id}
                  className={`border-b border-slate-700/40 hover:bg-slate-700/30 transition-colors ${
                    isTop3 ? "bg-slate-800/60" : ""
                  }`}
                >
                  <td className="px-3 py-3 text-center">
                    <span className={`font-black text-sm ${
                      rank === 1 ? "text-yellow-400" :
                      rank === 2 ? "text-slate-300" :
                      rank === 3 ? "text-amber-600" :
                      "text-slate-500"
                    }`}>{rank}</span>
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/teams/${team.id}`} className="flex items-center gap-2 hover:text-blue-400 transition-colors">
                      <span className="font-bold text-slate-100">{team.short_name ?? team.name}</span>
                      <span className="text-slate-400 text-xs hidden sm:inline">{team.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-slate-400">{team.games_played}</td>
                  <td className="px-3 py-3 text-center font-mono font-bold text-blue-400">{team.wins}</td>
                  <td className="px-3 py-3 text-center font-mono text-red-400">{team.losses}</td>
                  <td className="px-3 py-3 text-center font-mono text-slate-500">{team.draws}</td>
                  <td className="px-3 py-3 text-center font-bold">
                    <span className={team.win_rate >= 0.5 ? "text-emerald-400" : "text-slate-400"}>
                      {team.win_rate.toFixed(3)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-slate-400">
                    {team.games_behind != null ? (team.games_behind === 0 ? "-" : team.games_behind.toFixed(1)) : "-"}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <StreakBadge streak={team.streak} />
                  </td>
                  <td className="px-3 py-3 text-center text-slate-300 hidden lg:table-cell">
                    {team.last10 ?? "-"}
                  </td>
                  <td className="px-3 py-3 text-center hidden xl:table-cell">
                    <RecordSplit record={team.home_record} />
                  </td>
                  <td className="px-3 py-3 text-center hidden xl:table-cell">
                    <RecordSplit record={team.away_record} />
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-400 hidden md:table-cell">
                    {team.elo_rating.toFixed(0)}
                  </td>
                  <td className="px-3 py-3 hidden lg:table-cell">
                    <div className="flex justify-center">
                      <RecentFormBadges form={team.recent_form} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        <span>GB: 게임차</span>
        <span>홈/원정: 승-무-패</span>
        <span>ELO: 예측 모델 레이팅</span>
        <span>최근5: 최근 5경기 결과</span>
      </div>
    </div>
  );
}
