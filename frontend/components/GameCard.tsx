import Link from "next/link";
import type { GameResponse } from "@/lib/types";
import WinProbBar from "./WinProbBar";
import RecentFormBadges from "./RecentFormBadges";
import StarterCard from "./StarterCard";
import WeatherBadge from "./WeatherBadge";

interface GameCardProps {
  game: GameResponse;
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: "예정",
  in_progress: "진행중",
  final: "종료",
  cancelled: "취소",
};

export default function GameCard({ game }: GameCardProps) {
  const { home_team, away_team, prediction, starters, status } = game;
  const isFinished = status === "final";

  return (
    <Link href={`/games/${game.id}`}>
      <div className="bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-500 rounded-xl p-5 transition-all cursor-pointer">

        {/* 헤더: 구장 / 시간 / 상태 / 날씨 */}
        <div className="flex justify-between items-center mb-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>{game.stadium ?? "-"}</span>
            {/* 파크팩터 */}
            {prediction?.park && prediction.park.factor !== 1.0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                  prediction.park.factor > 1.0
                    ? "bg-orange-900/40 text-orange-400"
                    : "bg-cyan-900/40 text-cyan-400"
                }`}
                title={prediction.park.notes}
              >
                {prediction.park.factor > 1.0 ? "타자" : "투수"} {prediction.park.factor.toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 날씨 뱃지 */}
            {prediction?.weather && (
              <WeatherBadge weather={prediction.weather} compact />
            )}
            <span>{game.start_time?.slice(0, 5) ?? "-"}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              status === "final" ? "bg-slate-700 text-slate-400"
              : status === "in_progress" ? "bg-green-900 text-green-400"
              : "bg-blue-900 text-blue-300"
            }`}>
              {STATUS_LABEL[status] ?? status}
            </span>
          </div>
        </div>

        {/* 팀 매치업 */}
        <div className="flex items-center justify-between mb-4">
          {/* 원정팀 */}
          <div className="flex flex-col items-start gap-1 w-2/5">
            <span className="text-lg font-bold text-slate-100">
              {away_team.short_name ?? away_team.name}
            </span>
            <RecentFormBadges form={away_team.recent_form} />
          </div>

          {/* 스코어 or VS */}
          <div className="flex flex-col items-center">
            {isFinished ? (
              <div className="flex items-center gap-2 text-2xl font-black">
                <span className={game.away_score! > game.home_score! ? "text-white" : "text-slate-500"}>
                  {game.away_score}
                </span>
                <span className="text-slate-600 text-base">:</span>
                <span className={game.home_score! > game.away_score! ? "text-white" : "text-slate-500"}>
                  {game.home_score}
                </span>
              </div>
            ) : (
              <span className="text-slate-500 font-bold text-lg">VS</span>
            )}
          </div>

          {/* 홈팀 */}
          <div className="flex flex-col items-end gap-1 w-2/5">
            <span className="text-lg font-bold text-slate-100">
              {home_team.short_name ?? home_team.name}
            </span>
            <RecentFormBadges form={home_team.recent_form} />
          </div>
        </div>

        {/* 승률 바 (예정/진행중 경기만) */}
        {!isFinished && prediction && (
          <div className="mb-4">
            <WinProbBar
              homeProb={prediction.home_win_prob}
              awayProb={prediction.away_win_prob}
              homeTeamName={home_team.short_name ?? home_team.name}
              awayTeamName={away_team.short_name ?? away_team.name}
            />
          </div>
        )}

        {/* 선발 투수 */}
        {starters && (starters.home || starters.away) && (
          <div className="border-t border-slate-700 pt-3 mt-3">
            <div className="flex justify-between items-start">
              <StarterCard starter={starters.away} label="원정 선발" align="left" />
              <StarterCard starter={starters.home} label="홈 선발" align="right" />
            </div>
            {/* 미확정 표시 */}
            {(!starters.away?.is_confirmed || !starters.home?.is_confirmed) && (
              <p className="text-center text-[10px] text-slate-600 mt-1.5">
                * 선발 미확정 — 이닝 기준 추정
              </p>
            )}
          </div>
        )}

        {/* 예측 근거 */}
        {!isFinished && prediction && (prediction.key_factors?.length ?? 0) > 0 && (
          <ul className="mt-3 border-t border-slate-700 pt-3 space-y-1">
            {prediction.key_factors!.map((f, i) => (
              <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                <span className="text-blue-400 mt-0.5">•</span>
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}
