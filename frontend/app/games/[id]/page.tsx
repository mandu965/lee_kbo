import { notFound } from "next/navigation";
import { getGame, getGamePrediction } from "@/lib/api";
import WinProbBar from "@/components/WinProbBar";
import RecentFormBadges from "@/components/RecentFormBadges";
import StarterCard from "@/components/StarterCard";

interface Props {
  params: { id: string };
}

function EloBar({ home, away }: { home: number; away: number }) {
  const max = Math.max(home, away);
  const homeW = Math.round((home / (home + away)) * 100);
  const awayW = 100 - homeW;
  return (
    <div className="w-full">
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-700 mt-1">
        <div className="bg-blue-500/60" style={{ width: `${awayW}%` }} />
        <div className="bg-red-500/60" style={{ width: `${homeW}%` }} />
      </div>
    </div>
  );
}

function StatCompareRow({
  label, awayVal, homeVal, awayBetter, unit = "",
}: {
  label: string; awayVal: string | number; homeVal: string | number;
  awayBetter?: boolean; unit?: string;
}) {
  return (
    <div className="grid grid-cols-3 items-center py-2.5 border-b border-slate-700/40 last:border-0">
      <div className={`text-sm font-bold text-right pr-4 ${awayBetter === true ? "text-blue-400" : "text-slate-200"}`}>
        {awayVal}{unit}
      </div>
      <div className="text-center text-xs text-slate-500">{label}</div>
      <div className={`text-sm font-bold text-left pl-4 ${awayBetter === false ? "text-red-400" : "text-slate-200"}`}>
        {homeVal}{unit}
      </div>
    </div>
  );
}

