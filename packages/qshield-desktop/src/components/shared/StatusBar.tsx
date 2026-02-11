import { useCallback } from 'react';
import { useIPC } from '@/hooks/useIPC';
import useTrustStore from '@/stores/trust-store';
import { TRUST_LEVEL_COLORS } from '@/lib/constants';
import { formatTrustScore } from '@/lib/formatters';
import type { AdapterStatus } from '@qshield/core';

export function StatusBar() {
  const score = useTrustStore((s) => s.score);
  const level = useTrustStore((s) => s.level);

  const fetchGateway = useCallback(() => window.qshield.gateway.getStatus(), []);
  const fetchAdapters = useCallback(() => window.qshield.adapters.list(), []);

  const { data: gatewayStatus } = useIPC(fetchGateway);
  const { data: adapters } = useIPC(fetchAdapters);

  const activeAdapters = adapters?.filter((a: AdapterStatus) => a.connected).length ?? 0;
  const totalAdapters = adapters?.length ?? 0;
  const gatewayConnected = gatewayStatus?.connected ?? false;
  const colors = TRUST_LEVEL_COLORS[level];

  return (
    <footer className="flex h-7 items-center justify-between border-t border-slate-700 bg-slate-900 px-3 text-xs text-slate-400">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              gatewayConnected ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
          <span>{gatewayConnected ? 'Connected' : 'Disconnected'}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Adapters:</span>
          <span>
            {activeAdapters}/{totalAdapters} active
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-slate-500">Trust:</span>
        <span className={`inline-block h-2 w-2 rounded-full ${colors.dot}`} />
        <span className={colors.text}>{formatTrustScore(score)}</span>
      </div>
    </footer>
  );
}
