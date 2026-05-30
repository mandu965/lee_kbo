import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kbo-predictor.vercel.app";
const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_ID;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "KBO Predictor — 데이터 기반 승부예측",
    template: "%s | KBO Predictor",
  },
  description:
    "ELO 레이팅 · 선발 투수 · 파크팩터 · 날씨까지 7가지 변수로 KBO 경기 결과를 예측합니다. 데이터 기반 야구 분석 플랫폼.",
  keywords: ["KBO", "야구 예측", "승부예측", "KBO 분석", "야구 통계", "ELO 레이팅"],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: "KBO Predictor",
    title: "KBO Predictor — 데이터 기반 승부예측",
    description: "ELO 레이팅 · 선발 투수 · 파크팩터 · 날씨까지 7가지 변수로 KBO 경기를 예측합니다.",
  },
  twitter: {
    card: "summary",
    title: "KBO Predictor",
    description: "데이터 기반 KBO 승부예측 플랫폼",
  },
  robots: { index: true, follow: true },
};

const NAV_LINKS = [
  { href: "/",          label: "경기" },
  { href: "/teams",     label: "순위" },
  { href: "/players",   label: "선수" },
  { href: "/schedule",  label: "일정" },
  { href: "/history",   label: "예측" },
  { href: "/glossary",  label: "용어" },
];

const FOOTER_LINKS = [
  { href: "/about",   label: "서비스 소개" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/terms",   label: "이용약관" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* Google AdSense */}
        {ADSENSE_ID && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </head>
      <body className="min-h-screen bg-slate-900 text-slate-100">
        {/* 네비게이션 */}
        <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur border-b border-slate-800">
          <div className="max-w-5xl mx-auto px-4 py-2 sm:h-14 sm:py-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <Link href="/" className="flex items-center gap-2 font-black text-lg tracking-tight">
              <span className="text-blue-400">⚾</span>
              <span>KBO Predictor</span>
            </Link>
            <nav className="flex w-full sm:w-auto items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        {/* 본문 */}
        <main className="max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>

        {/* 푸터 */}
        <footer className="border-t border-slate-800 mt-16 py-8 text-center text-xs text-slate-600">
          <div className="flex justify-center gap-4 mb-3">
            {FOOTER_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className="hover:text-slate-400 transition-colors">
                {label}
              </Link>
            ))}
          </div>
          <p>KBO Predictor · 데이터 출처: KBO 공식 기록실 / Open-Meteo</p>
          <p className="mt-1">KBO 공식 서비스가 아닌 비공식 데이터 분석 서비스입니다.</p>
          <p className="mt-1">본 사이트의 예측 정보는 참고용이며 투자·도박 목적으로 활용할 수 없습니다.</p>
        </footer>
      </body>
    </html>
  );
}
