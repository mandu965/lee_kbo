import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "서비스 소개 | KBO Predictor",
  description:
    "KBO Predictor는 ELO 레이팅·선발 투수·최근 흐름·날씨·불펜 소진도와 확정 타순 강도를 복합 분석해 KBO 경기 결과를 예측합니다. 예측 신뢰도 지수와 선발 K/BB 제구력 분석을 포함한 데이터 기반 야구 분석 플랫폼입니다.",
};

const FEATURES = [
  {
    icon: "📊",
    title: "ELO 레이팅 시스템 (40% 가중)",
    desc: "체스·스포츠 분야에서 수십 년간 검증된 ELO 알고리즘을 KBO에 적용했습니다. 매 경기 결과에 따라 팀 레이팅이 오르내리며 현재 전력을 단일 숫자로 압축합니다. 시즌 초반 K=32로 빠르게 수렴하고 후반 K=20으로 안정화됩니다.",
  },
  {
    icon: "⚾",
    title: "선발 투수 분석 (28% 가중)",
    desc: "ERA(평균자책점), WHIP(이닝당 출루허용률), K/BB(탈삼진/볼넷 제구력 지수)를 조합해 선발 투수 점수를 산출합니다. K/BB가 높을수록 제구가 안정적인 투수로, ERA가 같아도 구종별 제구 차이를 반영합니다. 선발 정보는 네이버 스포츠 API를 통해 당일 확정 시 즉시 갱신됩니다.",
  },
  {
    icon: "📈",
    title: "최근 흐름 (14% 가중)",
    desc: "최근 10경기 승률(70%)과 평균 득실차(30%)를 합산한 흐름 점수를 사용합니다. 단순 승률만으로 포착되지 않는 팀의 상승세와 하강세를 수치화합니다.",
  },
  {
    icon: "🏠",
    title: "홈 이점 보정 (8% 가중)",
    desc: "KBO 10개 구단 모두 명확한 홈 이점을 보입니다. 홈 팬의 응원, 익숙한 그라운드, 이동 피로 없음 등이 복합 작용합니다. 고정 보정값 +3%를 홈팀에 적용합니다.",
  },
  {
    icon: "🏟️",
    title: "파크팩터 참고 지표 (검증 대기)",
    desc: "구장별 타자·투수 유리 정도를 참고용으로 표시합니다. 1.0 초과는 타자 친화, 미만은 투수 친화를 의미합니다. 현재 값은 예비 추정치이므로 승률 계산에는 반영하지 않으며, 다년 데이터 검증 후 재평가합니다.",
  },
  {
    icon: "🌤️",
    title: "날씨 보정 (3% 가중)",
    desc: "Open-Meteo API를 통해 경기 당일 기온과 날씨를 수집합니다. 10°C 미만 저온은 투수 유리(-3%), 30°C 이상 고온은 타자 유리(+2%). 돔 구장(고척)은 날씨 영향에서 제외합니다.",
  },
  {
    icon: "💪",
    title: "불펜 소진도 (2% 가중)",
    desc: "최근 3일간 불펜 투수가 던진 이닝 수를 집계해 소진도를 0~1 척도로 수치화합니다. 전날 접전으로 불펜이 소진된 팀은 당일 경기에서 불리할 수 있습니다.",
  },
  {
    icon: "📋",
    title: "확정 타순 강도 (최대 ±3%p 보정)",
    desc: "발표된 타순의 선수별 시즌 OPS를 타순별 가중치로 합산하고, 팀의 정상 타선 기대 OPS와 비교합니다. 양 팀 모두 확정 타순과 충분한 OPS 표본이 있을 때만 승률에 반영합니다.",
  },
];

const CONFIDENCE_FEATURE = {
  icon: "🎯",
  title: "예측 신뢰도 지수 (이 서비스만의 차별점)",
  desc: "확보된 지표가 같은 방향을 가리키는 비율을 계산합니다. 예를 들어 ELO·선발·최근흐름·홈이점이 모두 홈팀 우세를 가리키면 신뢰도 '높음', 지표가 엇갈리면 '낮음'으로 표시합니다. 신뢰도 낮은 경기는 이변 가능성이 높습니다.",
};

