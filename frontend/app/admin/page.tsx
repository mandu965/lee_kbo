"use client";

import useSWR from "swr";
import { useState } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/v1";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

function StatusBadge({ status }: { status: string | null }) {
  const cfg: Record<string, { color: string; bg: string }> = {
    success: { color: "#34d399", bg: "rgba(16,185,129,0.1)" },
    warning: { color: "#fbbf24", bg: "rgba(245,158,11,0.1)" },
    failed:  { color: "#f87171", bg: "rgba(239,68,68,0.1)" },
    running: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  };
  const c = cfg[status ?? ""] ?? { color: "#64748b", bg: "rgba(100,116,139,0.1)" };
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ color: c.color, background: c.bg }}>
      {status ?? "없음"}
    </span>
  );
}

function fmtTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diff < 60) return `${diff}분 전`;
  if (diff < 1440) return `${Math.floor(diff/60)}시간 전`;
  return `${Math.floor(diff/1440)}일 전`;
}

type Draft = {
  id: number;
  content_type: string;
  source_date: string;
  title: string;
  naver_chars: number;
  tistory_chars: number;
  updated_at: string | null;
};

type SchedulerJob = {
  job_id: string;
  task_name: string;
  label: string;
  status: string;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_success_at: string | null;
  last_row_count: number | null;
  last_error: string | null;
  next_run_at: string | null;
};

type SchedulerStatus = {
  scheduler: {
    running: boolean;
    job_count: number;
    active_count: number;
    running_count: number;
    failed_count: number;
    timezone: string;
  };
  data_policy: {
    source: string;
    replica: string;
    description: string;
  };
  jobs: SchedulerJob[];
};

function fmtAbsoluteTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SchedulerStatusCard({ status }: { status?: SchedulerStatus }) {
  if (!status) {
    return (
      <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-sm text-slate-500">스케줄러 상태를 불러오는 중입니다.</p>
      </div>
    );
  }

  const failedJobs = status.jobs.filter((job) => job.status === "failed");
  const runningJobs = status.jobs.filter((job) => job.status === "running");
  const nextJobs = status.jobs
    .filter((job) => job.next_run_at)
    .sort((a, b) => new Date(a.next_run_at ?? 0).getTime() - new Date(b.next_run_at ?? 0).getTime())
    .slice(0, 4);
  const recentJobs = status.jobs
    .filter((job) => job.last_started_at)
    .sort((a, b) => new Date(b.last_started_at ?? 0).getTime() - new Date(a.last_started_at ?? 0).getTime())
    .slice(0, 5);

  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-200">스케줄러 상태</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{status.data_policy.description}</p>
        </div>
        <StatusBadge status={status.scheduler.running ? "running" : "failed"} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "등록 작업", value: status.scheduler.job_count, color: "text-slate-100" },
          { label: "활성 작업", value: status.scheduler.active_count, color: "text-indigo-300" },
          { label: "진행 중", value: runningJobs.length, color: "text-blue-300" },
          { label: "실패", value: failedJobs.length, color: failedJobs.length ? "text-red-400" : "text-emerald-400" },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl p-3 text-center" style={{ background: "#0d1421" }}>
            <div className={`text-2xl font-black ${metric.color}`}>{metric.value}</div>
            <div className="mt-1 text-[10px] text-slate-600">{metric.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl p-3" style={{ background: "#0d1421" }}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-300">다음 실행</h3>
            <span className="text-[10px] text-slate-600">{status.scheduler.timezone}</span>
          </div>
          <div className="space-y-2">
            {nextJobs.length ? nextJobs.map((job) => (
              <div key={job.job_id} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-bold text-slate-300">{job.label}</span>
                <span className="shrink-0 text-slate-500">{fmtAbsoluteTime(job.next_run_at)}</span>
              </div>
            )) : <p className="text-xs text-slate-600">예약된 작업이 없습니다.</p>}
          </div>
        </div>

        <div className="rounded-xl p-3" style={{ background: "#0d1421" }}>
          <h3 className="mb-2 text-xs font-black text-slate-300">최근 실행</h3>
          <div className="space-y-2">
            {recentJobs.length ? recentJobs.map((job) => (
              <div key={`${job.job_id}-${job.last_started_at}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs">
                <span className="truncate font-bold text-slate-300">{job.label}</span>
                <StatusBadge status={job.status} />
                <span className="text-right text-slate-500">{fmtTime(job.last_started_at)}</span>
              </div>
            )) : <p className="text-xs text-slate-600">아직 기록된 실행 이력이 없습니다.</p>}
          </div>
        </div>
      </div>

      {failedJobs.length > 0 && (
        <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3">
          <p className="mb-2 text-xs font-black text-red-300">실패 작업</p>
          {failedJobs.slice(0, 3).map((job) => (
            <p key={job.job_id} className="text-[11px] leading-relaxed text-red-200/80">
              [{job.label}] {job.last_error ?? "오류 메시지 없음"}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ContentDraftsPanel() {
  const { data: drafts, isLoading } = useSWR<Draft[]>(`${BASE}/admin/content-drafts`, fetcher, { refreshInterval: 60000 });
  const [copying, setCopying] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (contentType: string, platform: string) => {
    const key = `${contentType}-${platform}`;
    setCopying(key);
    try {
      const res = await fetch(`${BASE}/admin/content-drafts/${contentType}/${platform}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      alert("복사 실패");
    } finally {
      setCopying(null);
    }
  };

  const handleDownload = (contentType: string, platform: string, sourceDate: string) => {
    const ext = platform === "naver" ? "txt" : "md";
    const url = `${BASE}/admin/content-drafts/${contentType}/download/${platform}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sourceDate}_${contentType}_${platform}.${ext}`;
    a.click();
  };

  const typeLabel: Record<string, string> = {
    TYPE_A: "오늘의 경기 예측",
    TYPE_B: "ELO 팀 순위",
    TYPE_C: "주간 적중률",
  };

  if (isLoading) return <p className="text-slate-500 text-sm">로딩 중...</p>;
  if (!drafts || drafts.length === 0)
    return (
      <div className="text-center py-10 text-slate-500 text-sm">
        오늘 생성된 블로그 초안이 없습니다.<br />
        <span className="text-slate-600 text-xs">매일 15:30에 자동 생성됩니다.</span>
      </div>
    );

  return (
    <div className="space-y-4">
      {drafts.map((d) => (
        <div key={d.id} className="rounded-2xl p-5 space-y-3"
          style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
          {/* 헤더 */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mr-2"
                style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}>
                {d.content_type}
              </span>
              <span className="text-[10px] text-slate-500">{typeLabel[d.content_type] ?? ""}</span>
              <p className="text-sm font-bold text-slate-200 mt-1 leading-snug">{d.title}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-slate-600">{d.source_date}</p>
              {d.updated_at && (
                <p className="text-[10px] text-slate-700 mt-0.5">
                  갱신 {new Date(d.updated_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          </div>

          {/* 네이버 */}
          <div className="rounded-xl p-3 flex items-center justify-between gap-2"
            style={{ background: "#0d1421" }}>
            <div>
              <span className="text-xs font-bold" style={{ color: "#03c75a" }}>N 네이버</span>
              <span className="text-[10px] text-slate-600 ml-2">{d.naver_chars.toLocaleString()}자</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleCopy(d.content_type, "naver")}
                disabled={copying === `${d.content_type}-naver`}
                className="text-xs px-3 py-1 rounded-lg font-bold transition-all"
                style={{
                  background: copiedKey === `${d.content_type}-naver` ? "rgba(52,211,153,0.15)" : "rgba(3,199,90,0.1)",
                  color: copiedKey === `${d.content_type}-naver` ? "#34d399" : "#03c75a",
                  border: "1px solid rgba(3,199,90,0.2)",
                }}>
                {copiedKey === `${d.content_type}-naver` ? "✓ 복사됨" : copying === `${d.content_type}-naver` ? "..." : "복사"}
              </button>
              <button
                onClick={() => handleDownload(d.content_type, "naver", d.source_date)}
                className="text-xs px-3 py-1 rounded-lg font-bold"
                style={{ background: "rgba(255,255,255,0.04)", color: "#64748b", border: "1px solid rgba(255,255,255,0.06)" }}>
                .txt↓
              </button>
            </div>
          </div>

          {/* 티스토리 */}
          <div className="rounded-xl p-3 flex items-center justify-between gap-2"
            style={{ background: "#0d1421" }}>
            <div>
              <span className="text-xs font-bold" style={{ color: "#ff7300" }}>T 티스토리</span>
              <span className="text-[10px] text-slate-600 ml-2">{d.tistory_chars.toLocaleString()}자</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleCopy(d.content_type, "tistory")}
                disabled={copying === `${d.content_type}-tistory`}
                className="text-xs px-3 py-1 rounded-lg font-bold transition-all"
                style={{
                  background: copiedKey === `${d.content_type}-tistory` ? "rgba(52,211,153,0.15)" : "rgba(255,115,0,0.1)",
                  color: copiedKey === `${d.content_type}-tistory` ? "#34d399" : "#ff7300",
                  border: "1px solid rgba(255,115,0,0.2)",
                }}>
                {copiedKey === `${d.content_type}-tistory` ? "✓ 복사됨" : copying === `${d.content_type}-tistory` ? "..." : "복사"}
              </button>
              <button
                onClick={() => handleDownload(d.content_type, "tistory", d.source_date)}
                className="text-xs px-3 py-1 rounded-lg font-bold"
                style={{ background: "rgba(255,255,255,0.04)", color: "#64748b", border: "1px solid rgba(255,255,255,0.06)" }}>
                .md↓
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"ops" | "blog">("ops");
  const { data: status, mutate } = useSWR(`${BASE}/admin/collection-status`, fetcher, { refreshInterval: 30000 });
  const { data: schedulerStatus } = useSWR<SchedulerStatus>(`${BASE}/admin/scheduler-status`, fetcher, { refreshInterval: 30000 });
  const { data: perf } = useSWR(`${BASE}/predictions/performance`, fetcher, { refreshInterval: 60000 });
  const { data: versions } = useSWR(`${BASE}/admin/model-versions`, fetcher, { refreshInterval: 60000 });
  const { data: recentRuns } = useSWR(`${BASE}/admin/collection-runs?limit=20`, fetcher, { refreshInterval: 30000 });
  const { data: visitors } = useSWR(`${BASE}/admin/visitors?days=30`, fetcher, { refreshInterval: 60000 });

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* 헤더 + 탭 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black text-white">운영 대시보드</h1>
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {(["ops", "blog"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="text-xs px-3 py-1.5 font-bold transition-all"
                style={activeTab === tab
                  ? { background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }
                  : { background: "transparent", color: "#475569" }}>
                {tab === "ops" ? "운영" : "블로그 초안"}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => mutate()} className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
          새로고침
        </button>
      </div>

      {/* 블로그 초안 탭 */}
      {activeTab === "blog" && <ContentDraftsPanel />}

      {/* 운영 탭 */}
      {activeTab === "ops" && <>

      <SchedulerStatusCard status={schedulerStatus} />

      {/* 오늘 요약 */}
      {status?.today && (
        <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 className="text-sm font-black text-slate-200 mb-3">오늘 ({status.today.date})</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "전체 경기", value: status.today.games, color: "text-slate-100" },
              { label: "종료", value: status.today.final, color: "text-slate-400" },
              { label: "예측 생성", value: status.today.predicted, color: "text-indigo-400" },
              { label: "정산 완료", value: status.today.settled, color: "text-emerald-400" },
            ].map(m => (
              <div key={m.label} className="text-center rounded-xl p-3" style={{ background: "#0d1421" }}>
                <div className={`text-2xl font-black ${m.color}`}>{m.value}</div>
                <div className="text-[10px] text-slate-600 mt-1">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 수집 태스크 상태 */}
      {visitors?.today && (
        <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 className="text-sm font-black text-slate-200 mb-3">방문자 추이</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: "오늘 페이지뷰", value: visitors.today.page_views },
              { label: "오늘 순방문자", value: visitors.today.unique_visitors },
              { label: "30일 페이지뷰", value: visitors.period.page_views },
              { label: "30일 순방문자", value: visitors.period.unique_visitors },
            ].map((metric) => (
              <div key={metric.label} className="text-center rounded-xl p-3" style={{ background: "#0d1421" }}>
                <div className="text-xl font-black text-indigo-300">{metric.value}</div>
                <div className="text-[10px] text-slate-600 mt-1">{metric.label}</div>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {visitors.trend.slice(-14).map((day: any) => {
              const maxViews = Math.max(...visitors.trend.map((item: any) => item.page_views), 1);
              return (
                <div key={day.date} className="flex items-center gap-2 text-[11px]">
                  <span className="w-20 text-slate-500">{day.date.slice(5)}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${day.page_views / maxViews * 100}%` }} />
                  </div>
                  <span className="w-14 text-right text-slate-400 tabular-nums">{day.page_views} PV</span>
                  <span className="w-14 text-right text-slate-500 tabular-nums">{day.unique_visitors} UV</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {status?.tasks && (
        <div className="rounded-2xl overflow-x-auto" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="px-4 py-3 border-b border-white/[0.05]">
            <h2 className="text-sm font-black text-slate-200">수집 태스크 상태</h2>
          </div>
          <table className="w-full min-w-[30rem] text-xs">
            <thead>
              <tr className="text-[10px] text-slate-600 uppercase border-b border-white/[0.03]">
                <th className="px-4 py-2 text-left">태스크</th>
                <th className="px-4 py-2 text-center">상태</th>
                <th className="px-4 py-2 text-right">건수</th>
                <th className="px-4 py-2 text-right">마지막 성공</th>
                <th className="px-4 py-2 text-right hidden sm:table-cell">마지막 실행</th>
              </tr>
            </thead>
            <tbody>
              {status.tasks.map((t: any) => (
                <tr key={t.task_name} className="border-b border-white/[0.03] hover:bg-white/[0.01]">
                  <td className="px-4 py-2.5 font-bold text-slate-200">{t.task_name}</td>
                  <td className="px-4 py-2.5 text-center"><StatusBadge status={t.last_status} /></td>
                  <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">{t.last_row_count ?? "-"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{fmtTime(t.last_success_at)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600 hidden sm:table-cell">{fmtTime(t.last_run_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {status.tasks.some((t: any) => t.last_error) && (
            <div className="px-4 py-3 border-t border-white/[0.04]">
              {status.tasks.filter((t: any) => t.last_error).map((t: any) => (
                <div key={t.task_name} className="text-[11px] text-red-400 mb-1">
                  [{t.task_name}] {t.last_error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 모델 성과 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {perf && perf.total > 0 && (
          <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
            <h2 className="text-sm font-black text-slate-200 mb-3">모델 성과 (시즌)</h2>
            <div className="space-y-2">
              {[
                { k: "Accuracy",    v: `${Math.round(perf.accuracy*100)}%`, c: perf.accuracy>=0.6?"#34d399":"#fbbf24" },
                { k: "Brier Score", v: perf.avg_brier?.toFixed(3),         c: (perf.avg_brier??1)<=0.22?"#34d399":"#64748b" },
                { k: "Log Loss",    v: perf.avg_log_loss?.toFixed(3),      c: "#94a3b8" },
                { k: "Coverage",    v: `${Math.round((perf.coverage??0)*100)}%`, c: "#818cf8" },
                { k: "정산 건수",   v: String(perf.total),                 c: "#94a3b8" },
              ].map(m => (
                <div key={m.k} className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">{m.k}</span>
                  <span className="font-bold" style={{ color: m.c }}>{m.v ?? "-"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {versions && versions.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
            <h2 className="text-sm font-black text-slate-200 mb-3">모델 버전별 성과</h2>
            <div className="space-y-2">
              {versions.map((v: any) => (
                <div key={v.model_version} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-bold w-16">{v.model_version}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${Math.round(v.accuracy*100)}%` }} />
                  </div>
                  <span className="font-bold text-indigo-300 tabular-nums w-10 text-right">
                    {Math.round(v.accuracy*100)}%
                  </span>
                  <span className="text-slate-600 tabular-nums w-8 text-right">{v.total}건</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 최근 수집 이력 */}
      {recentRuns && recentRuns.length > 0 && (
        <div className="rounded-2xl overflow-x-auto" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="px-4 py-3 border-b border-white/[0.05]">
            <h2 className="text-sm font-black text-slate-200">최근 수집 이력</h2>
          </div>
          <table className="w-full min-w-[24rem] text-xs">
            <thead>
              <tr className="text-[10px] text-slate-600 uppercase border-b border-white/[0.03]">
                <th className="px-4 py-2 text-left">태스크</th>
                <th className="px-4 py-2 text-center">상태</th>
                <th className="px-4 py-2 text-right">건수</th>
                <th className="px-4 py-2 text-right">시작</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.slice(0, 10).map((r: any) => (
                <tr key={r.id} className="border-b border-white/[0.02]">
                  <td className="px-4 py-2 text-slate-300">{r.task_name}</td>
                  <td className="px-4 py-2 text-center"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{r.row_count ?? "-"}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{fmtTime(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-700 text-center pb-4">30초마다 자동 갱신 · 비공개 페이지</p>
      </>}
    </div>
  );
}
