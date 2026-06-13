import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "서비스 소개",
  description:
    "KBO Predictor의 데이터 출처, 예측 모델, 업데이트 방식, 이용 시 주의사항을 안내합니다.",
};

const MODEL_TABLE = [
  { factor: "ELO 레이팅", weight: "40%", source: "경기 결과 기반 자체 계산" },
  { factor: "선발 투수 지표", weight: "28%", source: "KBO 기록과 네이버 스포츠 선발 정보" },
  { factor: "최근 경기 흐름", weight: "14%", source: "최근 10경기 승률과 득실 흐름" },
  { factor: "홈 어드밴티지", weight: "8%", source: "홈 경기 보정값" },
  { factor: "날씨와 구장 환경", weight: "참고", source: "Open-Meteo와 구장 정보" },
  { factor: "불펜 피로도", weight: "2%", source: "최근 등판 로그 기반 추정" },
  { factor: "확정 라인업", weight: "최대 보정", source: "발표된 라인업이 있을 때만 반영" },
];

const FAQ = [
  {
    q: "예측은 언제 업데이트되나요?",
    a: "기본 예측은 매일 일정 수집 뒤 생성하고, 선발 투수와 라인업 정보가 확인되면 다시 갱신합니다. 경기 직전 변경 사항은 데이터 반영 시점에 따라 지연될 수 있습니다.",
  },
  {
    q: "예측 확률은 어떤 의미인가요?",
    a: "확률은 현재 수집된 지표를 바탕으로 한 모델의 추정치입니다. 실제 승패를 보장하지 않으며, 경기 중 변수와 현장 상황은 완전히 반영할 수 없습니다.",
  },
  {
    q: "이 사이트는 KBO 공식 서비스인가요?",
    a: "아닙니다. KBO Predictor는 팬과 독자를 위한 비공식 데이터 분석 사이트입니다. 공식 기록과 일정은 KBO 공식 채널을 함께 확인해 주세요.",
  },
  {
    q: "도박이나 베팅 용도로 사용할 수 있나요?",
    a: "권장하지 않습니다. 이 사이트의 모든 정보는 스포츠 기록 이해와 경기 관전 참고를 위한 콘텐츠입니다.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <section className="py-3 text-center">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-300">About</p>
        <h1 className="text-3xl font-black text-white">KBO Predictor</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-300">
          KBO Predictor는 KBO 경기 일정, 팀 순위, 선수 기록, 예측 모델 결과를 한곳에서 볼 수 있도록 만든
          비공식 야구 데이터 분석 사이트입니다. 숫자만 나열하기보다 독자가 경기 흐름을 이해할 수 있도록
          지표의 의미와 한계까지 함께 설명합니다.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold text-white">무엇을 제공합니다</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Feature title="오늘의 경기 분석" body="경기별 선발 정보, 예측 승률, 최근 흐름을 카드 형태로 제공합니다." />
          <Feature title="팀과 선수 기록" body="팀 순위, 타자·투수 주요 지표, 선수 상세 기록을 정리합니다." />
          <Feature title="분석 글" body="매일 생성되는 경기 프리뷰와 시즌 흐름 리포트를 블로그 형식으로 제공합니다." />
          <Feature title="용어 사전" body="야구 통계 용어를 초보 독자도 이해할 수 있게 풀어 설명합니다." />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold text-white">예측 모델 구성</h2>
        <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase text-slate-400">
                <th className="px-4 py-3 text-left">지표</th>
                <th className="px-4 py-3 text-center">비중</th>
                <th className="hidden px-4 py-3 text-left sm:table-cell">출처와 설명</th>
              </tr>
            </thead>
            <tbody>
              {MODEL_TABLE.map((row) => (
                <tr key={row.factor} className="border-b border-slate-700/50 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-200">{row.factor}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block rounded-full bg-indigo-900/50 px-2 py-0.5 text-xs font-bold text-indigo-300">
                      {row.weight}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-slate-400 sm:table-cell">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          모델 비중은 운영 과정에서 검증 결과에 따라 조정될 수 있습니다. 조정이 있을 때는 분석 글과 서비스
          소개 페이지에 반영합니다.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold text-white">데이터 출처</h2>
        <div className="divide-y divide-slate-700 rounded-lg border border-slate-700 bg-slate-800 text-sm">
          <DataSource title="KBO 공식 기록실" body="경기 일정, 결과, 팀 순위, 선수 시즌 기록 확인" url="https://www.koreabaseball.com" />
          <DataSource title="네이버 스포츠" body="경기별 선발 투수와 라인업 확인" url="https://sports.naver.com/kbaseball" />
          <DataSource title="Open-Meteo" body="구장 위치 기반 날씨 참고 정보" url="https://open-meteo.com" />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold text-white">자주 묻는 질문</h2>
        <div className="space-y-3">
          {FAQ.map((item) => (
            <div key={item.q} className="rounded-lg border border-slate-700 bg-slate-800 p-5">
              <h3 className="font-semibold text-slate-100">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-yellow-700/40 bg-yellow-900/20 p-5">
        <h2 className="text-sm font-semibold text-yellow-300">이용 안내</h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          모든 예측과 분석은 참고용 콘텐츠입니다. 실제 경기 결과를 보장하지 않으며, 사행성·도박성 목적으로
          이용하는 것을 권장하지 않습니다.
        </p>
      </section>

      <div className="pb-4 text-center text-sm text-slate-500">
        문의:{" "}
        <Link href="/contact" className="text-indigo-400 hover:underline">
          문의 페이지
        </Link>
      </div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-5">
      <h3 className="font-semibold text-slate-100">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
    </div>
  );
}

function DataSource({ title, body, url }: { title: string; body: string; url: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div>
        <div className="font-medium text-slate-200">{title}</div>
        <div className="mt-0.5 text-xs text-slate-500">{body}</div>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-indigo-400 hover:underline">
        바로가기
      </a>
    </div>
  );
}