const MODEL_TABLE = [
  { factor: "ELO 레이팅",     weight: "40%", source: "자체 계산 (매일 자정 갱신)" },
  { factor: "선발 투수 (ERA·WHIP·K/BB)", weight: "28%", source: "KBO 공식 기록실" },
  { factor: "최근 흐름",       weight: "14%", source: "자체 계산" },
  { factor: "홈 이점",         weight: "8%",  source: "고정값 +3%" },
  { factor: "파크팩터",        weight: "참고용", source: "예비 추정치 · 승률 미반영" },
  { factor: "날씨",            weight: "3%",  source: "Open-Meteo" },
  { factor: "불펜 소진도",     weight: "2%",  source: "자체 계산 (경기별 로그 기반)" },
  { factor: "확정 타순 강도",   weight: "최대 ±3%p", source: "네이버 스포츠 타순 + KBO 공식 타자 OPS" },
];

const SCHEDULE = [
  { time: "00:10", task: "자정 통합 배치 — 전날 결과 재확인 → 정산 → ELO 업데이트 → 익일 일정 크롤 → 예측 초안 생성" },
  { time: "07:00", task: "KBO 공식 투수 시즌 성적 갱신" },
  { time: "07:15", task: "KBO 공식 타자 시즌 성적 갱신" },
  { time: "07:30", task: "KBO 팀 순위 갱신 (게임차·연속·홈원정 포함)" },
  { time: "11:30", task: "선발 라인업 1차 수집 — KBO 선발 발표 직후 (네이버 스포츠)" },
  { time: "12:00", task: "날씨 예보 수집 (Open-Meteo)" },
  { time: "13:00", task: "선발 라인업 2차 수집 — 미발표팀 재시도" },
  { time: "15:00", task: "선발 확정 기준 최종 예측 생성/갱신 + Supabase 동기화" },
  { time: "17:00", task: "선발 라인업 3차 수집 — 경기 직전 최종 확인" },
  { time: "23:30", task: "당일 경기 결과 수집" },
  { time: "23:50", task: "결과 정산 — is_correct, Brier Score 계산" },
];

const FAQ = [
  {
    q: "예측은 하루 몇 번 업데이트되나요?",
    a: "자정 00:10에 ELO 기반 초안이 만들어지고, 선발 발표 후 11:30·13:00에 갱신됩니다. 오후 3시에 선발 확정 기준 최종 예측이 생성됩니다. 경기 직전(17:00) 선발 변경이 있으면 한 번 더 갱신됩니다.",
  },
  {
    q: "선발 투수는 어떻게 알 수 있나요?",
    a: "KBO는 보통 경기 당일 오전 11시~오후 1시 사이에 선발을 발표합니다. 네이버 스포츠 API를 통해 발표 직후 수집합니다. 선발 미확정 경기에는 '추정' 표시와 함께 이닝 기준 에이스 투수 정보를 제공합니다.",
  },
  {
    q: "예측 신뢰도는 무엇인가요?",
    a: "확보된 지표가 같은 방향을 가리키는 비율입니다. '높음'은 지표 75% 이상 일치(예: ELO·선발·흐름·홈이점 모두 홈팀 우세), '낮음'은 50% 미만으로 이변 가능성이 큽니다. 단순 승률만 보지 말고 신뢰도도 참고하세요.",
  },
  {
    q: "적중률은 어떻게 계산하나요?",
    a: "예측 승팀과 실제 승팀이 일치하면 적중입니다. 무승부·취소 경기는 모수에서 제외합니다. 경기 종료 후 23:50에 자동 정산되어 히스토리 페이지에 반영됩니다. Brier Score(확률 예측 오차)도 함께 추적합니다.",
  },
  {
    q: "시즌 초반에는 왜 ELO가 부정확한가요?",
    a: "ELO는 경기를 거듭할수록 정확해집니다. 시즌 시작 시 모든 팀이 1500점에서 출발하며, 약 30~40경기 후부터 실력 차이가 안정적으로 반영됩니다.",
  },
  {
    q: "예측 결과를 스포츠 베팅에 활용해도 되나요?",
    a: "절대 권장하지 않습니다. 본 서비스는 통계 참고 자료이며 실제 결과와 다를 수 있습니다. 스포츠 베팅·도박 목적 이용을 엄격히 금지합니다.",
  },
];

