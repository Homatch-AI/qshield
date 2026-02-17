import type { AdapterType } from '@qshield/core';
import { ADAPTER_LABELS } from '@/lib/constants';

const ADAPTER_OPTIONS: AdapterType[] = ['zoom', 'teams', 'email', 'file', 'api', 'crypto'];
const SEVERITY_OPTIONS = ['all', 'high', 'medium', 'low'] as const;

interface TimelineFiltersProps {
  selectedSources: AdapterType[];
  onSourcesChange: (sources: AdapterType[]) => void;
  severity: string;
  onSeverityChange: (severity: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
}

export function TimelineFilters({
  selectedSources,
  onSourcesChange,
  severity,
  onSeverityChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: TimelineFiltersProps) {
  const toggleSource = (source: AdapterType) => {
    if (selectedSources.includes(source)) {
      onSourcesChange(selectedSources.filter((s) => s !== source));
    } else {
      onSourcesChange([...selectedSources, source]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
      {/* Source Filters */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Sources
        </span>
        <div className="flex flex-wrap gap-1.5">
          {ADAPTER_OPTIONS.map((source) => {
            const isSelected = selectedSources.includes(source);
            return (
              <button
                key={source}
                onClick={() => toggleSource(source)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600 hover:text-slate-300'
                }`}
              >
                {ADAPTER_LABELS[source] ?? source}
              </button>
            );
          })}
        </div>
      </div>

      {/* Separator */}
      <div className="hidden h-8 w-px bg-slate-700 sm:block" />

      {/* Severity */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Impact
        </span>
        <select
          value={severity}
          onChange={(e) => onSeverityChange(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
        >
          {SEVERITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'all' ? 'All Impacts' : `${option.charAt(0).toUpperCase()}${option.slice(1)} Impact`}
            </option>
          ))}
        </select>
      </div>

      {/* Separator */}
      <div className="hidden h-8 w-px bg-slate-700 sm:block" />

      {/* Date Range */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Date Range
        </span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
          />
          <span className="text-xs text-slate-600">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
          />
        </div>
      </div>
    </div>
  );
}
