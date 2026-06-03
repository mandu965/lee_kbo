import Link from "next/link";
import type { Metadata } from "next";
import { getBlogPosts } from "@/lib/api";

export const metadata: Metadata = {
  title: "KBO 경기 분석 블로그 | KBO Predictor",
  description:
    "KBO 프로야구 AI 경기 예측, ELO 팀 순위 분석, 주간 적중률 리포트를 매일 자동 발행합니다. 데이터 기반 야구 분석 콘텐츠.",
  keywords: ["KBO 예측", "KBO 경기 분석", "야구 AI 예측", "KBO ELO", "오늘 KBO 경기"],
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="py-2">
        <h1 className="text-2xl font-black text-white mb-2">KBO 경기 분석</h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          AI 모델이 분석한 KBO 경기 예측·ELO 순위·주간 적중률을 매일 발행합니다.
        </p>
      </div>

      {/* 글 목록 */}
      {posts.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center text-slate-500 text-sm">
          아직 발행된 글이 없습니다. 매일 오후 3시 30분에 자동 생성됩니다.
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const cat = CATEGORY_STYLE[post.category] ?? { bg: "bg-slate-800", text: "text-slate-400" };
            return (
              <Link
                key={`${post.date}-${post.slug}`}
                href={`/blog/${post.date}/${post.slug}`}
                className="block bg-slate-800 border border-slate-700 rounded-2xl p-5 hover:border-indigo-500/40 hover:bg-slate-800/80 transition-all duration-150"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cat.bg} ${cat.text}`}>
                    {post.category}
                  </span>
                  <span className="text-xs text-slate-500">{formatDate(post.date)}</span>
                </div>
                <h2 className="text-sm font-bold text-slate-100 leading-snug line-clamp-2">
                  {post.title}
                </h2>
              </Link>
            );
          })}
        </div>
      )}

      {/* 총 개수 */}
      {posts.length > 0 && (
        <p className="text-center text-xs text-slate-600 pb-4">
          총 {posts.length}개의 경기 예측 분석
        </p>
      )}
    </div>
  );
}
