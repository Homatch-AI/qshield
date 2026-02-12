import { useCallback } from 'react';
import type { AdapterStatus } from '@qshield/core';
import { useIPC } from '@/hooks/useIPC';
import { SkeletonCard } from '@/components/shared/SkeletonLoader';
import { formatRelativeTime, formatAdapterName } from '@/lib/formatters';
import { ADAPTER_LABELS } from '@/lib/constants';
import { isIPCAvailable, mockAdapterStatuses } from '@/lib/mock-data';

/**
 * Card grid showing each adapter's status with color indicators and event counts.
 */
export function ActiveMonitors() {
  const fetchAdapters = useCallback(async () => {
    if (isIPCAvailable()) return window.qshield.adapters.list();
    return mockAdapterStatuses();
  }, []);
  const { data: adapters, loading } = useIPC(fetchAdapters);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!adapters || adapters.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 text-center text-slate-500">
        No adapters configured
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {adapters.map((adapter: AdapterStatus) => {
        const statusColor = adapter.error
          ? 'text-red-400'
          : adapter.connected
          ? 'text-emerald-400'
          : 'text-slate-500';
        const statusDot = adapter.error
          ? 'bg-red-500'
          : adapter.connected
          ? 'bg-emerald-500 animate-pulse'
          : 'bg-slate-600';
        const statusLabel = adapter.error
          ? 'Error'
          : adapter.connected
          ? 'Running'
          : adapter.enabled
          ? 'Stopped'
          : 'Disabled';

        return (
          <div
            key={adapter.id}
            className="rounded-xl border border-slate-700 bg-slate-900 p-4 transition-colors hover:border-slate-600 hover:bg-slate-800/50"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    adapter.connected
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : adapter.error
                      ? 'bg-red-500/10 text-red-500'
                      : 'bg-slate-700/50 text-slate-500'
                  }`}
                >
                  <AdapterIcon type={adapter.id} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-100">
                    {ADAPTER_LABELS[adapter.id] ?? formatAdapterName(adapter.id)}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot}`} />
                    <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-700/50 pt-3">
              <div>
                <span className="text-xs text-slate-500">Events</span>
                <p className="text-sm font-semibold text-slate-200 tabular-nums">
                  {adapter.eventCount.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500">Last Event</span>
                <p className="text-sm text-slate-300">
                  {adapter.lastEvent ? formatRelativeTime(adapter.lastEvent) : 'Never'}
                </p>
              </div>
            </div>

            {adapter.error && (
              <div className="mt-2 rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400">
                {adapter.error}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AdapterIcon({ type }: { type: string }) {
  switch (type) {
    case 'zoom':
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 4h10a4 4 0 014 4v8a4 4 0 01-4 4H4a2 2 0 01-2-2V6a2 2 0 012-2zm14 5l4-3v12l-4-3V9z" />
        </svg>
      );
    case 'teams':
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.5 6a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM14 5.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM22 9h-5a1 1 0 00-1 1v7a3 3 0 01-3 3h-2.5a5.5 5.5 0 005.5 5.5h.5a5.5 5.5 0 005.5-5.5V9zM2 11h10a1 1 0 011 1v6a4 4 0 01-4 4H5a4 4 0 01-4-4v-6a1 1 0 011-1z" />
        </svg>
      );
    case 'email':
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      );
    case 'file':
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    default:
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
        </svg>
      );
  }
}
