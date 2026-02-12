import { useState, useEffect, useCallback } from 'react';
import { isIPCAvailable } from '@/lib/mock-data';

// ── Types ────────────────────────────────────────────────────────────────────

interface CryptoStatus {
  clipboardGuard: {
    enabled: boolean;
    lastCheck: string;
    detections: number;
    lastDetectedAddress?: string;
    lastDetectedChain?: string;
  };
  trustedAddresses: number;
  recentTransactions: number;
  activeAlerts: number;
}

interface AddressVerification {
  valid: boolean;
  chain: string;
  address: string;
  checksumValid: boolean;
  isScam: boolean;
  warnings: string[];
}

interface TrustedAddress {
  address: string;
  chain: string;
  label?: string;
  trusted: boolean;
  addedAt: string;
}

interface CryptoAlert {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  address?: string;
  chain?: string;
  timestamp: string;
  dismissed: boolean;
}

const CHAINS = ['ethereum', 'bitcoin', 'solana', 'polygon', 'arbitrum', 'optimism'] as const;

const CHAIN_COLORS: Record<string, string> = {
  ethereum: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  bitcoin: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  solana: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  polygon: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  arbitrum: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  optimism: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/30',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  low: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function CryptoSecurity() {
  const [status, setStatus] = useState<CryptoStatus | null>(null);
  const [addressBook, setAddressBook] = useState<TrustedAddress[]>([]);
  const [alerts, setAlerts] = useState<CryptoAlert[]>([]);
  const [loading, setLoading] = useState(true);

  // Verification form state
  const [verifyAddress, setVerifyAddress] = useState('');
  const [verifyChain, setVerifyChain] = useState<string>('ethereum');
  const [verification, setVerification] = useState<AddressVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Add address form state
  const [addAddress, setAddAddress] = useState('');
  const [addChain, setAddChain] = useState<string>('ethereum');
  const [addLabel, setAddLabel] = useState('');

  const loadData = useCallback(async () => {
    if (!isIPCAvailable()) {
      setLoading(false);
      return;
    }
    try {
      const [statusData, bookData, alertData] = await Promise.all([
        window.qshield.crypto.getStatus(),
        window.qshield.crypto.getAddressBook(),
        window.qshield.crypto.getAlerts(),
      ]);
      setStatus(statusData as CryptoStatus);
      setAddressBook(bookData as TrustedAddress[]);
      setAlerts(alertData as CryptoAlert[]);
    } catch (err) {
      console.error('Failed to load crypto data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleVerify = async () => {
    if (!verifyAddress.trim() || !isIPCAvailable()) return;
    setVerifying(true);
    try {
      const result = await window.qshield.crypto.verifyAddress(verifyAddress.trim(), verifyChain);
      setVerification(result as AddressVerification);
    } catch (err) {
      console.error('Verification failed:', err);
    } finally {
      setVerifying(false);
    }
  };

  const handleAddTrusted = async () => {
    if (!addAddress.trim() || !isIPCAvailable()) return;
    try {
      await window.qshield.crypto.addTrustedAddress(addAddress.trim(), addChain, addLabel || undefined);
      setAddAddress('');
      setAddLabel('');
      await loadData();
    } catch (err) {
      console.error('Failed to add address:', err);
    }
  };

  const handleRemoveTrusted = async (address: string) => {
    if (!isIPCAvailable()) return;
    try {
      await window.qshield.crypto.removeTrustedAddress(address);
      await loadData();
    } catch (err) {
      console.error('Failed to remove address:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-sky-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Crypto Security</h1>
        <p className="text-sm text-slate-400 mt-1">
          Clipboard hijack detection, address verification, and transaction monitoring
        </p>
      </div>

      {/* Status Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          label="Clipboard Guard"
          value={status?.clipboardGuard.enabled ? 'Active' : 'Inactive'}
          detail={`${status?.clipboardGuard.detections ?? 0} detections`}
          color={status?.clipboardGuard.enabled ? 'emerald' : 'slate'}
        />
        <StatusCard
          label="Trusted Addresses"
          value={String(status?.trustedAddresses ?? 0)}
          detail="in address book"
          color="sky"
        />
        <StatusCard
          label="Transactions"
          value={String(status?.recentTransactions ?? 0)}
          detail="recently verified"
          color="violet"
        />
        <StatusCard
          label="Active Alerts"
          value={String(status?.activeAlerts ?? 0)}
          detail="requiring attention"
          color={status?.activeAlerts ? 'red' : 'emerald'}
        />
      </div>

      {/* Clipboard Guard Banner */}
      {status?.clipboardGuard.lastDetectedAddress && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
            <div>
              <p className="text-sm font-medium text-amber-400">Last Clipboard Detection</p>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                {status.clipboardGuard.lastDetectedAddress}
              </p>
              {status.clipboardGuard.lastDetectedChain && (
                <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full border ${CHAIN_COLORS[status.clipboardGuard.lastDetectedChain] ?? 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
                  {status.clipboardGuard.lastDetectedChain}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Address Verification Tool */}
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Address Verification</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-xs text-slate-500 mb-1">Address</label>
            <input
              type="text"
              value={verifyAddress}
              onChange={(e) => setVerifyAddress(e.target.value)}
              placeholder="0x... or bc1... or Solana address"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 font-mono placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div className="w-40">
            <label className="block text-xs text-slate-500 mb-1">Chain</label>
            <select
              value={verifyChain}
              onChange={(e) => setVerifyChain(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              {CHAINS.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleVerify}
            disabled={verifying || !verifyAddress.trim()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {verifying ? 'Verifying...' : 'Verify'}
          </button>
        </div>

        {/* Verification Result */}
        {verification && (
          <div className={`mt-4 rounded-lg border p-4 ${verification.valid && !verification.isScam ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`h-2.5 w-2.5 rounded-full ${verification.valid && !verification.isScam ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className={`text-sm font-medium ${verification.valid && !verification.isScam ? 'text-emerald-400' : 'text-red-400'}`}>
                {verification.valid && !verification.isScam ? 'Valid Address' : 'Invalid or Unsafe'}
              </span>
            </div>
            <div className="space-y-1 text-xs text-slate-400">
              <p>Format: {verification.valid ? 'Valid' : 'Invalid'}</p>
              <p>Checksum: {verification.checksumValid ? 'Valid' : 'Failed'}</p>
              <p>Scam Database: {verification.isScam ? 'MATCH FOUND' : 'Clean'}</p>
            </div>
            {verification.warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {verification.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-400">{w}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Trusted Address Book */}
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Trusted Address Book</h2>

        {/* Add address form */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end mb-4">
          <div className="flex-1">
            <label className="block text-xs text-slate-500 mb-1">Address</label>
            <input
              type="text"
              value={addAddress}
              onChange={(e) => setAddAddress(e.target.value)}
              placeholder="Wallet address"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 font-mono placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div className="w-36">
            <label className="block text-xs text-slate-500 mb-1">Chain</label>
            <select
              value={addChain}
              onChange={(e) => setAddChain(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              {CHAINS.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="w-36">
            <label className="block text-xs text-slate-500 mb-1">Label (optional)</label>
            <input
              type="text"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              placeholder="e.g. My Wallet"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>
          <button
            onClick={handleAddTrusted}
            disabled={!addAddress.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>

        {/* Address table */}
        {addressBook.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No trusted addresses yet. Add one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="pb-2 pr-4">Address</th>
                  <th className="pb-2 pr-4">Chain</th>
                  <th className="pb-2 pr-4">Label</th>
                  <th className="pb-2 pr-4">Added</th>
                  <th className="pb-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {addressBook.map((entry) => (
                  <tr key={entry.address} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="py-2.5 pr-4 font-mono text-slate-300 text-xs">
                      {entry.address.slice(0, 10)}...{entry.address.slice(-6)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full border ${CHAIN_COLORS[entry.chain] ?? 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
                        {entry.chain}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-400">{entry.label ?? '\u2014'}</td>
                    <td className="py-2.5 pr-4 text-xs text-slate-500">{new Date(entry.addedAt).toLocaleDateString()}</td>
                    <td className="py-2.5">
                      <button
                        onClick={() => handleRemoveTrusted(entry.address)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Crypto Alerts */}
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Crypto Alerts</h2>
          <span className="text-xs text-slate-500">{alerts.filter((a) => !a.dismissed).length} active</span>
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No crypto alerts. Your transactions look safe.</p>
        ) : (
          <div className="space-y-2">
            {alerts.filter((a) => !a.dismissed).slice(0, 10).map((alert) => (
              <div
                key={alert.id}
                className={`rounded-lg border p-3 ${SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.low}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium uppercase tracking-wider">{alert.severity}</span>
                      {alert.chain && (
                        <span className="text-xs text-slate-500">{alert.chain}</span>
                      )}
                    </div>
                    <p className="text-sm mt-1">{alert.message}</p>
                    <p className="text-xs text-slate-500 mt-1">{new Date(alert.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusCard({ label, value, detail, color }: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-500',
    sky: 'text-sky-500',
    violet: 'text-violet-500',
    red: 'text-red-500',
    slate: 'text-slate-400',
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      <p className={`mt-1 text-xl font-bold ${colorMap[color] ?? 'text-slate-100'}`}>{value}</p>
      <span className="text-xs text-slate-600">{detail}</span>
    </div>
  );
}
