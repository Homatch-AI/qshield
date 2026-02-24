import { useState, useEffect, useCallback } from 'react';
import { isIPCAvailable } from '@/lib/mock-data';
import { formatRelativeTime } from '@/lib/formatters';

interface ProtectedZone {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'directory';
  protectionLevel: 'warn' | 'block' | 'freeze';
  createdAt: string;
  enabled: boolean;
  violationCount: number;
  lastViolation: string | null;
}

const LEVEL_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  warn: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Warn' },
  block: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', label: 'Block' },
  freeze: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', label: 'Freeze' },
};

export default function AIProtectedZones() {
  const [zones, setZones] = useState<ProtectedZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addLevel, setAddLevel] = useState<'warn' | 'block' | 'freeze'>('freeze');

  const fetchZones = useCallback(async () => {
    if (!isIPCAvailable()) return;
    try {
      const data = await window.qshield.ai.zones.list() as ProtectedZone[];
      setZones(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  const handleBrowse = async () => {
    if (!isIPCAvailable()) return;
    const result = await window.qshield.ai.zones.browse();
    if (result.canceled || !result.path) return;
    try {
      await window.qshield.ai.zones.add({
        path: result.path,
        name: result.name ?? result.path.split('/').pop() ?? 'unknown',
        type: (result.type as 'file' | 'directory') ?? 'file',
        protectionLevel: addLevel,
      });
      setShowAdd(false);
      fetchZones();
    } catch (err) {
      console.error('[AIZones] Failed to add zone:', err);
    }
  };

  const handleRemove = async (id: string) => {
    if (!isIPCAvailable()) return;
    await window.qshield.ai.zones.remove(id);
    fetchZones();
  };

  const handleToggle = async (id: string) => {
    if (!isIPCAvailable()) return;
    await window.qshield.ai.zones.toggle(id);
    fetchZones();
  };

  const handleLevelChange = async (id: string, level: string) => {
    if (!isIPCAvailable()) return;
    await window.qshield.ai.zones.updateLevel(id, level);
    fetchZones();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Protected Zones</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Files and directories AI agents are forbidden from accessing
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-lg bg-violet-500/10 border border-violet-500/30 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-500/20 transition-colors"
        >
          {showAdd ? 'Cancel' : '+ Add Zone'}
        </button>
      </div>

      {/* Add dialog */}
      {showAdd && (
        <div className="rounded-xl border border-slate-600 bg-slate-800/50 p-4 space-y-3">
          <div className="text-sm text-slate-300">Select a file or folder to protect:</div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Protection level:</span>
            {(['warn', 'block', 'freeze'] as const).map((lvl) => {
              const c = LEVEL_COLORS[lvl];
              return (
                <button
                  key={lvl}
                  onClick={() => setAddLevel(lvl)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    addLevel === lvl
                      ? `${c.bg} ${c.text} ${c.border}`
                      : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <div className="text-[10px] text-slate-500">
            <strong>Warn</strong> — log alert, no blocking &nbsp;|&nbsp;
            <strong>Block</strong> — alert + spike risk velocity &nbsp;|&nbsp;
            <strong>Freeze</strong> — alert + immediately freeze the agent session
          </div>
          <button
            onClick={handleBrowse}
            className="rounded-lg bg-sky-500/10 border border-sky-500/30 px-4 py-2 text-sm font-medium text-sky-400 hover:bg-sky-500/20 transition-colors"
          >
            Browse...
          </button>
        </div>
      )}

      {/* Zone list */}
      {loading ? (
        <div className="text-center py-8 text-sm text-slate-500">Loading zones...</div>
      ) : zones.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 text-center">
          <div className="text-2xl mb-2">🛡️</div>
          <p className="text-sm text-slate-400">No protected zones configured</p>
          <p className="text-xs text-slate-500 mt-1">
            Add files or directories to prevent AI agents from accessing them
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {zones.map((zone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              onRemove={() => handleRemove(zone.id)}
              onToggle={() => handleToggle(zone.id)}
              onLevelChange={(level) => handleLevelChange(zone.id, level)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ZoneCard({
  zone,
  onRemove,
  onToggle,
  onLevelChange,
}: {
  zone: ProtectedZone;
  onRemove: () => void;
  onToggle: () => void;
  onLevelChange: (level: string) => void;
}) {
  const levelInfo = LEVEL_COLORS[zone.protectionLevel] ?? LEVEL_COLORS.freeze;

  return (
    <div className={`rounded-xl border bg-slate-900 p-3 transition-colors ${
      zone.enabled ? 'border-slate-700' : 'border-slate-800 opacity-50'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-9 w-9 rounded-lg ${levelInfo.bg} flex items-center justify-center shrink-0`}>
            <span className="text-base">{zone.type === 'directory' ? '📁' : '📄'}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-slate-100 truncate">{zone.name}</span>
              <select
                value={zone.protectionLevel}
                onChange={(e) => onLevelChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border cursor-pointer ${levelInfo.bg} ${levelInfo.text} ${levelInfo.border} bg-transparent`}
              >
                <option value="warn">Warn</option>
                <option value="block">Block</option>
                <option value="freeze">Freeze</option>
              </select>
            </div>
            <div className="text-[11px] text-slate-500 truncate mt-0.5" title={zone.path}>
              {zone.path}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {zone.violationCount > 0 && (
            <span className="text-[10px] text-red-400 font-medium">
              {zone.violationCount} violation{zone.violationCount !== 1 ? 's' : ''}
              {zone.lastViolation && ` · ${formatRelativeTime(zone.lastViolation)}`}
            </span>
          )}

          <button
            onClick={onToggle}
            className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
              zone.enabled
                ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            {zone.enabled ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={onRemove}
            className="rounded-md px-2 py-1 text-[10px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
