import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "서비스 소개 | KBO Predictor",
  description:
    "KBO Predictor는 ELO 레이팅, 선발 투수 지표, 최근 흐름, 파크팩터, 날씨 데이터를 복합 분석해 KBO 경기 결과를 예측합니다. 데이터 기반 야구 분석 플랫폼의 모델 원리와 활용법을 소개합니다.",
};

const FEATURES = [
  {
    icon: "📊",
    title: "ELO 레이팅 시스템",
    desc: "체스·스포츠 분야에서 수십 년간 검증된 ELO 알고리즘을 KBO에 적용했습니다. 매 경기 결과에 따라 팀의 레이팅이 오르내리며, 현재 시즌 전력 수준을 단일 숫자로 압축합니다. 시즌 초반에는 K=32로 빠르게 수렴하고, 후반에는 K=20으로 안정화됩니다.",
  },
  {
    icon: "⚾",
    title: "선발 투수 분석 (28% 가중)",
    desc: "ERA(평균자책점)와 WHIP(이닝당 출루허용률)을 조합해 선발 투수 점수를 산출합니다. 야구는 '투수 놀음'이라는 말처럼, 두 팀의 선발 투수 차이는 경기 결과에 결정적 영향을 미칩니다. 선발 정보가 없을 경우 리그 평균값으로 보정합니다.",
  },
  {
    icon: "📈",
    title: "최근 흐름 (14% 가중)",
    desc: "최근 10경기 승률(70%)과 평균 득실차(30%)를 합산한 '흐름 점수'를 사용합니다. 단순 승률만으로는 포착되지 않는 팀의 상승세와 하강세를 수치화해 예측에 반영합니다.",
  },
  {
    icon: "🏠",
    title: "홈 이점 보정 (8% 가중)",
    desc: "KBO 10개 구단 모두 명확한 홈 이점을 보입니다. 홈 팬의 응원, 익숙한 그라운드, 이동 피로 없음 등 여러 요인이 복합적으로 작용합니다. 고정 보정값 +3%를 홈팀에 적용합니다.",
  },
  {
    icon: "🏟️",
    title: "파크팩터 보정 (5% 가중)",
    desc: "구장별 환경 차이를 자체 파크팩터 DB로 반영합니다. 파크팩터는 경기 환경을 설명하는 보조 지표이며, 모델 변경 이력과 함께 지속적으로 검증합니다.",
  },
  {
    icon: "🌤️",
    title: "날씨 보정 (3% 가중)",
    desc: "Open-Meteo 무료 API를 통해 경기 당일 오후 6시 기온과 날씨를 수집합니다. 10°C 미만의 저온은 투수에게 유리하고(-3%), 30°C 이상의 고온은 타자에게 유리합니다(+2%). 돔 구장(고척)은 날씨 영향에서 제외됩니다.",
  },
  {
    icon: "💪",
    title: "불펜 소진도 (2% 가중)",
    desc: "최근 3일간 불펜 투수가 던진 이닝 수를 집계해 소진도를 0~1 척도로 수치화합니다. 전날 접전으로 불펜이 소진된 팀은 당일 경기에서 불리할 수 있습니다.",
  },
];

const MODEL_TABLE = [
  { factor: "ELO 레이팅",   weight: "40%", source: "자체 계산" },
  { factor: "선발 투수",     weight: "28%", source: "KBO 공식 기록실" },
  { factor: "최근 흐름",     weight: "14%", source: "자체 계산" },
  { factor: "홈 이점",       weight: "8%",  source: "고정값" },
  { factor: "파크팩터",      weight: "5%",  source: "자체 DB" },
  { factor: "날씨",          weight: "3%",  source: "Open-Meteo" },
  { factor: "불펜 소진도",   weight: "2%",  source: "자체 계산" },
];

const FAQ = [
  {
    q: "예측은 하루 몇 번 업데이트되나요?",
    a: "경기 당일 오후 3시에 확보된 데이터를 기준으로 예측을 생성합니다. 선발 정보가 아직 없으면 리그 평균값을 적용한 참고용 예측을 제공합니다. 경기 결과는 오후 11시 30분에 수집하고 ELO는 자정에 업데이트합니다.",
  },
  {
    q: "적중률은 어떻게 계산하나요?",
    a: "예측 승팀과 실제 승팀이 일치하면 적중으로 처리합니다. 무승부와 취소 경기는 집계에서 제외합니다. 모델 성과는 실제 경기 정산 데이터가 충분히 쌓인 뒤 공개합니다.",
  },
  {
    q: "시즌 초반에는 왜 ELO가 부정확한가요?",
    a: "ELO는 경기를 거듭할수록 정확해지는 시스템입니다. 시즌 시작 시 모든 팀은 1500점에서 출발하며, 약 30~40경기 후부터 실력 차이가 레이팅에 안정적으로 반영됩니다.",
  },
  {
    q: "예측 결과를 스포츠 베팅에 활용해도 되나요?",
    a: "절대 권장하지 않습니다. 본 서비스의 예측은 통계 모델의 참고 자료이며, 실제 결과와 다를 수 있습니다. 스포츠 베팅·도박 목적의 이용을 엄격히 금지합니다.",
  },
];

