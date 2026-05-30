import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관 | KBO Predictor",
  description: "KBO Predictor 이용약관",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-black text-white mb-2">이용약관</h1>
      <p className="text-slate-400 text-sm mb-8">시행일: 2026년 5월 29일</p>

      <div className="space-y-8">
        <Section title="제1조 (목적)">
          본 약관은 KBO Predictor(이하 "서비스")가 제공하는 KBO 야구 데이터 분석 및
          승부예측 서비스의 이용 조건과 절차, 이용자와 운영자 간의 권리·의무를
          규정함을 목적으로 합니다.
        </Section>

        <Section title="제2조 (서비스 내용)">
          <p>서비스는 다음을 제공합니다.</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>KBO 정규시즌 경기 일정 및 결과 정보</li>
            <li>통계 기반 경기 결과 예측 및 분석</li>
            <li>팀·선발 투수 성적 데이터 시각화</li>
            <li>예측 적중률 히스토리</li>
          </ul>
        </Section>

        <Section title="제3조 (면책사항)">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              서비스의 예측 정보는 통계적 분석 결과이며, 실제 경기 결과와 다를 수 있습니다.
              예측 정보를 근거로 한 이용자의 투자·도박·배팅 행위에 대한 책임은 이용자 본인에게 있습니다.
            </li>
            <li>
              서비스는 외부 데이터 소스(KBO 공식 기록실, Open-Meteo 등)의 정확성을 보증하지 않으며,
              데이터 오류로 인한 손해에 책임을 지지 않습니다.
            </li>
            <li>
              서비스는 시스템 점검, 천재지변 등 불가피한 사유로 예고 없이 중단될 수 있습니다.
            </li>
          </ul>
        </Section>

        <Section title="제4조 (지식재산권)">
          <p>
            서비스 내 예측 알고리즘, 디자인, 소스코드 등은 운영자의 지식재산입니다.
            KBO 경기 기록 및 선수 성적은 KBO 및 각 데이터 제공처에 귀속됩니다.
          </p>
          <p className="mt-2">
            이용자는 서비스 콘텐츠를 상업적 목적으로 무단 복제·배포할 수 없습니다.
          </p>
        </Section>

        <Section title="제5조 (광고)">
          <p>
            서비스는 Google AdSense를 통해 광고를 게재합니다.
            광고 수익은 서비스 운영 및 데이터 비용에 사용됩니다.
            이용자는 광고 차단 소프트웨어를 사용할 수 있으나,
            서비스 지속 운영을 위해 광고 허용을 권장합니다.
          </p>
        </Section>

        <Section title="제6조 (약관 변경)">
          <p>
            운영자는 필요한 경우 본 약관을 변경할 수 있으며,
            변경 시 서비스 내 공지 또는 이용약관 페이지를 통해 7일 이전에 고지합니다.
          </p>
        </Section>

        <Section title="제7조 (준거법 및 관할)">
          <p>
            본 약관은 대한민국 법률에 따라 해석되며,
            서비스 이용과 관련한 분쟁은 운영자 소재지 관할 법원을 제1심 관할로 합니다.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-slate-200 mb-3 pb-2 border-b border-slate-700">
        {title}
      </h2>
      <div className="text-slate-400 leading-relaxed text-sm space-y-2">{children}</div>
    </section>
  );
}
