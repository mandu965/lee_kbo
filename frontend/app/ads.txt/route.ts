const SELLER_ID = "f08c47fec0942fa0";

export const dynamic = "force-dynamic";

export function GET() {
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_ID;
  const body = publisherId?.startsWith("ca-pub-")
    ? `google.com, ${publisherId.slice(3)}, DIRECT, ${SELLER_ID}\n`
    : "";

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
