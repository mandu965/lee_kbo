import Link from "next/link";
import type { Metadata } from "next";
import { getBlogPosts } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "KBO 경기 분석 블로그",
  description:
    "KBO 경기 프리뷰, ELO 팀 전력 분석, 예측 적중률 리포트 등 데이터 기반 야구 분석 글을 제공합니다.",
  keywords: ["KBO 예측", "KBO 경기 분석", "야구 통계", "KBO ELO", "프로야구 프리뷰"],
};

const CATEGORY_STYLE: Record<string, { bg: string; text: string }> = {
  "오늘의 경기 예측": { bg: "bg-indigo-900/40", text: "text-indigo-300" },
  "KBO ELO 팀 순위 분석": { bg: "bg-emerald-900/40", text: "text-emerald-300" },
  "예측 적중률 주간 리포트": { bg: "bg-amber-900/40", text: "text-amber-300" },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogListPage() {
  const data = await getBlogPosts(1, 60).catch(() => null);
  const posts = (data?.posts ?? []).filter((p) => p.slug === "type-a");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="py-2">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-300">Blog</p>
        <h1 className="mb-2 text-2xl font-black text-white">KBO 경기 분석</h1>
        <p className="text-sm leading-relaxed text-slate-400">
          경기 프리뷰, ELO 흐름, 예측 결과를 정리한 분석 글입니다. 매일 수집되는 기록을 바탕으로
          독자가 경기 흐름을 이해할 수 있도록 작성합니다.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-10 text-center text-sm text-slate-500">
          아직 발행된 글이 없습니다. 경기 데이터가 수집되면 분석 글이 순차적으로 표시됩니다.
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const cat = CATEGORY_STYLE[post.category] ?? { bg: "bg-slate-800", text: "text-slate-400" };
            return (
              <Link
                key={`${post.date}-${post.slug}`}
                href={`/blog/${post.date}/${post.slug}`}
                className="block rounded-lg border border-slate-700 bg-slate-800 p-5 transition-all duration-150 hover:border-indigo-500/40 hover:bg-slate-800/80"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cat.bg} ${cat.text}`}>
                    {post.category}
                  </span>
                  <span className="text-xs text-slate-500">{formatDate(post.date)}</span>
                </div>
                <h2 className="line-clamp-2 text-sm font-bold leading-snug text-slate-100">{post.title}</h2>
              </Link>
            );
          })}
        </div>
      )}

      {posts.length > 0 && (
        <p className="pb-4 text-center text-xs text-slate-600">총 {posts.length}개의 분석 글</p>
      )}
    </div>
  );
}