function FactorCard({ text }: { text: string }) {
  // 긍정/부정 키워드로 색상 구분
  const isPositive = /홈팀 우위|홈 우위|홈 최근|파크팩터/.test(text);
  const isNegative = /원정 우위|소진|경고/.test(text);
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${
      isPositive ? "bg-blue-950/30 border-blue-800/40" :
      isNegative ? "bg-red-950/30 border-red-800/40" :
      "bg-slate-700/30 border-slate-600/40"
    }`}>
      <span className={`mt-0.5 text-base shrink-0 ${
        isPositive ? "text-blue-400" : isNegative ? "text-red-400" : "text-slate-400"
      }`}>
        {isPositive ? "▲" : isNegative ? "▼" : "•"}
      </span>
      <p className="text-sm text-slate-200 leading-relaxed">{text}</p>
    </div>
  );
}

function ParkFactorBar({ factor }: { factor: number }) {
  // 0.85~1.15 범위 기준으로 바 위치 계산
  const min = 0.85, max = 1.15;
  const pct = Math.round(((factor - min) / (max - min)) * 100);
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative w-full h-3 bg-slate-700 rounded-full mt-2">
      {/* 중앙선 */}
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-500" />
      {/* 마커 */}
      <div
        className={`absolute top-0.5 -translate-x-1/2 w-2 h-2 rounded-full ${
          factor > 1.03 ? "bg-orange-400" : factor < 0.97 ? "bg-cyan-400" : "bg-slate-300"
        }`}
        style={{ left: `${clamped}%` }}
      />
    </div>
  );
}

export default async function GameDetailPage({ params }: Props) {
  const id = Number(params.id);
  if (isNaN(id)) notFound();

  const [game, prediction] = await Promise.all([
    getGame(id).catch(() => null),
    getGamePrediction(id).catch(() => null),
  ]);

  if (!game) notFound();

  const { home_team, away_team, starters, status } = game;
  const isFinished = status === "final";
  const homeWin = isFinished && (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWin = isFinished && (game.away_score ?? 0) > (game.home_score ?? 0);
  const eloDiff = Math.abs(home_team.elo_rating - away_team.elo_rating).toFixed(0);
  const eloBetter = home_team.elo_rating > away_team.elo_rating ? "home" : "away";

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* ── 경기 헤더 ────────────────────────────────── */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
        {/* 구장 / 시간 / 상태 */}
        <div className="flex justify-between items-center mb-5 text-xs text-slate-500">
          <span>{game.stadium ?? "-"}</span>
          <div className="flex items-center gap-2">
            <span>{game.start_time?.slice(0, 5)}</span>
            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
              isFinished ? "bg-slate-700 text-slate-400"
              : status === "in_progress" ? "bg-emerald-900 text-emerald-400"
              : "bg-blue-900 text-blue-300"
            }`}>
              {isFinished ? "종료" : status === "in_progress" ? "진행중" : "예정"}
            </span>
          </div>
        </div>

        {/* 팀 매치업 — 왼쪽=원정, 오른쪽=홈 */}
        <div className="flex items-center justify-between">
          {/* 원정팀 */}
          <div className="flex flex-col items-center flex-1">
            <span className={`text-3xl font-black ${awayWin ? "text-white" : isFinished ? "text-slate-500" : "text-slate-100"}`}>
              {away_team.short_name ?? away_team.name}
            </span>
            <span className="text-xs text-slate-500 mt-1">원정</span>
            <div className="mt-2">
              <RecentFormBadges form={away_team.recent_form} />
            </div>
          </div>

          {/* 스코어 or VS */}
          <div className="flex flex-col items-center px-4">
            {isFinished ? (
              <div className="flex items-center gap-3">
                <span className={`text-4xl font-black tabular-nums ${awayWin ? "text-white" : "text-slate-500"}`}>
                  {game.away_score}
                </span>
                <span className="text-slate-600 text-2xl">:</span>
                <span className={`text-4xl font-black tabular-nums ${homeWin ? "text-white" : "text-slate-500"}`}>
                  {game.home_score}
                </span>
              </div>
            ) : (
              <span className="text-2xl text-slate-600 font-bold">VS</span>
            )}
            <span className="text-xs text-slate-600 mt-1">{game.game_date}</span>
          </div>

          {/* 홈팀 */}
          <div className="flex flex-col items-center flex-1">
            <span className={`text-3xl font-black ${homeWin ? "text-white" : isFinished ? "text-slate-500" : "text-slate-100"}`}>
              {home_team.short_name ?? home_team.name}
            </span>
            <span className="text-xs text-slate-500 mt-1">홈</span>
            <div className="mt-2">
              <RecentFormBadges form={home_team.recent_form} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 예측 승률 + 근거 ─────────────────────────── */}
      {prediction && !isFinished && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-200">AI 예측</h2>
            <span className="text-[10px] text-slate-600 bg-slate-700 px-2 py-0.5 rounded-full">
              ELO + 선발 + 흐름 + 환경
            </span>
          </div>

          <WinProbBar
            homeProb={prediction.home_win_prob}
            awayProb={prediction.away_win_prob}
            homeTeamName={home_team.short_name ?? home_team.name}
            awayTeamName={away_team.short_name ?? away_team.name}
          />

          {prediction.key_factors.length > 0 && (
            <div className="space-y-2 pt-1">
              {prediction.key_factors.map((f, i) => (
                <FactorCard key={i} text={f} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 팀 비교 ──────────────────────────────────── */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
        {/* 헤더 — 왼쪽=원정, 오른쪽=홈 */}
        <div className="grid grid-cols-3 items-center mb-3">
          <div className="text-center">
            <p className="font-black text-slate-100">{away_team.short_name ?? away_team.name}</p>
            <p className="text-xs text-slate-500">원정</p>
          </div>
          <p className="text-center text-xs font-bold text-slate-400">팀 비교</p>
          <div className="text-center">
            <p className="font-black text-slate-100">{home_team.short_name ?? home_team.name}</p>
            <p className="text-xs text-slate-500">홈</p>
          </div>
        </div>

        <StatCompareRow
          label="ELO 레이팅"
          awayVal={away_team.elo_rating.toFixed(0)}
          homeVal={home_team.elo_rating.toFixed(0)}
          awayBetter={eloBetter === "away"}
        />

        {/* ELO 시각 바 */}
        <div className="px-1 pb-2">
          <EloBar home={home_team.elo_rating} away={away_team.elo_rating} />
          <p className="text-center text-xs text-slate-600 mt-1">
            차이 {eloDiff}점 ({eloBetter === "home" ? (home_team.short_name ?? home_team.name) : (away_team.short_name ?? away_team.name)} 우위)
          </p>
        </div>

        <StatCompareRow
          label="최근 5경기"
          awayVal={away_team.recent_form.split("").filter(c => c === "W").length + "승"}
          homeVal={home_team.recent_form.split("").filter(c => c === "W").length + "승"}
          awayBetter={
            away_team.recent_form.split("").filter(c => c === "W").length >
            home_team.recent_form.split("").filter(c => c === "W").length
          }
        />
      </div>

      {/* ── 선발 투수 비교 ───────────────────────────── */}
      {starters && (starters.home || starters.away) && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
          <h2 className="text-sm font-black text-slate-200 mb-4">선발 투수 비교</h2>

          <div className="grid grid-cols-2 gap-4">
            {/* 원정 선발 */}
            {starters.away ? (
              <div className="bg-slate-700/40 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">
                  원정 {starters.away.is_confirmed ? "✓ 확정" : "추정"}
                </p>
                <p className="text-xl font-black text-slate-100 mb-3">{starters.away.name}</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">ERA</span>
                    <span className={`text-lg font-black ${
                      (starters.away.era ?? 99) <= 3 ? "text-emerald-400" :
                      (starters.away.era ?? 99) <= 4.5 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {starters.away.era?.toFixed(2) ?? "-"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">WHIP</span>
                    <span className={`text-lg font-black ${
                      (starters.away.whip ?? 99) <= 1.1 ? "text-emerald-400" :
                      (starters.away.whip ?? 99) <= 1.4 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {starters.away.whip?.toFixed(2) ?? "-"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-700/20 rounded-xl p-4 flex items-center justify-center">
                <p className="text-slate-600 text-sm">미정</p>
              </div>
            )}

            {/* 홈 선발 */}
            {starters.home ? (
              <div className="bg-slate-700/40 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1 text-right">
                  홈 {starters.home.is_confirmed ? "✓ 확정" : "추정"}
                </p>
                <p className="text-xl font-black text-slate-100 mb-3 text-right">{starters.home.name}</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={`text-lg font-black ${
                      (starters.home.era ?? 99) <= 3 ? "text-emerald-400" :
                      (starters.home.era ?? 99) <= 4.5 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {starters.home.era?.toFixed(2) ?? "-"}
                    </span>
                    <span className="text-xs text-slate-500">ERA</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-lg font-black ${
                      (starters.home.whip ?? 99) <= 1.1 ? "text-emerald-400" :
                      (starters.home.whip ?? 99) <= 1.4 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {starters.home.whip?.toFixed(2) ?? "-"}
                    </span>
                    <span className="text-xs text-slate-500">WHIP</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-700/20 rounded-xl p-4 flex items-center justify-center">
                <p className="text-slate-600 text-sm">미정</p>
              </div>
            )}
          </div>

          {/* ERA 직접 비교 바 */}
          {starters.home?.era && starters.away?.era && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs text-slate-500 mb-2 text-center">ERA 비교 (낮을수록 유리)</p>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-10 text-right">
                  {starters.away.era.toFixed(2)}
                </span>
                <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-slate-700">
                  <div
                    className={`h-full transition-all duration-700 ${
                      starters.away.era < starters.home.era ? "bg-blue-500" : "bg-slate-600"
                    }`}
                    style={{ width: `${Math.min(90, Math.max(10, 50 + (starters.home.era - starters.away.era) * 8))}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-400 w-10">
                  {starters.home.era.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                <span>{away_team.short_name}</span>
                <span>{home_team.short_name}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 경기 환경 ────────────────────────────────── */}
      {prediction && (prediction.park || prediction.weather || prediction.bullpen_home || prediction.bullpen_away) && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-5">
          <h2 className="text-sm font-black text-slate-200">경기 환경</h2>

          {/* 파크팩터 */}
          {prediction.park && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs font-bold text-slate-400">구장 파크팩터</p>
                <span className={`text-sm font-black ${
                  prediction.park.factor > 1.03 ? "text-orange-400" :
                  prediction.park.factor < 0.97 ? "text-cyan-400" : "text-slate-300"
                }`}>
                  {prediction.park.factor.toFixed(2)}
                  <span className="text-xs font-normal ml-1 text-slate-500">
                    {prediction.park.factor > 1.03 ? "타자 친화" :
                     prediction.park.factor < 0.97 ? "투수 친화" : "중립"}
                  </span>
                </span>
              </div>
              <ParkFactorBar factor={prediction.park.factor} />
              <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                <span>투수 유리 ← 0.85</span>
                <span>1.00</span>
                <span>1.15 → 타자 유리</span>
              </div>
              {prediction.park.notes && (
                <p className="text-xs text-slate-500 mt-2 bg-slate-700/30 rounded-lg px-3 py-2">
                  {prediction.park.notes}
                </p>
              )}
            </div>
          )}

          {/* 날씨 */}
          {prediction.weather && prediction.weather.description !== "날씨 영향 미미" && prediction.weather.description !== "돔 구장 — 날씨 영향 없음" && (
            <div className={`rounded-xl p-4 ${
              prediction.weather.rain_risk
                ? "bg-yellow-950/40 border border-yellow-800/40"
                : "bg-slate-700/30"
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{prediction.weather.rain_risk ? "🌧️" : "🌤️"}</span>
                <p className="text-sm font-bold text-slate-200">{prediction.weather.description}</p>
              </div>
              {prediction.weather.temperature && (
                <p className="text-xs text-slate-500">{prediction.weather.temperature}°C</p>
              )}
            </div>
          )}
          {prediction.weather && (prediction.weather.description === "날씨 영향 미미" || prediction.weather.description === "돔 구장 — 날씨 영향 없음") && (
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <span>☀️</span>
              <span>{prediction.weather.description}</span>
            </div>
          )}

          {/* 불펜 소진도 */}
          {(prediction.bullpen_home || prediction.bullpen_away) && (
            <div>
              <p className="text-xs font-bold text-slate-400 mb-3">불펜 소진도 (최근 3일)</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: away_team.short_name ?? away_team.name, bp: prediction.bullpen_away, side: "원정" },
                  { label: home_team.short_name ?? home_team.name, bp: prediction.bullpen_home, side: "홈" },
                ].map(({ label, bp, side }) => (
                  <div key={label} className="bg-slate-700/40 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-slate-400">{label} <span className="text-slate-600">({side})</span></span>
                      {bp && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          bp.level === "소진" ? "bg-red-900/50 text-red-400" :
                          bp.level === "경고" ? "bg-yellow-900/50 text-yellow-400" :
                          "bg-emerald-900/50 text-emerald-400"
                        }`}>{bp.level}</span>
                      )}
                    </div>
                    {bp ? (
                      <>
                        <div className="w-full bg-slate-600 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              bp.level === "소진" ? "bg-red-500" :
                              bp.level === "경고" ? "bg-yellow-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(100, bp.fatigue_score * 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{bp.recent_innings}이닝 등판</p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-600">데이터 없음</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 데이터 안내 ──────────────────────────────── */}
      <p className="text-center text-xs text-slate-600 pb-4">
        예측은 ELO · 선발 ERA/WHIP · 최근 흐름 · 홈이점 · 파크팩터 · 날씨 · 불펜 7가지 지표를 종합합니다.<br />
        참고용이며 실제 경기 결과를 보장하지 않습니다.
      </p>
    </div>
  );
}
