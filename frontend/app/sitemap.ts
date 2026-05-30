import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kbo-predictor.vercel.app";
  const updated = new Date();

  const routes: { path: string; freq: MetadataRoute.Sitemap[number]["changeFrequency"]; pri: number }[] = [
    { path: "",          freq: "daily",   pri: 1.0 },
    { path: "/teams",    freq: "daily",   pri: 0.9 },
    { path: "/players",  freq: "daily",   pri: 0.9 },
    { path: "/schedule", freq: "daily",   pri: 0.9 },
    { path: "/pitchers", freq: "daily",   pri: 0.7 },
    { path: "/history",  freq: "weekly",  pri: 0.7 },
    { path: "/glossary", freq: "monthly", pri: 0.6 },
    { path: "/about",    freq: "monthly", pri: 0.5 },
    { path: "/privacy",  freq: "yearly",  pri: 0.3 },
    { path: "/terms",    freq: "yearly",  pri: 0.3 },
  ];

  return routes.map(({ path, freq, pri }) => ({
    url: `${base}${path}`,
    lastModified: updated,
    changeFrequency: freq,
    priority: pri,
  }));
}