const DATA_SOURCES = [
  { source: "KBO 공식 기록실", desc: "경기 일정·결과, 투수/타자 시즌 기록, 팀 순위 (AJAX 엔드포인트)", url: "https://www.koreabaseball.com" },
  { source: "네이버 스포츠", desc: "선발 라인업 — homeStarterName/awayStarterName 필드", url: "https://sports.naver.com/kbaseball" },
  { source: "Open-Meteo", desc: "경기 당일 날씨 예보 — 구장 GPS 기반 무료 기상 API", url: "https://open-meteo.com" },
];

const STATS = [
  { label: "예측 모델 변수", value: "6개 반영 + 참고" },
  { label: "선발 신뢰도 지수", value: "신규" },
  { label: "선발 K/BB 지수", value: "신규" },
  { label: "데이터 갱신", value: "매일 11회" },
];

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-14">

      {/* 히어로 */}
      <div className="text-center py-4">
        <div className="text-6xl mb-5">⚾</div>
        <h1 className="text-3xl font-black text-white mb-4">KBO Predictor</h1>
        <p className="text-slate-300 text-lg leading-relaxed max-w-2xl mx-auto">
          숫자로 읽는 야구. 경기 전날 밤 &quot;내일 경기 어느 팀이 이길까?&quot;라는 질문에
          <br className="hidden sm:block" />
          데이터가 근거 있는 답변을 드립니다.
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-blue-400">{s.value}</div>
            <div className="text-xs text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 서비스 소개 */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">KBO Predictor란?</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-slate-300 leading-relaxed space-y-4 text-sm">
          <p>
            KBO Predictor는 KBO(한국야구위원회) 프로야구 경기 결과를 데이터 기반으로 예측하는
            무료 야구 분석 플랫폼입니다. 팀 전력 지표(ELO), 선발 투수 성적, 최근 경기 흐름,
            구장 환경 참고 지표, 날씨, 불펜 소진도까지 복합 분석하고,
            확정 타순이 발표되면 라인업 강도를 추가 보정해 확률로 표현합니다.
          </p>
          <p>
            이 서비스만의 특징은 <strong className="text-white">예측 신뢰도 지수</strong>입니다.
            &quot;삼성 홈 56%&quot;라는 수치와 함께, 현재 확보된 지표 중 몇 개가 같은 방향을 가리키는지 보여줍니다.
            지표가 일치할수록 신뢰도 &apos;높음&apos;, 엇갈릴수록 &apos;낮음&apos;으로 표시해 이변 가능성을 직관적으로 전달합니다.
          </p>
          <p>
            선발 투수 분석에는 ERA·WHIP 외에 <strong className="text-white">K/BB 제구력 지수</strong>를 추가했습니다.
            탈삼진/볼넷 비율이 높은 투수는 ERA가 같아도 제구가 안정적이며, 이는 경기 결과에 중요한 영향을 미칩니다.
          </p>
        </div>
      </section>

      {/* 예측 신뢰도 — 차별점 하이라이트 */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">이 서비스만의 차별점</h2>
        <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-5 flex gap-4">
          <span className="text-3xl shrink-0 mt-0.5">{CONFIDENCE_FEATURE.icon}</span>
          <div>
            <div className="font-bold text-blue-300 mb-2">{CONFIDENCE_FEATURE.title}</div>
            <div className="text-sm text-slate-300 leading-relaxed">{CONFIDENCE_FEATURE.desc}</div>
            <div className="mt-3 flex gap-2 flex-wrap text-xs">
              <span className="px-2 py-1 rounded-full bg-emerald-900/50 text-emerald-400 font-bold">● 신뢰도 높음 — 지표 일치, 예측 확신</span>
              <span className="px-2 py-1 rounded-full bg-yellow-900/50 text-yellow-400 font-bold">◑ 신뢰도 보통 — 지표 혼재, 참고용</span>
              <span className="px-2 py-1 rounded-full bg-orange-900/50 text-orange-400 font-bold">○ 신뢰도 낮음 — 변수 많음, 이변 주의</span>
            </div>
          </div>
        </div>
      </section>

      {/* 예측 모델 가중치 */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">예측 모델 구성</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase">
                <th className="px-4 py-3 text-left">변수</th>
                <th className="px-4 py-3 text-center">가중치</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">데이터 출처</th>
              </tr>
            </thead>
            <tbody>
              {MODEL_TABLE.map((row) => (
                <tr key={row.factor} className="border-b border-slate-700/50">
                  <td className="px-4 py-3 text-slate-200 font-medium">{row.factor}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block bg-blue-900/50 text-blue-300 text-xs font-bold px-2 py-0.5 rounded-full">
                      {row.weight}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 변수 상세 */}
        <div className="space-y-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex gap-4">
              <span className="text-2xl shrink-0 mt-0.5">{f.icon}</span>
              <div>
                <div className="font-semibold text-slate-200 mb-1.5">{f.title}</div>
                <div className="text-sm text-slate-400 leading-relaxed">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 데이터 수집 스케줄 */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">데이터 수집 스케줄</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase">
                <th className="px-4 py-3 text-left w-20">시각</th>
                <th className="px-4 py-3 text-left">작업</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {SCHEDULE.map(({ time, task }) => (
                <tr key={time} className="border-b border-slate-700/30 last:border-0">
                  <td className="px-4 py-3 font-mono text-blue-400 whitespace-nowrap">{time}</td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{task}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-600 mt-2 text-right">KST 기준 · 집 PC 크롤러 → Supabase 클라우드 DB 자동 동기화</p>
      </section>

      {/* 데이터 출처 */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">데이터 출처</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-xl divide-y divide-slate-700 text-sm">
          {DATA_SOURCES.map((d) => (
            <div key={d.source} className="flex items-start justify-between px-5 py-4 gap-4">
              <div>
                <div className="font-medium text-slate-200">{d.source}</div>
                <div className="text-xs text-slate-500 mt-0.5">{d.desc}</div>
              </div>
              <a href={d.url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline shrink-0 mt-0.5">
                바로가기 →
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">자주 묻는 질문</h2>
        <div className="space-y-3">
          {FAQ.map((item) => (
            <div key={item.q} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <div className="font-semibold text-slate-200 mb-2 flex gap-2">
                <span className="text-blue-400 shrink-0">Q.</span>
                {item.q}
              </div>
              <div className="text-sm text-slate-400 leading-relaxed pl-5">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 용어 사전 안내 */}
      <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-5 flex items-start gap-4">
        <span className="text-2xl shrink-0">📖</span>
        <div>
          <div className="font-semibold text-blue-300 mb-1">야구 통계 용어가 낯선가요?</div>
          <p className="text-sm text-slate-400 mb-3">
            ERA, WHIP, OPS, K/BB 등 영문 약어가 어렵게 느껴지신다면 용어 사전을 참고하세요.
          </p>
          <Link href="/glossary"
            className="inline-block text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors">
            용어 사전 보기 →
          </Link>
        </div>
      </div>

      {/* 면책 */}
      <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-yellow-400 mb-2">⚠️ 이용 안내</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          KBO Predictor는 KBO 공식 서비스가 아닌 비공식 데이터 분석 서비스입니다.
          {" "}예측 정보는 통계적 분석에 기반한 참고 자료이며 실제 경기 결과를 보장하지 않습니다.
          투자·도박 등의 목적으로 활용하지 마시기 바랍니다.
        </p>
      </div>

      <div className="text-center text-sm text-slate-500 pb-4">
        문의: boksu.1990@gmail.com ·{" "}
        <Link href="/privacy" className="text-blue-400 hover:underline">개인정보처리방침</Link>
        {" · "}
        <Link href="/terms" className="text-blue-400 hover:underline">이용약관</Link>
      </div>
    </div>
  );
}
