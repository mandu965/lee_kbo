"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { EloHistoryItem } from "@/lib/types";

interface EloChartProps {
  history: EloHistoryItem[];
  teamName: string;
}

export default function EloChart({ history, teamName }: EloChartProps) {
  const data = history.map((h) => ({
    date: h.game_date.slice(5),   // "MM-DD"
    elo: h.elo_after,
    change: h.elo_change,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={["auto", "auto"]}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
          labelStyle={{ color: "#94a3b8", fontSize: 12 }}
          itemStyle={{ color: "#60a5fa" }}
          formatter={(val: number) => [`${Number(val).toFixed(1)}`, "ELO"]}
        />
        <ReferenceLine y={1500} stroke="#475569" strokeDasharray="4 4" label={{ value: "1500", fill: "#64748b", fontSize: 10 }} />
        <Line
          type="monotone"
          dataKey="elo"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#3b82f6" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