const STATS = [
  { label: "예측 모델 변수", value: "7가지" },
  { label: "모델 성과", value: "검증 중" },
  { label: "외부 데이터", value: "공식 기록+날씨" },
  { label: "데이터 갱신", value: "매일" },
];

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-14">

      {/* 히어로 */}
      <div className="text-center py-4">
        <div className="text-6xl mb-5">⚾</div>
        <h1 className="text-3xl font-black text-white mb-4">KBO Predictor</h1>
        <p className="text-slate-300 text-lg leading-relaxed max-w-2xl mx-auto">
          숫자로 읽는 야구. 경기 전날 밤 "내일 경기 어느 팀이 이길까?"라는 질문에
          <br className="hidden sm:block" />
          데이터가 근거 있는 답변을 드립니다.
        </p>
      </div>

      {/* 통계 */}
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
            무료 야구 분석 플랫폼입니다. 단순히 "어느 팀이 강하다"는 주관적 판단이 아니라,
            팀 전력 지표(ELO), 선발 투수 성적, 최근 경기 흐름, 구장 환경, 날씨까지 7가지 변수를
            복합 분석해 확률로 표현합니다.
          </p>
          <p>
            예측 결과는 단순 승패가 아니라 <strong className="text-white">홈팀 승률 %</strong>로 제공됩니다.
            예를 들어 "LG 홈 62% vs KT 원정 38%"라면, 통계적으로 100번 붙었을 때
            LG가 62번 이길 것으로 예측한다는 의미입니다. 단, 어떤 모델도 100% 확실하지 않으며,
            이변은 항상 일어납니다.
          </p>
          <p>
            데이터는 KBO 공식 기록실과 Open-Meteo 날씨 API에서
            수집됩니다. 경기 결과 발생 후 ELO 레이팅이 자동 업데이트되어
            시즌이 진행될수록 예측 정확도가 높아집니다.
          </p>
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
                <th className="px-4 py-3 text-left">데이터 출처</th>
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
                  <td className="px-4 py-3 text-slate-400 text-xs">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 기능 상세 */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">각 변수 상세 설명</h2>
        <div className="space-y-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex gap-4">
              <span className="text-2xl shrink-0 mt-0.5">{f.icon}</span>
              <div>
                <div className="font-semibold text-slate-200 mb-2">{f.title}</div>
                <div className="text-sm text-slate-400 leading-relaxed">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 데이터 업데이트 스케줄 */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">데이터 수집 스케줄</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase">
                <th className="px-4 py-3 text-left">시각</th>
                <th className="px-4 py-3 text-left">작업</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {[
                ["00:00", "ELO 레이팅 업데이트 (전날 경기 결과 반영)"],
                ["06:00", "KBO 경기 일정 수집"],
                ["07:00", "KBO 공식 기록실 투수 성적 수집"],
                ["12:00", "경기 당일 날씨 예보 수집"],
                ["15:00", "확보된 데이터를 기준으로 경기 예측 생성"],
                ["23:30", "당일 경기 결과 업데이트"],
              ].map(([time, task]) => (
                <tr key={time} className="border-b border-slate-700/30">
                  <td className="px-4 py-3 font-mono text-blue-400">{time}</td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{task}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 데이터 출처 */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">데이터 출처</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-xl divide-y divide-slate-700 text-sm">
          {[
            { source: "KBO 공식 기록실", desc: "경기 일정, 결과, 투수 시즌 기록을 수집하는 공식 기록 제공처", url: "https://www.koreabaseball.com" },
            { source: "Open-Meteo",     desc: "경기 당일 날씨 예보 — 무료 기상 데이터 API (구장 GPS 기반)", url: "https://open-meteo.com" },
          ].map((d) => (
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
                <span className="text-blue-400">Q.</span>
                {item.q}
              </div>
              <div className="text-sm text-slate-400 leading-relaxed pl-5">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 야구 용어 안내 */}
      <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-5 flex items-start gap-4">
        <span className="text-2xl shrink-0">📖</span>
        <div>
          <div className="font-semibold text-blue-300 mb-1">야구 통계 용어가 낯선가요?</div>
          <p className="text-sm text-slate-400 mb-3">
            ERA, WHIP, OPS, WAR 등 영문 약어가 어렵게 느껴지신다면
            야구 통계 용어 사전을 참고하세요.
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
          {" "}
          본 서비스의 예측 정보는 통계적 분석에 기반한 참고 자료이며, 실제 경기 결과를 보장하지 않습니다.
          투자·도박 등의 목적으로 활용하지 마시기 바랍니다.
          데이터는 외부 소스에서 수집되므로 일부 오류가 있을 수 있습니다.
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
