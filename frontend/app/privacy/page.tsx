import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 | KBO Predictor",
  description: "KBO Predictor 개인정보처리방침",
};

export default function PrivacyPage() {
  const lastUpdated = "2026년 6월 2일";

  return (
    <div className="max-w-3xl mx-auto prose prose-invert">
      <h1 className="text-2xl font-black text-white mb-2">개인정보처리방침</h1>
      <p className="text-slate-400 text-sm mb-8">최종 수정일: {lastUpdated}</p>

      <Section title="1. 수집하는 정보">
        <p>
          KBO Predictor(이하 &quot;서비스&quot;)는 회원가입 없이 이용 가능하며, 별도의 개인 식별 정보를
          직접 수집하지 않습니다. 다만 서비스 이용 과정에서 아래 정보가 자동으로 수집될 수 있습니다.
        </p>
        <ul>
          <li>접속 IP 주소 및 접속 일시</li>
          <li>브라우저 종류 및 운영체제</li>
          <li>일별 방문 통계를 위한 익명 브라우저 식별 ID (서버에는 해시값만 저장)</li>
          <li>쿠키 및 유사 추적 기술 (Google AdSense)</li>
        </ul>
      </Section>

      <Section title="2. 정보의 이용 목적">
        <ul>
          <li>서비스 운영 및 유지보수</li>
          <li>이용 통계 분석을 통한 서비스 품질 개선</li>
          <li>관심사 기반 맞춤형 광고 제공 (Google AdSense)</li>
          <li>부정 이용 방지 및 보안 강화</li>
        </ul>
      </Section>

      <Section title="3. 쿠키(Cookie) 정책">
        <p>
          본 서비스는 Google AdSense를 통해 쿠키를 사용할 수 있습니다.
          쿠키는 웹사이트가 사용자 브라우저에 저장하는 소량의 데이터로,
          광고 개인화 및 방문 통계 수집에 활용됩니다.
        </p>
        <p>
          브라우저 설정에서 쿠키를 거부하거나 삭제할 수 있으나,
          일부 서비스 기능이 제한될 수 있습니다.
          Google의 광고 쿠키는{" "}
          <a
            href="https://adssettings.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            Google 광고 설정
          </a>
          에서 관리하실 수 있습니다.
        </p>
      </Section>

      <Section title="4. 제3자 제공 및 위탁">
        <p>
          서비스는 다음 제3자 서비스를 이용하며, 각 서비스의 개인정보처리방침이 적용됩니다.
        </p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 pr-4 text-slate-300">수탁업체</th>
              <th className="text-left py-2 pr-4 text-slate-300">목적</th>
              <th className="text-left py-2 text-slate-300">정책 링크</th>
            </tr>
          </thead>
          <tbody className="text-slate-400">
            <tr className="border-b border-slate-800">
              <td className="py-2 pr-4">Google LLC</td>
              <td className="py-2 pr-4">광고 게재 (AdSense)</td>
              <td className="py-2">
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">정책 보기</a>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="5. 정보 보유 기간">
        <p>
          서비스 운영 환경에서 처리되는 접속 로그의 보존 기간은 호스팅 환경의 설정과
          관련 정책에 따릅니다. Google AdSense가 처리하는 정보는 Google의 정책에 따릅니다.
        </p>
      </Section>

      <Section title="6. 이용자의 권리">
        <p>이용자는 다음 권리를 행사할 수 있습니다.</p>
        <ul>
          <li>개인정보 열람, 수정, 삭제 요청</li>
          <li>개인정보 처리 정지 요청</li>
          <li>Google AdSense 광고 개인화 거부</li>
        </ul>
        <p>
          권리 행사는 아래 개인정보보호책임자에게 이메일로 문의하시기 바랍니다.
        </p>
      </Section>

      <Section title="7. 개인정보보호책임자">
        <p>개인정보 관련 문의사항은 아래로 연락하시기 바랍니다.</p>
        <ul>
          <li>이메일: boksu.1990@gmail.com</li>
          <li>처리 기간: 접수 후 7일 이내</li>
        </ul>
      </Section>

      <Section title="8. 맞춤형 광고 및 비개인화 광고">
        <p>
          본 서비스는 Google AdSense를 통해 광고를 표시합니다.
          Google은 본 사이트 방문자에게 관심사 기반 광고를 표시하기 위해 쿠키를 사용할 수 있습니다.
        </p>
        <ul>
          <li>Google은 광고 파트너로서 본 사이트에 광고를 게재합니다.</li>
          <li>Google이 사용하는 쿠키를 통해 이전 방문 기록을 기반으로 광고가 표시될 수 있습니다.</li>
          <li>
            광고 개인화를 원치 않으시면{" "}
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              Google 광고 설정
            </a>
            에서 비활성화하실 수 있습니다.
          </li>
          <li>
            Google의 개인정보처리방침은{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              여기
            </a>
            에서 확인하실 수 있습니다.
          </li>
        </ul>
      </Section>

      <Section title="9. 방침 변경 고지">
        <p>
          본 개인정보처리방침은 법령·서비스 변경에 따라 수정될 수 있으며,
          변경 시 본 페이지에 변경 내용과 시행일을 명시합니다.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-slate-200 mb-3 pb-2 border-b border-slate-700">
        {title}
      </h2>
      <div className="text-slate-400 leading-relaxed space-y-3 text-sm">{children}</div>
    </section>
  );
}
