import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관",
  description: "KBO Predictor 이용 조건, 면책 사항, 광고와 저작권 안내",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-black text-white">이용약관</h1>
      <p className="mb-8 text-sm text-slate-400">시행일: 2026년 6월 7일</p>

      <div className="space-y-8">
        <Section title="1. 목적">
          <p>
            이 약관은 KBO Predictor가 제공하는 KBO 경기 데이터, 기록 분석, 예측 콘텐츠 이용 조건과 운영자와
            이용자 사이의 권리 및 책임을 안내하기 위한 문서입니다.
          </p>
        </Section>

        <Section title="2. 서비스 내용">
          <ul>
            <li>KBO 경기 일정, 결과, 팀 순위 정보</li>
            <li>선수 기록과 주요 통계 지표 정리</li>
            <li>ELO와 기록 기반 경기 예측 및 분석</li>
            <li>경기 프리뷰, 리포트, 야구 통계 용어 설명</li>
          </ul>
        </Section>

        <Section title="3. 이용상 주의사항">
          <ul>
            <li>예측과 분석은 참고용 콘텐츠이며 실제 경기 결과를 보장하지 않습니다.</li>
            <li>데이터 수집 시점, 외부 제공처 오류, 경기 취소와 변경에 따라 정보가 달라질 수 있습니다.</li>
            <li>이 사이트의 콘텐츠를 사행성·도박성 목적으로 이용하는 것을 권장하지 않습니다.</li>
            <li>서비스는 운영 상황, 시스템 점검, 외부 API 장애로 일시 중단될 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="4. 지식재산권">
          <p>
            사이트의 화면 구성, 자체 분석 문장, 예측 모델 설명, 소스 코드는 운영자에게 권리가 있습니다. KBO
            경기 기록과 선수 기록은 각 데이터 제공처의 권리를 존중합니다.
          </p>
          <p>
            이용자는 서비스를 개인적인 참고 목적으로 이용할 수 있으며, 콘텐츠를 무단 복제하거나 상업적으로
            재배포해서는 안 됩니다.
          </p>
        </Section>

        <Section title="5. 광고">
          <p>
            이 사이트는 Google AdSense 등 광고 서비스를 사용할 수 있습니다. 광고 수익은 서버 운영과 데이터
            수집 비용, 콘텐츠 개선에 사용됩니다. 광고와 관련된 개인정보 처리는 개인정보처리방침을 따릅니다.
          </p>
        </Section>

        <Section title="6. 면책">
          <p>
            운영자는 정확한 정보를 제공하기 위해 노력하지만 모든 데이터의 완전성과 실시간성을 보장하지
            않습니다. 이용자가 서비스 정보를 바탕으로 내린 판단에 대한 책임은 이용자 본인에게 있습니다.
          </p>
        </Section>

        <Section title="7. 약관 변경">
          <p>
            운영자는 필요할 경우 이 약관을 변경할 수 있습니다. 변경 사항은 이 페이지에 시행일과 함께
            게시합니다.
          </p>
        </Section>

        <Section title="8. 문의">
          <p>서비스 이용과 약관에 관한 문의는 boksu.1990@gmail.com 으로 연락해 주세요.</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 border-b border-slate-700 pb-2 text-base font-bold text-slate-200">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-400">{children}</div>
    </section>
  );
}
