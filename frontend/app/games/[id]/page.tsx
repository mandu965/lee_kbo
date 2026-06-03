import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import GameDetailClient from "@/components/GameDetailClient";
import { ApiError, getGameSummary } from "@/lib/api";

interface Props {
  params: { id: string };
}

const getCachedGameSummary = cache(async (id: number) => getGameSummary(id));

async function loadGameSummaryOrNull(id: number) {
  try {
    return await getCachedGameSummary(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = await loadGameSummaryOrNull(Number(params.id));
  if (!game) return { title: "경기 상세" };

  const away = game.away_team.short_name ?? game.away_team.name;
  const home = game.home_team.short_name ?? game.home_team.name;
  const status = game.status === "final"
    ? `${game.away_score}:${game.home_score} 종료`
    : `${game.start_time?.slice(0, 5) ?? "--:--"} 예정`;
  const title = `${away} vs ${home} | ${game.game_date} KBO`;
  const description = `${away}와 ${home}의 경기 상세. ${status} 기준 요약과 탭별 예측 데이터를 제공합니다.`;

  return {
    title,
    description,
    openGraph: { title, description },
  };
}

export default async function GameDetailPage({ params }: Props) {
  const id = Number(params.id);
  if (Number.isNaN(id)) notFound();

  const game = await loadGameSummaryOrNull(id);
  if (!game) notFound();

  return <GameDetailClient summary={game} />;
}
