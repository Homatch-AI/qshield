import { useState, useMemo } from 'react';
import type { AdapterType } from '@qshield/core';
import { useTrustState } from '@/hooks/useTrustState';
import { TimelineEvent } from '@/components/timeline/TimelineEvent';
import { TimelineFilters } from '@/components/timeline/TimelineFilters';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

export default function TrustTimeline() {
  const { signals, loading } = useTrustState();

  const [selectedSources, setSelectedSources] = useState<AdapterType[]>([]);
  const [severity, setSeverity] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
          case 'high':
            return absWeight >= 0.7;
          case 'medium':
            return absWeight >= 0.3 && absWeight < 0.7;
          case 'low':
            return absWeight < 0.3;
          default:
            return true;
        }
      });
    }

    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      filtered = filtered.filter((s) => new Date(s.timestamp).getTime() >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000; // end of day
      filtered = filtered.filter((s) => new Date(s.timestamp).getTime() <= to);
    }

    return filtered;
  }, [signals, selectedSources, severity, dateFrom, dateTo]);

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
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" />
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="mt-3 text-sm text-slate-400">No events match your filters</p>
          <p className="text-xs text-slate-600 mt-1">
            Try adjusting your filter criteria
          </p>
        </div>
      ) : (
        <div className="pl-1">
          {filteredSignals.map((signal, index) => (
            <TimelineEvent key={`${signal.timestamp}-${index}`} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}
