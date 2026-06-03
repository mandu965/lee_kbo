import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getBlogPost } from "@/lib/api";
import BlogContent from "@/components/BlogContent";

interface Props {
  params: { date: string; type: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getBlogPost(params.date, params.type).catch(() => null);
  if (!post) return { title: "KBO 경기 분석" };
  return {
    title: `${post.title} | KBO Predictor`,
    description: `${post.category} — ${post.date} KBO 데이터 기반 AI 분석`,
    keywords: ["KBO 예측", "KBO 경기 분석", "야구 AI", post.category],
    openGraph: {
      title: post.title,
      description: `${post.category} — ${post.date} KBO 데이터 기반 AI 분석`,
    },
  };
}

const CATEGORY_STYLE: Record<string, { bg: string; text: string }> = {
  "오늘의 경기 예측": { bg: "bg-indigo-900/40", text: "text-indigo-300" },
  "KBO ELO 팀 순위 분석": { bg: "bg-emerald-900/40", text: "text-emerald-300" },
  "예측 적중률 주간 리포트": { bg: "bg-amber-900/40", text: "text-amber-300" },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogPostPage({ params }: Props) {
  const post = await getBlogPost(params.date, params.type).catch(() => null);
  if (!post) notFound();

  const cat = CATEGORY_STYLE[post.category] ?? { bg: "bg-slate-800", text: "text-slate-400" };

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-12">
      {/* 뒤로가기 */}
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
      >
        ← 분석 목록
      </Link>

      {/* 포스트 헤더 */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${cat.bg} ${cat.text}`}>
            {post.category}
          </span>
          <span className="text-xs text-slate-500">{formatDate(post.date)}</span>
        </div>
        <h1 className="text-xl font-black text-white leading-snug">{post.title}</h1>
        <p className="text-xs text-slate-600">
          KBO Predictor AI 자동 분석 · {post.updated_at ? `${formatDate(post.updated_at.slice(0, 10))} 업데이트` : formatDate(post.date)}
        </p>
      </div>

      {/* 본문 */}
      <div
        className="rounded-2xl p-6 sm:p-8"
        style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <BlogContent content={post.content} />
      </div>

      {/* 하단 CTA */}
      <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-2xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-indigo-200">실시간 경기 예측 보기</p>
          <p className="text-xs text-slate-400 mt-0.5">오늘 경기의 AI 승률·선발 분석을 확인하세요.</p>
        </div>
        <Link
          href="/"
          className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
        >
          경기 보기 →
        </Link>
      </div>

      {/* 면책 */}
      <p className="text-center text-xs text-slate-600">
        본 분석은 통계 모델 기반 참고 정보이며 실제 결과와 다를 수 있습니다.
        스포츠 베팅 등 금전적 결정에 활용하지 마십시오.
      </p>
    </div>
  );
}
