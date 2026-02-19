import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAssetStore } from '@/stores/asset-store';
import useLicenseStore, { EDITION_LABELS } from '@/stores/license-store';
import { AssetCard } from './AssetCard';
import { AddAssetDialog } from './AddAssetDialog';

let assetsInitialized = false;

export default function HighTrustAssets() {
  const assets = useAssetStore((s) => s.assets);
  const loading = useAssetStore((s) => s.loading);
  const stats = useAssetStore((s) => s.stats);
  const fetchAssets = useAssetStore((s) => s.fetchAssets);
  const fetchStats = useAssetStore((s) => s.fetchStats);
  const subscribe = useAssetStore((s) => s.subscribe);

  const maxAssets = useLicenseStore((s) => s.features.maxHighTrustAssets);
  const tier = useLicenseStore((s) => s.tier);
  const [dialogOpen, setDialogOpen] = useState(false);

  const atLimit = assets.length >= maxAssets;

  // Initialize once
  useEffect(() => {
    if (assetsInitialized) return;
    assetsInitialized = true;

    fetchAssets();
    fetchStats();
    subscribe();
  }, [fetchAssets, fetchStats, subscribe]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">High-Trust Assets</h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor critical files and folders with enhanced trust verification
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          disabled={atLimit}
          title={atLimit ? `Asset limit reached (${maxAssets} max on your plan)` : undefined}
          className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Asset
        </button>
      </div>

      {/* Upgrade banner when at asset limit */}
      {atLimit && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 flex items-center gap-3">
          <svg className="h-5 w-5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <div className="flex-1">
            <span className="text-sm font-medium text-amber-400">Asset limit reached</span>
            <p className="text-xs text-slate-400 mt-0.5">
              Your {EDITION_LABELS[tier] ?? tier} plan supports {maxAssets} asset{maxAssets !== 1 ? 's' : ''}.
              <NavLink to="/settings" className="text-sky-400 hover:text-sky-300 ml-1">Upgrade your plan</NavLink> to monitor more.
            </p>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Assets"
          value={stats?.total ?? assets.length}
          color="text-slate-100"
          icon={
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          }
        />
        <StatCard
          label="Verified"
          value={stats?.verified ?? 0}
          color="text-emerald-500"
          icon={<span className="text-emerald-500 text-sm font-bold">{'\u2713'}</span>}
        />
        <StatCard
          label="Changed"
          value={stats?.changed ?? 0}
          color="text-amber-500"
          icon={<span className="text-amber-500 text-sm font-bold">{'\u26A0'}</span>}
        />
        <StatCard
          label="Unverified"
          value={stats?.unverified ?? 0}
          color="text-slate-400"
          icon={<span className="text-slate-400 text-sm font-bold">{'\u25CB'}</span>}
        />
      </div>

      {/* Asset list */}
      {loading && assets.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
        </div>
      ) : assets.length === 0 ? (
        <EmptyState onAdd={() => setDialogOpen(true)} />
      ) : (
        <div className="space-y-3">
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}

      {/* Add asset dialog */}
      <AddAssetDialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}

// ── Internal components ──────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-800">
        <svg className="h-7 w-7 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-300">No high-trust assets configured</h3>
      <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
        Add files or folders you want to monitor with enhanced trust verification.
        Changes will be tracked with hash verification, trust scoring, and evidence capture.
      </p>
      <button
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add Your First Asset
      </button>
    </div>
  );
}
