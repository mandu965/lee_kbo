export default function GameDetailLoading() {
  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
      {/* 경기 헤더 스켈레톤 */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 sm:p-6">
        <div className="flex justify-between items-center mb-5">
          <div className="h-3 w-24 bg-slate-700 rounded" />
          <div className="h-5 w-16 bg-slate-700 rounded-full" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center flex-1 gap-2">
            <div className="h-7 w-16 bg-slate-700 rounded" />
            <div className="h-3 w-8 bg-slate-700/50 rounded" />
            <div className="flex gap-1 mt-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-5 w-5 bg-slate-700 rounded" />
              ))}
            </div>
          </div>
          <div className="px-4">
            <div className="h-8 w-10 bg-slate-700 rounded" />
          </div>
          <div className="flex flex-col items-center flex-1 gap-2">
            <div className="h-7 w-16 bg-slate-700 rounded" />
            <div className="h-3 w-8 bg-slate-700/50 rounded" />
            <div className="flex gap-1 mt-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-5 w-5 bg-slate-700 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 탭 스켈레톤 */}
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 w-16 bg-slate-800 rounded-lg" />
        ))}
      </div>

      {/* 예측 카드 스켈레톤 */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-4 w-20 bg-slate-700 rounded" />
          <div className="h-4 w-28 bg-slate-700/50 rounded-full" />
        </div>
        <div className="h-8 w-full bg-slate-700 rounded-full" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 bg-slate-700/50 rounded-xl" />
          <div className="h-12 bg-slate-700/50 rounded-xl" />
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-slate-700/30 rounded-lg" />
          ))}
        </div>
      </div>

      {/* 분석 카드 스켈레톤 */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-3">
        <div className="h-4 w-28 bg-slate-700 rounded" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-4 bg-slate-700/50 rounded" style={{ width: `${70 + i * 10}%` }} />
        ))}
      </div>
    </div>
  );
}
