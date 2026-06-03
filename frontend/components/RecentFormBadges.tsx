interface RecentFormBadgesProps {
  form: string; // "WWLWL" — 오른쪽이 최신
}

const BADGE: Record<string, string> = {
  W: "bg-green-500 text-white",
  L: "bg-red-500 text-white",
  D: "bg-slate-500 text-white",
};

export default function RecentFormBadges({ form }: RecentFormBadgesProps) {
  if (!form) return <span className="text-slate-500 text-xs">-</span>;

  return (
    <div className="flex gap-1">
      {form.split("").map((char, i) => (
        <span
          key={i}
          className={`w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold sm:h-5 sm:w-5 sm:text-[10px] ${BADGE[char] ?? "bg-slate-600 text-white"}`}
        >
          {char}
        </span>
      ))}
    </div>
  );
}
