import { useEvidence } from '@/hooks/useEvidence';
import { formatRelativeTime } from '@/lib/formatters';
import { getImpactLabel } from '@/lib/event-descriptions';
import { EvidenceSearch } from '@/components/vault/EvidenceSearch';
import { EvidenceTable } from '@/components/vault/EvidenceTable';
import { EvidenceDetail } from '@/components/vault/EvidenceDetail';
import { SkeletonTable } from '@/components/shared/SkeletonLoader';

/**
 * Evidence Vault page with summary bar, search, sortable table, bulk actions, and detail panel.
 */
export default function EvidenceVault() {
  const {
    items,
    total,
    page,
    hasMore,
    loading,
    selectedId,
    selectedRecord,
    searchQuery,
    sortBy,
    sortOrder,
    selectedIds,
    search,
    verify,
    exportRecords,
    setPage,
    setSelected,
    setSort,
    toggleSelection,
    selectAll,
    clearSelection,
  } = useEvidence();

  const handleExportSelected = async () => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : items.map((item) => item.id);
    if (ids.length > 0) {
      await exportRecords(ids);
    }
  };

  const verifiedCount = items.filter((r) => r.verified).length;
  const uniqueSources = new Set(items.map((r) => r.source)).size;
  const latestTimestamp = items.length > 0
    ? items.reduce((latest, r) => (r.timestamp > latest ? r.timestamp : latest), items[0].timestamp)
    : null;

  const positiveCount = items.filter((r) => getImpactLabel(r.source, r.eventType) === 'positive').length;
  const negativeCount = items.filter((r) => getImpactLabel(r.source, r.eventType) === 'negative').length;

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Trust Activity Log</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time monitoring events with cryptographic proof
          </p>
        </div>
        <button
          onClick={handleExportSelected}
          disabled={items.length === 0}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export {selectedIds.size > 0 ? `(${selectedIds.size})` : 'All'}
        </button>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total Events" value={String(total)} description="All recorded events" />
        <SummaryCard label="Verified" value={String(verifiedCount)} description="Integrity confirmed" />
        <SummaryCard label="Sources Active" value={String(uniqueSources)} description="Monitoring channels" />
        <SummaryCard
          label="Positive"
          value={String(positiveCount)}
          description="Trust-building events"
          accent="text-emerald-400"
        />
        <SummaryCard
          label="Negative"
          value={String(negativeCount)}
          description="Trust-reducing events"
          accent={negativeCount > 0 ? 'text-red-400' : undefined}
        />
        <SummaryCard
          label="Latest"
          value={latestTimestamp ? formatRelativeTime(latestTimestamp) : '--'}
          description="Most recent event"
        />
      </div>

      {/* Search */}
      <EvidenceSearch onSearch={search} resultCount={total} query={searchQuery} />

      {/* Bulk Actions Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-2">
          <span className="text-xs font-medium text-sky-400">
            {selectedIds.size} record{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleExportSelected}
            className="rounded-md bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-400 hover:bg-sky-500/20 transition-colors"
          >
            Export Selected
          </button>
          <button
            onClick={clearSelection}
            className="rounded-md px-3 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Main Content */}
      {loading && items.length === 0 ? (
        <SkeletonTable rows={8} cols={6} />
      ) : (
        <div className={`grid gap-6 ${selectedId ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>
          <div className={selectedId ? 'lg:col-span-3' : ''}>
            <EvidenceTable
              items={items}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelect={setSelected}
              onToggleSelection={toggleSelection}
              onSelectAll={selectAll}
              onClearSelection={clearSelection}
              page={page}
              hasMore={hasMore}
              total={total}
              onPageChange={setPage}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={setSort}
            />
          </div>

          {selectedId && (
            <div className="lg:col-span-2">
              <EvidenceDetail
                record={selectedRecord}
                loading={loading && !selectedRecord}
                onVerify={verify}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, description, accent }: { label: string; value: string; description: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3">
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <p className={`mt-1 text-lg font-bold ${accent ?? 'text-slate-100'}`}>{value}</p>
      <p className="text-[11px] text-slate-500">{description}</p>
    </div>
  );
}
