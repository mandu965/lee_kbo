import type { StarterInfo } from "@/lib/types";

interface StarterCardProps {
  starter: StarterInfo | null;
  label: string;
  align?: "left" | "right";
}

export default function StarterCard({ starter, label, align = "left" }: StarterCardProps) {
  const isRight = align === "right";

  return (
    <div className={`flex flex-col gap-0.5 ${isRight ? "items-end" : "items-start"}`}>
      <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label} 선발</span>
      {starter ? (
        <>
          <span className="text-sm font-semibold text-slate-200">{starter.name}</span>
          <div className={`flex gap-3 text-xs text-slate-400 ${isRight ? "flex-row-reverse" : ""}`}>
            <span>
              ERA{" "}
              <span className={`font-bold ${(starter.era ?? 99) <= 3 ? "text-green-400" : (starter.era ?? 99) <= 4 ? "text-yellow-400" : "text-red-400"}`}>
                {starter.era?.toFixed(2) ?? "-"}
              </span>
            </span>
            <span>WHIP <span className="font-bold text-slate-300">{starter.whip?.toFixed(2) ?? "-"}</span></span>
          </div>
        </>
      ) : (
        <span className="text-xs text-slate-500">미정</span>
      )}
    </div>
  );
}
