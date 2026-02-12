import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { AdapterType } from '@qshield/core';
import { useTrustState } from '@/hooks/useTrustState';
import { TimelineEvent } from '@/components/timeline/TimelineEvent';
import { TimelineFilters } from '@/components/timeline/TimelineFilters';
import { SkeletonEventRow } from '@/components/shared/SkeletonLoader';

const PAGE_SIZE = 20;

/**
 * Infinite-scroll timeline with color-coded dots and filter controls.
 */
export default function TrustTimeline() {
  const { signals, loading } = useTrustState();

  const [selectedSources, setSelectedSources] = useState<AdapterType[]>([]);
  const [severity, setSeverity] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const filteredSignals = useMemo(() => {
    let filtered = signals.slice().sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    if (selectedSources.length > 0) {
      filtered = filtered.filter((s) => selectedSources.includes(s.source));
    }

    if (severity !== 'all') {
      filtered = filtered.filter((s) => {
        const absWeight = Math.abs(s.weight);
        switch (severity) {
          case 'high': return absWeight >= 0.7;
          case 'medium': return absWeight >= 0.3 && absWeight < 0.7;
          case 'low': return absWeight < 0.3;
          default: return true;
        }
      });
    }

    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      filtered = filtered.filter((s) => new Date(s.timestamp).getTime() >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000;
      filtered = filtered.filter((s) => new Date(s.timestamp).getTime() <= to);
    }

    return filtered;
  }, [signals, selectedSources, severity, dateFrom, dateTo]);

  const visibleSignals = filteredSignals.slice(0, visibleCount);
  const hasMore = visibleCount < filteredSignals.length;

  // Infinite scroll via IntersectionObserver
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore) {
        setVisibleCount((prev) => prev + PAGE_SIZE);
      }
    },
    [hasMore],
  );

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [handleObserver]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedSources, severity, dateFrom, dateTo]);

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Trust Timeline</h1>
        <p className="text-sm text-slate-400 mt-1">
          Chronological view of trust signals and score changes
        </p>
      </div>

      {/* Filters */}
      <TimelineFilters
        selectedSources={selectedSources}
        onSourcesChange={setSelectedSources}
        severity={severity}
        onSeverityChange={setSeverity}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">
          {filteredSignals.length} event{filteredSignals.length !== 1 ? 's' : ''}
          {visibleCount < filteredSignals.length && ` (showing ${visibleCount})`}
        </span>
        {(selectedSources.length > 0 || severity !== 'all' || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setSelectedSources([]);
              setSeverity('all');
              setDateFrom('');
              setDateTo('');
            }}
            className="text-xs text-sky-500 hover:text-sky-400 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-4 pl-1">
          <SkeletonEventRow />
          <SkeletonEventRow />
          <SkeletonEventRow />
          <SkeletonEventRow />
          <SkeletonEventRow />
        </div>
      ) : filteredSignals.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="mt-3 text-sm text-slate-400">No events match your filters</p>
          <p className="text-xs text-slate-600 mt-1">Try adjusting your filter criteria</p>
        </div>
      ) : (
        <div className="pl-1">
          {visibleSignals.map((signal, index) => (
            <TimelineEvent key={`${signal.timestamp}-${index}`} signal={signal} />
          ))}

          {/* Infinite scroll sentinel */}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-sky-500" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
