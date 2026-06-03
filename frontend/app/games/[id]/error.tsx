"use client";

export default function GameDetailError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div
      className="mx-auto max-w-2xl rounded-2xl p-6 text-center"
      style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <h2 className="text-lg font-black text-slate-100">경기 상세를 불러오지 못했습니다.</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        로컬에서는 백엔드 API 오류가 있을 수 있고, 배포 환경에서는 상세 데이터 응답이 늦을 수 있습니다.
      </p>
      <p className="mt-2 text-xs text-slate-500">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-lg px-4 py-2 text-sm font-bold text-indigo-200"
        style={{ background: "rgba(99,102,241,0.18)", border: "1px solid rgba(165,180,252,0.2)" }}
      >
        다시 시도
      </button>
    </div>
  );
}
