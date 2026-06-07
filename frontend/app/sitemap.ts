import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lee-kbo.onrender.com";
const API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8002/v1";

export const dynamic = "force-dynamic";

async function safeFetch<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return fallback;
    return res.json();
  } catch {
    return fallback;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const updated = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`,         lastModified: updated, changeFrequency: "daily",   priority: 1.0 },
    { url: `${BASE_URL}/teams`,    lastModified: updated, changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE_URL}/players`,  lastModified: updated, changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE_URL}/schedule`, lastModified: updated, changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE_URL}/blog`,     lastModified: updated, changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE_URL}/history`,  lastModified: updated, changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE_URL}/glossary`, lastModified: updated, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/about`,    lastModified: updated, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/contact`,  lastModified: updated, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${BASE_URL}/privacy`,  lastModified: updated, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE_URL}/terms`,    lastModified: updated, changeFrequency: "yearly",  priority: 0.3 },
  ];

  const teams = await safeFetch<{ id: number }[]>(`${API_URL}/teams`, []);
  const teamRoutes: MetadataRoute.Sitemap = teams.map((t) => ({
    url: `${BASE_URL}/teams/${t.id}`,
    lastModified: updated,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  const pitchers = await safeFetch<{ player_id: number }[]>(
    `${API_URL}/stats/pitchers?sort=era&limit=30`, []
  );
  const batters = await safeFetch<{ player_id: number }[]>(
    `${API_URL}/stats/batters?sort=ops&limit=30`, []
  );
  const playerIds = new Set([
    ...pitchers.map((p) => p.player_id),
    ...batters.map((b) => b.player_id),
  ]);
  const playerRoutes: MetadataRoute.Sitemap = Array.from(playerIds).map((id) => ({
    url: `${BASE_URL}/player/${id}`,
    lastModified: updated,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  // 블로그 포스트 (TYPE_A만 노출 — /blog 페이지와 동일)
  const blogData = await safeFetch<{ posts: { date: string; slug: string }[] }>(
    `${API_URL}/blog/posts?limit=50`, { posts: [] }
  );
  const blogRoutes: MetadataRoute.Sitemap = blogData.posts
    .filter((p) => p.slug === "type-a")
    .map((p, i) => ({
      url: `${BASE_URL}/blog/${p.date}/${p.slug}`,
      lastModified: new Date(p.date),
      changeFrequency: "weekly" as const,
      priority: i === 0 ? 0.9 : 0.8,
    }));

  return [...staticRoutes, ...teamRoutes, ...playerRoutes, ...blogRoutes];
}
