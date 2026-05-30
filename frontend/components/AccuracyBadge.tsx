interface AccuracyBadgeProps {
  accuracy: number; // 0~1
  total: number;
  label?: string;
}

export default function AccuracyBadge({
  accuracy,
  total,
  label = "시즌 적중률",
}: AccuracyBadgeProps) {
  const pct = Math.round(accuracy * 100);
  const color =
    pct >= 60
      ? "text-green-400 border-green-500"
      : pct >= 50
        ? "text-yellow-400 border-yellow-500"
        : "text-red-400 border-red-500";

  return (
    <div className={`inline-flex items-center gap-2 border rounded-full px-3 py-1 ${color}`}>
      <span className="text-xs text-slate-400">{label}</span>
      <span className="font-bold text-sm">{pct}%</span>
      <span className="text-xs text-slate-500">({total}경기)</span>
    </div>
  );
}
