import Link from "next/link";
import { getTodayGames, getAccuracy, getTeams } from "@/lib/api";
import GameCard from "@/components/GameCard";
import AccuracyBadge from "@/components/AccuracyBadge";
import AdSense from "@/components/AdSense";

export const revalidate = 300; // 5분 — 선발/예측 업데이트 반영

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });
}

export default async function HomePage() {
  const [gameList, accuracy, teams] = await Promise.all([
    getTodayGames().catch(() => null),
    getAccuracy().catch(() => null),
    getTeams().catch(() => []),
  ]);

  const top5 = teams.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">
            {gameList ? formatDate(gameList.date) : "오늘의 경기"}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            총 {gameList?.total ?? 0}경기 · KBO 정규시즌 2026
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {accuracy && accuracy.total > 0 && (
            <AccuracyBadge
              accuracy={accuracy.accuracy}
              total={accuracy.total}
              label="시즌 적중률"
            />
          )}
        </div>
      </div>

      {/* 빠른 메뉴 */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
        {[
          { href: "/teams",    label: "팀 순위",    icon: "🏆" },
          { href: "/players",  label: "선수 기록",  icon: "📊" },
          { href: "/schedule", label: "일정·결과",  icon: "📅" },
          { href: "/history",  label: "예측 기록",  icon: "🎯" },
        ].map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center hover:border-slate-500 hover:bg-slate-750 transition-colors"
          >
            <div className="text-2xl mb-1">{m.icon}</div>
            <div className="text-xs font-bold text-slate-300">{m.label}</div>
          </Link>
        ))}
      </div>

      {/* 경기 카드 + 순위 사이드 레이아웃 */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* 경기 카드 */}
        <div className="flex-1 min-w-0">
          {!gameList ? (
            <div className="text-center py-16 text-slate-500 bg-slate-800 rounded-xl border border-slate-700">
              <div className="text-4xl mb-4">⚾</div>
              <p className="text-lg text-slate-300">경기 정보를 불러오지 못했습니다.</p>
              <p className="mt-2 text-sm">잠시 후 다시 확인해 주세요. 팀 순위와 야구 지표 안내는 계속 이용할 수 있습니다.</p>
            </div>
          ) : gameList.games.length === 0 ? (
            <div className="text-center py-20 text-slate-500 bg-slate-800 rounded-xl border border-slate-700">
              <div className="text-5xl mb-4">⚾</div>
              <p className="text-lg">오늘 예정된 경기가 없습니다.</p>
              <p className="mt-2 text-sm">팀 순위, 선수 기록, 지난 경기 결과를 확인해 보세요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {gameList.games.map((game, idx) => (
                <div key={game.id}>
                  <GameCard game={game} />
                  {idx === 3 && (
                    <div className="mt-4">
                      <AdSense
                        slot={process.env.NEXT_PUBLIC_AD_SLOT_BANNER ?? ""}
                        format="horizontal"
                        className="my-2"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 순위 사이드바 */}
        {top5.length > 0 && (
          <div className="w-full lg:w-64 shrink-0">
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-200">팀 순위</h2>
                <Link href="/teams" className="text-xs text-blue-400 hover:text-blue-300">전체 보기</Link>
              </div>
              <div className="divide-y divide-slate-700/50">
                {top5.map((t) => (
                  <Link
                    key={t.id}
                    href={`/teams/${t.id}`}
                    className="flex items-center px-4 py-2.5 hover:bg-slate-700/30 transition-colors"
                  >
                    <span className={`w-5 text-center text-sm font-black mr-3 ${
                      t.rank === 1 ? "text-yellow-400" :
                      t.rank === 2 ? "text-slate-300" :
                      t.rank === 3 ? "text-amber-600" : "text-slate-500"
                    }`}>{t.rank}</span>
                    <span className="flex-1 font-bold text-sm text-slate-200">{t.short_name ?? t.name}</span>
                    <span className="text-xs font-mono text-slate-400">
                      {t.wins}승 {t.losses}패
                    </span>
                    <span className={`ml-2 text-xs font-bold ${
                      t.win_rate >= 0.5 ? "text-emerald-400" : "text-slate-500"
                    }`}>
                      {t.win_rate.toFixed(3)}
                    </span>
                  </Link>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-slate-700/50">
                <Link href="/teams" className="text-xs text-slate-400 hover:text-slate-300">
                  하위 5팀 보기 →
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 서비스 안내 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/about" className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-500 transition-colors">
          <h2 className="font-bold text-slate-100">예측 모델 안내</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            ELO, 선발 투수, 최근 흐름, 구장, 날씨 등 현재 모델이 사용하는 지표와 한계를 설명합니다.
          </p>
        </Link>
        <Link href="/glossary" className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-500 transition-colors">
          <h2 className="font-bold text-slate-100">야구 통계 용어</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            ERA, WHIP, OPS처럼 경기 분석에 자주 등장하는 기록의 의미와 해석 방법을 확인합니다.
          </p>
        </Link>
        <Link href="/schedule" className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-500 transition-colors">
          <h2 className="font-bold text-slate-100">일정과 경기 결과</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            날짜별 KBO 경기 일정과 결과를 살펴보고 각 경기의 분석 화면으로 이동합니다.
          </p>
        </Link>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-xs leading-relaxed text-slate-500">
        KBO Predictor는 KBO 공식 서비스가 아닌 비공식 데이터 분석 서비스입니다.
        예측 정보는 참고용이며 실제 경기 결과를 보장하지 않습니다.
      </section>
    </div>
  );
}
