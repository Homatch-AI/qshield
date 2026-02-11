import type { EvidenceRecord } from '@qshield/core';
import { formatRelativeTime, truncateHash, formatAdapterName } from '@/lib/formatters';

interface EvidenceTableProps {
  items: EvidenceRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  page: number;
  hasMore: boolean;
  total: number;
  onPageChange: (page: number) => void;
}

export function EvidenceTable({
  items,
  selectedId,
  onSelect,
  page,
  hasMore,
  total,
  onPageChange,
}: EvidenceTableProps) {
  if (items.length === 0) {
    return (
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
            d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"
          />
        </svg>
        <p className="mt-3 text-sm text-slate-400">No evidence records found</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-slate-700">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/80">
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                ID
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Source
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Event Type
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">
                Verified
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {items.map((record) => (
              <tr
                key={record.id}
                onClick={() => onSelect(record.id)}
                className={`cursor-pointer transition-colors ${
                  selectedId === record.id
                    ? 'bg-sky-500/5 border-l-2 border-l-sky-500'
                    : 'bg-slate-900 hover:bg-slate-800/50'
                }`}
              >
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-slate-300">
                    {truncateHash(record.id, 6)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300 uppercase tracking-wider">
                    {formatAdapterName(record.source)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300">{record.eventType}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {formatRelativeTime(record.timestamp)}
                </td>
                <td className="px-4 py-3 text-center">
                  {record.verified ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs">Yes</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs">No</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Showing {items.length} of {total} records
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-slate-400">Page {page}</span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={!hasMore}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
