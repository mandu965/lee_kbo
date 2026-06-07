import type { Metadata } from "next";
import Link from "next/link";

const CONTACT_EMAIL = "boksu.1990@gmail.com";

export const metadata: Metadata = {
  title: "문의",
  description: "KBO Predictor 운영 문의 및 연락처 안내",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-300">Contact</p>
        <h1 className="text-2xl font-black text-white">문의</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          KBO Predictor 이용 중 발견한 오류, 데이터 정정 요청, 광고 및 개인정보 관련 문의는 아래 이메일로
          보내주세요. 가능한 범위에서 내용을 확인한 뒤 답변드리겠습니다.
        </p>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800 p-5">
        <h2 className="text-base font-bold text-slate-100">운영자 연락처</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">서비스명</dt>
            <dd className="mt-1 font-medium text-slate-200">KBO Predictor</dd>
          </div>
          <div>
            <dt className="text-slate-500">이메일</dt>
            <dd className="mt-1">
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-indigo-400 hover:underline">
                {CONTACT_EMAIL}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">문의 가능 내용</dt>
            <dd className="mt-1 text-slate-300">
              데이터 오류, 페이지 오류, 개인정보 관련 요청, 광고 관련 문의, 콘텐츠 제휴 문의
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 text-sm leading-relaxed text-slate-400">
        빠른 확인을 위해 문제가 발생한 페이지 주소, 확인한 날짜, 오류 내용을 함께 적어주세요. 개인정보와
        광고 관련 내용은{" "}
        <Link href="/privacy" className="text-indigo-400 hover:underline">
          개인정보처리방침
        </Link>
        도 함께 참고하실 수 있습니다.
      </section>
    </div>
  );
}
