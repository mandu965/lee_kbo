"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/",         label: "경기",  icon: "⚾" },
  { href: "/teams",    label: "순위",  icon: "🏆" },
  { href: "/players",  label: "선수",  icon: "📊" },
  { href: "/schedule", label: "일정",  icon: "📅" },
  { href: "/history",  label: "예측",  icon: "🎯" },
  { href: "/glossary", label: "용어",  icon: "📖" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <>
      {/* PC 상단 헤더 */}
      <header
        className="sticky top-0 z-50 hidden sm:block"
        style={{
          background: "rgba(8,12,20,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* 로고 */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm select-none"
              style={{
                background: "linear-gradient(135deg,#6366f1 0%,#4f46e5 100%)",
                boxShadow: "0 0 14px rgba(99,102,241,0.45)",
              }}
            >
              ⚾
            </div>
            <span className="font-black text-[15px] tracking-tight text-white group-hover:text-indigo-200 transition-colors">
              KBO <span className="text-indigo-400">Predictor</span>
            </span>
          </Link>

          {/* PC 네비게이션 */}
          <nav className="flex items-center gap-0.5">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className="shrink-0 px-3.5 py-1.5 rounded-lg text-sm transition-all duration-150"
                  style={
                    isActive
                      ? { background: "rgba(99,102,241,0.14)", color: "#a5b4fc", fontWeight: 700 }
                      : { color: "#64748b", fontWeight: 500 }
                  }
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = "#cbd5e1";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = "#64748b";
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* 모바일 상단 미니 헤더 */}
      <header
        className="sticky top-0 z-50 sm:hidden"
        style={{
          background: "rgba(8,12,20,0.92)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="px-4 h-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs"
              style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
              ⚾
            </div>
            <span className="font-black text-sm text-white">
              KBO <span className="text-indigo-400">Predictor</span>
            </span>
          </Link>
        </div>
      </header>

      {/* 모바일 하단 탭바 */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 sm:hidden"
        style={{
          background: "rgba(8,12,20,0.95)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center">
          {NAV_LINKS.map(({ href, label, icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors"
                style={{ color: isActive ? "#a5b4fc" : "#475569" }}
              >
                <span className="text-base">{icon}</span>
                <span className="text-[10px] font-bold">{label}</span>
                {isActive && (
                  <span className="w-1 h-1 rounded-full" style={{ background: "#6366f1" }} />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

    </>
  );
}
