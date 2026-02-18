import { useState, useRef, useEffect } from 'react';
import { useAssetStore } from '@/stores/asset-store';

type AssetType = 'file' | 'directory';
type Sensitivity = 'normal' | 'strict' | 'critical';

interface AddAssetDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const SENSITIVITY_OPTIONS: Array<{
  value: Sensitivity;
  label: string;
  description: string;
  color: string;
  border: string;
  bg: string;
}> = [
  {
    value: 'normal',
    label: 'Normal',
    description: 'Standard monitoring. Periodic hash verification every 60 minutes.',
    color: 'text-sky-400',
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/10',
  },
  {
    value: 'strict',
    label: 'Strict',
    description: 'Enhanced monitoring. Frequent verification every 15 minutes. Higher trust impact on changes.',
    color: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
  },
  {
    value: 'critical',
    label: 'Critical',
    description: 'Maximum monitoring. Continuous verification every 5 minutes. Significant trust impact on any change.',
    color: 'text-red-400',
    border: 'border-red-500/30',
    bg: 'bg-red-500/10',
  },
];

export function AddAssetDialog({ isOpen, onClose }: AddAssetDialogProps) {
  const [assetType, setAssetType] = useState<AssetType>('file');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity>('normal');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const browseForPath = useAssetStore((s) => s.browseForPath);
  const addAsset = useAssetStore((s) => s.addAsset);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setAssetType('file');
      setSelectedPath(null);
      setSensitivity('normal');
      setAdding(false);
      setError(null);
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBrowse = async () => {
    try {
      const path = await browseForPath(assetType);
      if (path) {
        setSelectedPath(path);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open file picker');
    }
  };

  const handleAdd = async () => {
    if (!selectedPath) {
      setError('Please select a file or directory to monitor.');
      return;
    }

    setAdding(true);
    setError(null);
    try {
      await addAsset(selectedPath, assetType, sensitivity);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add asset');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-lg w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Add High-Trust Asset</h2>
            <p className="text-xs text-slate-400 mt-0.5">Select a file or directory for enhanced monitoring</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {/* Step 1: Type selection */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Asset Type</label>
            <div className="mt-2 flex rounded-lg border border-slate-700 bg-slate-900 p-1">
              <button
                onClick={() => { setAssetType('file'); setSelectedPath(null); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  assetType === 'file' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                File
              </button>
              <button
                onClick={() => { setAssetType('directory'); setSelectedPath(null); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  assetType === 'directory' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                Directory
              </button>
            </div>
          </div>

          {/* Step 2: Path selection */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Path</label>
            <div className="mt-2 flex gap-2">
              <div className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm min-h-[40px] flex items-center">
                {selectedPath ? (
                  <span className="text-slate-200 font-mono text-xs truncate">{selectedPath}</span>
                ) : (
                  <span className="text-slate-500">No {assetType} selected</span>
                )}
              </div>
              <button
                onClick={handleBrowse}
                className="shrink-0 rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-600 transition-colors"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Step 3: Sensitivity selection */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sensitivity Level</label>
            <div className="mt-2 space-y-2">
              {SENSITIVITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSensitivity(opt.value)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    sensitivity === opt.value
                      ? `${opt.border} ${opt.bg}`
                      : 'border-slate-700 bg-slate-900 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${
                      opt.value === 'normal' ? 'bg-sky-500' :
                      opt.value === 'strict' ? 'bg-amber-500' : 'bg-red-500'
                    }`} />
                    <span className={`text-sm font-semibold ${
                      sensitivity === opt.value ? opt.color : 'text-slate-200'
                    }`}>
                      {opt.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 pl-4">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-slate-700 px-6 py-4 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedPath || adding}
            className="flex-1 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {adding ? 'Adding...' : 'Add Asset'}
          </button>
        </div>
      </div>
    </div>
  );
}
