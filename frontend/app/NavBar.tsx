"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "경기", icon: "경" },
  { href: "/teams", label: "순위", icon: "순" },
  { href: "/players", label: "선수", icon: "선" },
  { href: "/schedule", label: "일정", icon: "일" },
  { href: "/history", label: "예측", icon: "예" },
  { href: "/blog", label: "분석글", icon: "글" },
  { href: "/glossary", label: "용어", icon: "용" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <>
      <header
        className="sticky top-0 z-50 hidden sm:block"
        style={{
          background: "rgba(8,12,20,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <div
              className="flex h-7 w-7 select-none items-center justify-center rounded-lg text-xs font-black"
              style={{
                background: "linear-gradient(135deg,#6366f1 0%,#4f46e5 100%)",
                boxShadow: "0 0 14px rgba(99,102,241,0.45)",
              }}
            >
              K
            </div>
            <span className="text-[15px] font-black tracking-tight text-white transition-colors group-hover:text-indigo-200">
              KBO <span className="text-indigo-400">Predictor</span>
            </span>
          </Link>

          <nav className="flex items-center gap-0.5">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className="shrink-0 rounded-lg px-3.5 py-1.5 text-sm transition-all duration-150"
                  style={
                    isActive
                      ? { background: "rgba(99,102,241,0.14)", color: "#a5b4fc", fontWeight: 700 }
                      : { color: "#64748b", fontWeight: 500 }
                  }
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <header
        className="sticky top-0 z-50 sm:hidden"
        style={{
          background: "rgba(8,12,20,0.92)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex h-12 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div
              className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black"
              style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
            >
              K
            </div>
            <span className="text-sm font-black text-white">
              KBO <span className="text-indigo-400">Predictor</span>
            </span>
          </Link>
        </div>
      </header>

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
          {NAV_LINKS.filter(({ href }) => href !== "/glossary").map(({ href, label, icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors"
                style={{ color: isActive ? "#a5b4fc" : "#64748b" }}
              >
                <span className="text-[11px] font-black">{icon}</span>
                <span className="text-[10px] font-bold">{label}</span>
                {isActive && <span className="h-1 w-1 rounded-full bg-indigo-500" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
