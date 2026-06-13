import type { Metadata } from "next";
import GlossaryClient from "./GlossaryClient";

export const metadata: Metadata = {
  title: "야구 통계 용어 사전",
  description:
    "ERA, WHIP, OPS, WAR, FIP, wOBA 등 야구 통계 용어를 한국어로 쉽게 설명하는 KBO 분석 용어 사전입니다.",
  keywords: ["야구 용어", "야구 통계", "ERA 뜻", "WHIP 뜻", "OPS 야구", "WAR 야구", "KBO 통계"],
};

export default function GlossaryPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-300">Glossary</p>
        <h1 className="mb-2 text-2xl font-black text-white">야구 통계 용어 사전</h1>
        <p className="text-sm leading-relaxed text-slate-400">
          ERA, WHIP, OPS, WAR처럼 중계와 기사에서 자주 등장하는 야구 지표를 쉽게 정리했습니다. 공식,
          좋은 기준, 해석할 때 주의할 점까지 함께 확인할 수 있습니다.
        </p>
      </div>

      <GlossaryClient />
    </div>
  );
}
