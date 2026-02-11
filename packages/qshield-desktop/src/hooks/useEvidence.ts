import { useEffect } from 'react';
import useEvidenceStore from '@/stores/evidence-store';

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
    fetchList,
    fetchOne,
    verify,
    search,
    exportRecords,
    setPage,
    setSelected,
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
    getOne: fetchOne,
    verify,
    search,
    exportRecords,
    setPage,
    setSelected,
  };
}
