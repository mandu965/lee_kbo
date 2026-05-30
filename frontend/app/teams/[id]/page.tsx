import { notFound } from "next/navigation";
import { getTeam, getTeamRecent, getTeamEloHistory } from "@/lib/api";
import RecentFormBadges from "@/components/RecentFormBadges";
import EloChart from "@/components/EloChart";

export const revalidate = 1800; // 30분

interface Props {
  params: { id: string };
}

export default async function TeamDetailPage({ params }: Props) {
  const id = Number(params.id);
  if (isNaN(id)) notFound();

  const [team, recentGames, eloHistory] = await Promise.all([
    getTeam(id).catch(() => null),
    getTeamRecent(id, 10).catch(() => []),
    getTeamEloHistory(id).catch(() => []),
  ]);

  if (!team) notFound();

  const played = team.wins + team.losses + team.draws;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 팀 헤더 */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-black text-white">{team.name}</h1>
            <p className="text-slate-400 text-sm mt-1">{team.stadium}</p>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <div className="text-2xl font-bold text-green-400">{team.wins}</div>
              <div className="text-xs text-slate-400">승</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{team.losses}</div>
              <div className="text-xs text-slate-400">패</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-400">{team.draws}</div>
              <div className="text-xs text-slate-400">무</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-400">
                {played > 0 ? (team.win_rate * 100).toFixed(1) : "-"}%
              </div>
              <div className="text-xs text-slate-400">승률</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-200">{team.elo_rating.toFixed(0)}</div>
              <div className="text-xs text-slate-400">ELO</div>
            </div>
          </div>
        </div>
      </div>

      {/* ELO 히스토리 차트 */}
      {eloHistory.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-400 mb-4">ELO 변동 히스토리</h2>
          <EloChart history={eloHistory} teamName={team.name} />
        </div>
      )}

      {/* 최근 10경기 */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-slate-200">최근 {recentGames.length}경기</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 uppercase border-b border-slate-700/50">
              <th className="px-4 py-2 text-left">날짜</th>
              <th className="px-4 py-2 text-left">상대</th>
              <th className="px-4 py-2 text-center">홈/원정</th>
              <th className="px-4 py-2 text-center">결과</th>
              <th className="px-4 py-2 text-center">스코어</th>
            </tr>
          </thead>
          <tbody>
            {recentGames.map((g, i) => (
              <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                <td className="px-4 py-2 text-slate-400 text-xs">{g.game_date.slice(5)}</td>
                <td className="px-4 py-2 text-slate-200">{g.opponent_name}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${g.is_home ? "bg-blue-900/40 text-blue-300" : "bg-slate-700 text-slate-400"}`}>
                    {g.is_home ? "홈" : "원정"}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={`font-bold text-xs ${g.result === "W" ? "text-green-400" : g.result === "L" ? "text-red-400" : "text-slate-400"}`}>
                    {g.result ?? "-"}
                  </span>
                </td>
                <td className="px-4 py-2 text-center font-mono text-slate-300 text-xs">
                  {g.my_score !== null && g.opp_score !== null
                    ? `${g.my_score} - ${g.opp_score}`
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
