"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const BASE =
  (typeof window === "undefined"
    ? (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL)
    : process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:8002/v1";
const STORAGE_KEY = "kbo-predictor-visitor-id";

function getVisitorId() {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const visitorId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(STORAGE_KEY, visitorId);
  return visitorId;
}

export default function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;

    fetch(`${BASE}/analytics/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: getVisitorId(), path: pathname }),
      keepalive: true,
    }).catch(() => {
      // Analytics must never interrupt the page experience.
    });
  }, [pathname]);

  return null;
}
