"use client";

import { useState } from "react";
import type { GameResponse, PredictionInGame } from "@/lib/types";

type Tab = "preview" | "offense" | "pitchers" | "analysis";

const TABS: { key: Tab; label: string }[] = [
  { key: "preview", label: "프리뷰" },
  { key: "offense", label: "공격력" },
  { key: "pitchers", label: "선발" },
  { key: "analysis", label: "예측 분석" },
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
  game,
  prediction,
  previewContent,
  lineupContent,
  pitchersContent,
  analysisContent,
}: Props) {
  const [tab, setTab] = useState<Tab>("preview");
  const hasPitchers = !!(game.starters?.home || game.starters?.away);

  const available: Record<Tab, boolean> = {
    preview: true,
    offense: true,
    pitchers: hasPitchers,
    analysis: true,
  };

  return (
    <>
      <div className="flex gap-1 rounded-xl p-1" style={{ background: "#111827" }}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => available[key] && setTab(key)}
            className="relative flex-1 rounded-lg py-2 text-xs font-bold transition-all sm:text-sm"
            style={
              tab === key
                ? { background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }
                : available[key]
                  ? { color: "#64748b" }
                  : { color: "#334155", cursor: "not-allowed" }
            }
          >
            {label}
            {!available[key] && (
              <span className="absolute -right-1 -top-1 text-[8px] text-slate-600">-</span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tab === "preview" && previewContent}
        {tab === "offense" && lineupContent}
        {tab === "pitchers" && pitchersContent}
        {tab === "analysis" && analysisContent}
      </div>
    </>
  );
}
