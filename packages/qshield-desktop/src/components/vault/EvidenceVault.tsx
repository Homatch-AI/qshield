import { useEvidence } from '@/hooks/useEvidence';
import { EvidenceSearch } from '@/components/vault/EvidenceSearch';
import { EvidenceTable } from '@/components/vault/EvidenceTable';
import { EvidenceDetail } from '@/components/vault/EvidenceDetail';
import { SkeletonTable } from '@/components/shared/SkeletonLoader';

/**
 * Evidence Vault page with search, sortable table, bulk actions, and detail panel.
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

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{'\uD83E\uDDEC'} Double-Helix Vault</h1>
          <p className="text-sm text-slate-400 mt-1">
            Dual-chain tamper-proof evidence with structural position verification
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
        <SkeletonTable rows={8} cols={5} />
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
