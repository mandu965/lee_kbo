"use client";

import { useState, useMemo } from "react";
import { GLOSSARY, CATEGORIES, type GlossaryCategory } from "@/lib/glossary-data";

export default function GlossaryClient() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<GlossaryCategory | "all">("all");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return GLOSSARY.filter((term) => {
      const matchCat = activeCategory === "all" || term.category === activeCategory;
      if (!q) return matchCat;
      const matchText =
        term.abbr.toLowerCase().includes(q) ||
        term.korean.includes(q) ||
        term.full.toLowerCase().includes(q) ||
        term.desc.includes(q);
      return matchCat && matchText;
    });
  }, [query, activeCategory]);

  const catLabel: Record<GlossaryCategory, string> = {
    pitcher: "투수",
    batter: "타자",
    general: "종합",
    kbo: "KBO P",
  };

  const catColor: Record<GlossaryCategory, string> = {
    pitcher: "bg-blue-900/50 text-blue-300 border-blue-700/50",
    batter:  "bg-green-900/50 text-green-300 border-green-700/50",
    general: "bg-purple-900/50 text-purple-300 border-purple-700/50",
    kbo:     "bg-orange-900/50 text-orange-300 border-orange-700/50",
  };

  return (
    <div className="space-y-6">
      {/* 검색 */}
      <input
        type="text"
        placeholder="약어(ERA) 또는 한글(평균자책점)로 검색..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full bg-slate-800 border border-slate-600 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
      />

      {/* 카테고리 필터 */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveCategory("all")}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            activeCategory === "all"
              ? "bg-slate-200 text-slate-900 font-semibold"
              : "bg-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          전체 ({GLOSSARY.length})
        </button>
        {CATEGORIES.map((cat) => {
          const count = GLOSSARY.filter((t) => t.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                activeCategory === cat.id
                  ? "bg-slate-200 text-slate-900 font-semibold"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {cat.icon} {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* 결과 수 */}
      <p className="text-xs text-slate-500">
        {filtered.length}개 용어 {query && `("${query}" 검색 결과)`}
      </p>

      {/* 용어 카드 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p>검색 결과가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((term) => (
            <div
              key={term.abbr}
              id={term.abbr.toLowerCase()}
              className="bg-slate-800 border border-slate-700 rounded-xl p-5"
            >
              {/* 헤더 */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black text-white font-mono">{term.abbr}</span>
                  <div>
                    <div className="text-sm font-semibold text-slate-200">{term.korean}</div>
                    <div className="text-xs text-slate-500">{term.full}</div>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${catColor[term.category]}`}>
                  {catLabel[term.category]}
                </span>
              </div>

              {/* 설명 */}
              <p className="text-sm text-slate-400 leading-relaxed mb-3">{term.desc}</p>

              {/* 공식 / 기준 / 예시 */}
              <div className="space-y-2">
                {term.formula && (
                  <div className="flex gap-2 text-xs">
                    <span className="text-slate-500 shrink-0 w-12">공식</span>
                    <span className="text-slate-300 font-mono">{term.formula}</span>
                  </div>
                )}
                {term.good && (
                  <div className="flex gap-2 text-xs">
                    <span className="text-slate-500 shrink-0 w-12">기준</span>
                    <span className="text-green-400">{term.good}</span>
                  </div>
                )}
                {term.example && (
                  <div className="flex gap-2 text-xs">
                    <span className="text-slate-500 shrink-0 w-12">예시</span>
                    <span className="text-blue-300">{term.example}</span>
                  </div>
                )}
              </div>

              {/* 관련 용어 */}
              {term.related && term.related.length > 0 && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-500">관련:</span>
                  {term.related.map((r) => (
                    <a
                      key={r}
                      href={`#${r.toLowerCase()}`}
                      className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-0.5 rounded transition-colors"
                    >
                      {r}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
