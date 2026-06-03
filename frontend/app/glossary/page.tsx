import type { Metadata } from "next";
import GlossaryClient from "./GlossaryClient";

export const metadata: Metadata = {
  title: "야구 통계 용어 사전 | KBO Predictor",
  description:
    "ERA, WHIP, OPS, WAR, FIP, wOBA 등 야구 통계 영문 약어를 한글로 쉽게 설명합니다. 투수 지표, 타자 지표, 세이버메트릭스 용어 완벽 정리.",
  keywords: [
    "야구 용어", "야구 통계", "ERA 뜻", "WHIP 뜻", "OPS 야구",
    "WAR 야구", "세이버메트릭스", "KBO 통계", "야구 약어",
  ],
};

export default function GlossaryPage() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-white mb-2">야구 통계 용어 사전</h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          ERA, WHIP, OPS, WAR… 야구 중계·기사에서 자주 등장하는 영문 약어를
          한글로 쉽게 풀어드립니다.
          <br />
          공식, 좋은 기준값, 예시까지 함께 확인하세요.
        </p>
      </div>

      <GlossaryClient />
    </div>
  );
}
