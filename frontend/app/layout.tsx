import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import "./globals.css";
import NavBar from "./NavBar";
import VisitorTracker from "@/components/VisitorTracker";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lee-kbo.onrender.com";
const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_ID;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "KBO Predictor | 데이터 기반 KBO 경기 분석",
    template: "%s | KBO Predictor",
  },
  description:
    "KBO 경기 일정, 팀 순위, 선수 기록, ELO 기반 승부 예측과 분석 글을 제공하는 비공식 데이터 분석 사이트입니다.",
  keywords: ["KBO", "KBO 예측", "KBO 분석", "프로야구 기록", "야구 통계", "ELO", "승부 예측"],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: "KBO Predictor",
    title: "KBO Predictor | 데이터 기반 KBO 경기 분석",
    description:
      "KBO 경기 일정, 팀 순위, 선수 기록, ELO 기반 승부 예측과 분석 글을 제공하는 비공식 데이터 분석 사이트입니다.",
  },
  twitter: {
    card: "summary",
    title: "KBO Predictor",
    description: "데이터 기반 KBO 경기 분석과 승부 예측",
  },
  robots: { index: true, follow: true },
  verification: { google: "_QhLLrBaUMZ6GcBG8MFpQd_qV1dHkKlK02jtqTfjOrw" },
};

const FOOTER_LINKS = [
  { href: "/about", label: "서비스 소개" },
  { href: "/contact", label: "문의" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/terms", label: "이용약관" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {ADSENSE_ID && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
        <NavBar />
        <VisitorTracker />

        <main className="max-w-5xl mx-auto px-4 py-6 pb-24 sm:py-8">{children}</main>

        <footer
          className="mt-12 px-4 py-10 pb-24 text-center text-xs sm:mt-20 sm:pb-10"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "#94a3b8" }}
        >
          <div className="mb-3 flex flex-wrap justify-center gap-5">
            {FOOTER_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className="transition-colors hover:text-slate-200">
                {label}
              </Link>
            ))}
          </div>
          <p>KBO Predictor는 KBO 공식 서비스가 아닌 비공식 데이터 분석 사이트입니다.</p>
          <p className="mt-1 text-slate-500">
            데이터 출처: KBO 공식 기록실, 네이버 스포츠, Open-Meteo. 예측 정보는 참고용입니다.
          </p>
        </footer>
      </body>
    </html>
  );
}
