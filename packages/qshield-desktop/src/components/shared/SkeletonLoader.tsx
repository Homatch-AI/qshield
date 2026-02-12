/**
 * Generic skeleton loading placeholders for cards, tables, and text blocks.
 * Renders a shimmering pulse animation matching the component shape.
 */

interface SkeletonProps {
  className?: string;
}

/** Single-line text skeleton */
export function SkeletonText({ className = 'h-4 w-32' }: SkeletonProps) {
  return <div className={`animate-pulse rounded bg-slate-700/50 ${className}`} />;
}

/** Circle skeleton for avatars or icons */
export function SkeletonCircle({ className = 'h-10 w-10' }: SkeletonProps) {
  return <div className={`animate-pulse rounded-full bg-slate-700/50 ${className}`} />;
}

/** Card skeleton matching dashboard stat cards */
export function SkeletonCard({ className = '' }: SkeletonProps) {
  return (
    <div className={`rounded-xl border border-slate-700 bg-slate-900 p-4 ${className}`}>
      <SkeletonText className="h-3 w-20 mb-3" />
      <SkeletonText className="h-7 w-16 mb-2" />
      <SkeletonText className="h-3 w-24" />
    </div>
  );
}

/** Table skeleton with header and rows */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700">
      {/* Header */}
      <div className="flex gap-4 border-b border-slate-700 bg-slate-900/80 px-4 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <SkeletonText key={i} className="h-3 w-20" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }, (_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex gap-4 border-b border-slate-700/50 bg-slate-900 px-4 py-3 last:border-b-0"
        >
          {Array.from({ length: cols }, (_, colIdx) => (
            <SkeletonText
              key={colIdx}
              className={`h-4 ${colIdx === 0 ? 'w-24' : colIdx === cols - 1 ? 'w-12' : 'w-16'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Dashboard-style gauge skeleton */
export function SkeletonGauge({ className = '' }: SkeletonProps) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="animate-pulse rounded-full bg-slate-700/50 h-[200px] w-[200px]" />
      <SkeletonText className="h-5 w-24 mt-4" />
    </div>
  );
}

/** Event row skeleton for timeline/recent events */
export function SkeletonEventRow() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-900 px-4 py-3">
      <div className="animate-pulse rounded-lg bg-slate-700/50 h-8 w-8 shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonText className="h-3 w-28" />
        <SkeletonText className="h-3 w-48" />
      </div>
      <SkeletonText className="h-3 w-12" />
    </div>
  );
}

/** Full page skeleton combining gauge, cards, and events */
export function SkeletonDashboard() {
  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex justify-center items-center rounded-xl border border-slate-700 bg-slate-900 p-6">
          <SkeletonGauge />
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="space-y-2">
        <SkeletonEventRow />
        <SkeletonEventRow />
        <SkeletonEventRow />
        <SkeletonEventRow />
      </div>
    </div>
  );
}
