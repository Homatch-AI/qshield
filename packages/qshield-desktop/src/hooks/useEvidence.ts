import { useEffect } from 'react';
import useEvidenceStore from '@/stores/evidence-store';

/**
 * Hook for evidence vault data with pagination, search, sort, and selection.
 */
export function useEvidence() {
  const {
    items,
    total,
    page,
    pageSize,
    hasMore,
    loading,
    error,
    selectedId,
    selectedRecord,
    searchQuery,
    sortBy,
    sortOrder,
    selectedIds,
    fetchList,
    fetchOne,
    verify,
    search,
    exportRecords,
    setPage,
    setSelected,
    setSort,
    toggleSelection,
    selectAll,
    clearSelection,
  } = useEvidenceStore();

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return {
    items,
    total,
    page,
    pageSize,
    hasMore,
    loading,
    error,
    selectedId,
    selectedRecord,
    searchQuery,
    sortBy,
    sortOrder,
    selectedIds,
    getOne: fetchOne,
    verify,
    search,
    exportRecords,
    setPage,
    setSelected,
    setSort,
    toggleSelection,
    selectAll,
    clearSelection,
  };
}
