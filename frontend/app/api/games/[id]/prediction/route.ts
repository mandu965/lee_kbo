import { NextResponse } from "next/server";

const API_BASE =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8002/v1";

interface RouteContext {
  params: { id: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_game_id" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_BASE}/games/${id}/prediction`, {
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "upstream_error", status: res.status },
        { status: res.status === 404 ? 404 : 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "s-maxage=30, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "upstream_timeout" },
      { status: 504 },
    );
  }
}
