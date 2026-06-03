"use client";

import { useEffect, useRef } from "react";

interface AdSenseProps {
  slot: string;
  format?: "auto" | "rectangle" | "horizontal" | "vertical";
  responsive?: boolean;
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export default function AdSense({
  slot,
  format = "auto",
  responsive = true,
  className = "",
}: AdSenseProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    if (!adRef.current) return;

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // AdSense 스크립트 미로드 시 무시
    }
  }, []);

  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_ID;

  // 설정되지 않은 광고 슬롯은 렌더링하지 않는다.
  if (!publisherId || !slot) return null;

  return (
    <div className={className}>
      <p className="mb-1 text-center text-[10px] tracking-wide text-slate-600">광고</p>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={publisherId}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
    </div>
  );
}
