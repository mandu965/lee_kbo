import { getPredictionHistory, getAccuracy, getMonthlyAccuracy } from "@/lib/api";
import AccuracyBadge from "@/components/AccuracyBadge";

export const revalidate = 600; // 10분 — 결과 정산 후 반영

const MONTH_NAMES = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

export default async function HistoryPage() {
  const [history, accuracy, monthly] = await Promise.all([
    getPredictionHistory().catch(() => []),
    getAccuracy().catch(() => null),
    getMonthlyAccuracy().catch(() => []),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-black text-white">예측 히스토리</h1>
        {accuracy && accuracy.total > 0 && (
          <AccuracyBadge accuracy={accuracy.accuracy} total={accuracy.total} />
        )}
      </div>

      {/* 월별 적중률 */}
      {monthly.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-400 mb-4">월별 적중률</h2>
          <div className="flex gap-3 flex-wrap">
            {monthly.map((m) => {
              const pct = Math.round(m.accuracy * 100);
              return (
                <div key={m.month} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-10 rounded-full text-center text-xs font-bold py-1 ${
                      pct >= 60 ? "bg-green-900/60 text-green-400"
                      : pct >= 50 ? "bg-yellow-900/60 text-yellow-400"
                      : "bg-red-900/60 text-red-400"
                    }`}
                  >
                    {pct}%
                  </div>
                  <span className="text-xs text-slate-500">{MONTH_NAMES[m.month - 1]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 예측 목록 */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">날짜</th>
              <th className="px-4 py-3 text-left">경기</th>
              <th className="px-4 py-3 text-right hidden sm:table-cell">예측 승률</th>
              <th className="px-4 py-3 text-center">예측</th>
              <th className="px-4 py-3 text-center">결과</th>
              <th className="px-4 py-3 text-center">적중</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  예측 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              history.map((item) => (
                <tr key={item.game_id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {item.game_date.slice(5)}
                  </td>
                  <td className="px-4 py-3 text-slate-200">
                    {item.away_team} @ {item.home_team}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-slate-400 hidden sm:table-cell">
                    홈 {Math.round(item.home_win_prob * 100)}%
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate-300">
                    {item.predicted_winner ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate-400">
                    {item.actual_winner ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.is_correct === null ? (
                      <span className="text-slate-600 text-xs">-</span>
                    ) : item.is_correct ? (
                      <span className="text-green-400 font-bold text-xs">✓</span>
                    ) : (
                      <span className="text-red-400 font-bold text-xs">✗</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
