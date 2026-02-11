import { useEvidence } from '@/hooks/useEvidence';
import { EvidenceSearch } from '@/components/vault/EvidenceSearch';
import { EvidenceTable } from '@/components/vault/EvidenceTable';
import { EvidenceDetail } from '@/components/vault/EvidenceDetail';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

export default function EvidenceVault() {
  const {
    items,
    total,
    page,
    hasMore,
    loading,
    selectedId,
    selectedRecord,
    search,
    verify,
    exportRecords,
    setPage,
    setSelected,
  } = useEvidence();

  const handleExport = async () => {
    const ids = items.map((item) => item.id);
    if (ids.length > 0) {
      await exportRecords(ids);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Evidence Vault</h1>
          <p className="text-sm text-slate-400 mt-1">
            Tamper-proof evidence chain with cryptographic verification
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={items.length === 0}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export
        </button>
      </div>

      {/* Search */}
      <EvidenceSearch onSearch={search} />

      {/* Main Content */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className={`grid gap-6 ${selectedId ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>
          <div className={selectedId ? 'lg:col-span-3' : ''}>
            <EvidenceTable
              items={items}
              selectedId={selectedId}
              onSelect={setSelected}
              page={page}
              hasMore={hasMore}
              total={total}
              onPageChange={setPage}
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
