"use client";

import { useState } from "react";
import type { GameResponse, PredictionInGame } from "@/lib/types";

type Tab = "preview" | "lineup" | "pitchers" | "analysis";

const TABS: { key: Tab; label: string }[] = [
  { key: "preview",   label: "프리뷰" },
  { key: "lineup",    label: "타순" },
  { key: "pitchers",  label: "선발" },
  { key: "analysis",  label: "예측 분석" },
];

interface Props {
  game: GameResponse;
  prediction: PredictionInGame | null;
  previewContent: React.ReactNode;
  lineupContent: React.ReactNode;
  pitchersContent: React.ReactNode;
  analysisContent: React.ReactNode;
}

export default function GameDetailTabs({
  game, prediction,
  previewContent, lineupContent, pitchersContent, analysisContent,
}: Props) {
  const [tab, setTab] = useState<Tab>("preview");

  // 타순·예측분석은 데이터가 없으면 탭 비활성화
  const hasLineup = !!(game.home_lineup?.players?.length || game.away_lineup?.players?.length);
  const hasAnalysis = !!(prediction?.factor_contributions?.length || prediction?.trend?.length);

  const available: Partial<Record<Tab, boolean>> = {
    preview:  true,
    lineup:   hasLineup,
    pitchers: !!(game.starters?.home || game.starters?.away),
    analysis: true,
  };

  return (
    <>
      {/* 탭 바 */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "#111827" }}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => available[key] && setTab(key)}
            className="flex-1 py-2 rounded-lg text-xs font-bold transition-all relative sm:text-sm"
            style={tab === key
              ? { background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }
              : available[key]
                ? { color: "#64748b" }
                : { color: "#334155", cursor: "not-allowed" }}
          >
            {label}
            {!available[key] && (
              <span className="absolute -top-1 -right-1 text-[8px] text-slate-600">—</span>
            )}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="space-y-4">
        {tab === "preview"  && previewContent}
        {tab === "lineup"   && (hasLineup ? lineupContent : (
          <div className="rounded-2xl p-10 text-center text-slate-500"
            style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
            타순이 아직 발표되지 않았습니다.
          </div>
        ))}
        {tab === "pitchers" && pitchersContent}
        {tab === "analysis" && analysisContent}
      </div>
    </>
  );
}
