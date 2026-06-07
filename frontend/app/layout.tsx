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
    default: "KBO Predictor — 데이터 기반 KBO 승부예측",
    template: "%s | KBO Predictor",
  },
  description:
    "ELO·선발투수·최근흐름·날씨·불펜·확정 타순을 바탕으로 KBO 경기 결과를 분석합니다. 선수 기록, 팀 순위, 경기별 핵심 해설까지 제공하는 데이터 기반 야구 분석 플랫폼.",
  keywords: ["KBO", "야구 예측", "승부예측", "KBO 분석", "야구 통계", "선발투수", "ELO", "팀 순위"],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: "KBO Predictor",
    title: "KBO Predictor — 데이터 기반 KBO 승부예측",
    description: "ELO·선발투수·최근흐름·불펜·확정 타순을 바탕으로 KBO 경기를 분석합니다.",
  },
  twitter: { card: "summary", title: "KBO Predictor", description: "데이터 기반 KBO 승부예측 플랫폼" },
  robots: { index: true, follow: true },
  verification: { google: "_QhLLrBaUMZ6GcBG8MFpQd_qV1dHkKlK02jtqTfjOrw" },
};


const FOOTER_LINKS = [
  { href: "/about",   label: "서비스 소개" },
  { href: "/privacy", label: "개인정보" },
  { href: "/terms",   label: "이용약관" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        {/* Pretendard 폰트: body 내 link는 브라우저가 정상 처리 */}
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

        <main className="max-w-5xl mx-auto px-4 py-6 pb-24 sm:py-8">
          {children}
        </main>

        <footer className="mt-12 px-4 py-10 pb-24 text-center text-xs sm:mt-20 sm:pb-10"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "#334155" }}>
          <div className="flex justify-center gap-5 mb-3">
            {FOOTER_LINKS.map(({ href, label }) => (
              <Link key={href} href={href}
                className="transition-colors hover:text-slate-400">
                {label}
              </Link>
            ))}
          </div>
          <p className="text-slate-600">KBO Predictor · 데이터 출처: KBO 공식 기록실 / Open-Meteo</p>
          <p className="mt-1 text-slate-700">비공식 데이터 분석 서비스 · 예측 정보는 참고용입니다</p>
        </footer>
      </body>
    </html>
  );
}
