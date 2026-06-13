import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "KBO Predictor 개인정보처리방침과 쿠키, 광고, 문의 방법 안내",
};

export default function PrivacyPage() {
  const lastUpdated = "2026년 6월 7일";

  return (
    <div className="prose prose-invert mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-black text-white">개인정보처리방침</h1>
      <p className="mb-8 text-sm text-slate-400">최종 수정일: {lastUpdated}</p>

      <Section title="1. 수집하는 정보">
        <p>
          KBO Predictor는 회원가입 없이 이용할 수 있는 서비스입니다. 이용자가 직접 이름, 주소, 결제 정보
          등을 입력하도록 요구하지 않습니다. 다만 서비스 운영과 보안을 위해 다음 정보가 자동으로 처리될 수
          있습니다.
        </p>
        <ul>
          <li>접속 IP 주소, 접속 일시, 브라우저와 운영체제 정보</li>
          <li>페이지 조회 기록, 오류 로그, 익명 방문 통계</li>
          <li>Google AdSense 등 광고 제공 과정에서 사용되는 쿠키와 유사 식별자</li>
        </ul>
      </Section>

      <Section title="2. 이용 목적">
        <ul>
          <li>서비스 운영, 장애 확인, 보안 점검</li>
          <li>방문 통계 분석을 통한 콘텐츠와 화면 구성 개선</li>
          <li>Google AdSense를 통한 광고 제공과 광고 성과 측정</li>
          <li>부정 이용 방지와 안정적인 서비스 제공</li>
        </ul>
      </Section>

      <Section title="3. 쿠키와 맞춤형 광고">
        <p>
          이 사이트는 Google AdSense를 사용할 수 있습니다. Google은 광고 제공을 위해 쿠키를 사용할 수 있고,
          이용자는 브라우저 설정에서 쿠키 저장을 거부하거나 삭제할 수 있습니다.
        </p>
        <p>
          맞춤형 광고 설정은{" "}
          <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
            Google 광고 설정
          </a>
          에서 관리할 수 있습니다. Google의 개인정보 처리 방식은{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
            Google 개인정보처리방침
          </a>
          을 참고해 주세요.
        </p>
      </Section>

      <Section title="4. 제3자 서비스">
        <p>서비스 운영 과정에서 다음 외부 서비스를 사용할 수 있습니다.</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="py-2 pr-4 text-left text-slate-300">제공자</th>
              <th className="py-2 pr-4 text-left text-slate-300">목적</th>
              <th className="py-2 text-left text-slate-300">정책</th>
            </tr>
          </thead>
          <tbody className="text-slate-400">
            <tr className="border-b border-slate-800">
              <td className="py-2 pr-4">Google LLC</td>
              <td className="py-2 pr-4">광고 제공, 광고 성과 측정</td>
              <td className="py-2">
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                  정책 보기
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="5. 보유 기간">
        <p>
          접속 로그와 오류 로그는 서비스 운영에 필요한 기간 동안 보관될 수 있으며, 법령상 보관 의무가 있는
          경우 해당 기간을 따릅니다. Google AdSense가 처리하는 정보는 Google의 정책에 따릅니다.
        </p>
      </Section>

      <Section title="6. 이용자의 권리">
        <p>
          이용자는 개인정보 열람, 정정, 삭제, 처리정지를 요청할 수 있습니다. 회원 계정 기반 서비스가 아니므로
          요청 시 본인 확인과 처리 가능 범위 확인이 필요할 수 있습니다.
        </p>
      </Section>

      <Section title="7. 개인정보 보호 책임자">
        <ul>
          <li>담당: KBO Predictor 운영자</li>
          <li>이메일: boksu.1990@gmail.com</li>
          <li>문의 처리: 접수 후 가능한 한 7일 이내 회신</li>
        </ul>
      </Section>

      <Section title="8. 방침 변경">
        <p>
          이 개인정보처리방침은 법령, 광고 정책, 서비스 구조 변경에 따라 수정될 수 있습니다. 중요한 변경이
          있을 경우 이 페이지에 수정일과 내용을 반영합니다.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 border-b border-slate-700 pb-2 text-lg font-bold text-slate-200">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-400">{children}</div>
    </section>
  );
}
