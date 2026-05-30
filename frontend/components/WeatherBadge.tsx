import type { WeatherInfo } from "@/lib/types";

interface WeatherBadgeProps {
  weather: WeatherInfo;
  compact?: boolean;
}

const CONDITION_ICON: Record<string, string> = {
  맑음: "☀️",
  "대체로 맑음": "🌤️",
  "부분적 구름": "⛅",
  흐림: "☁️",
  안개: "🌫️",
  "가벼운 비": "🌦️",
  "보통 비": "🌧️",
  "강한 비": "🌧️",
  소나기: "⛈️",
  뇌우: "⛈️",
  "강한 뇌우": "⛈️",
  눈: "❄️",
};

function getIcon(condition: string | null): string {
  if (!condition) return "🌡️";
  for (const [key, icon] of Object.entries(CONDITION_ICON)) {
    if (condition.includes(key)) return icon;
  }
  return "🌡️";
}

export default function WeatherBadge({ weather, compact = false }: WeatherBadgeProps) {
  const icon = getIcon(weather.condition);
  const isRain = weather.rain_risk;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
          isRain
            ? "bg-blue-900/50 text-blue-300"
            : "bg-slate-700 text-slate-300"
        }`}
        title={weather.description}
      >
        {icon}
        {weather.temperature !== null && `${weather.temperature}°C`}
        {isRain && " 우천주의"}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
      isRain ? "bg-blue-900/30 border border-blue-700/50" : "bg-slate-700/50"
    }`}>
      <span className="text-lg">{icon}</span>
      <div>
        <div className="flex items-center gap-2">
          {weather.temperature !== null && (
            <span className="font-semibold text-slate-200">{weather.temperature}°C</span>
          )}
          {weather.condition && (
            <span className="text-slate-400 text-xs">{weather.condition}</span>
          )}
        </div>
        {weather.description !== "날씨 영향 미미" && weather.description !== "돔 구장 — 날씨 영향 없음" && (
          <div className={`text-xs mt-0.5 ${isRain ? "text-blue-300" : "text-slate-500"}`}>
            {weather.description}
          </div>
        )}
      </div>
    </div>
  );
}
