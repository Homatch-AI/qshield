import { useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { SEVERITY_COLORS } from '@/lib/constants';

export interface Toast {
  id: string;
  title: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  timestamp: number;
  dismissed: boolean;
}

interface ToastStoreState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'timestamp' | 'dismissed'>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let _toastId = 0;

/** Global toast notification store */
export const useToastStore = create<ToastStoreState>((set) => ({
  toasts: [],
  push: (toast) => {
    _toastId += 1;
    const id = `toast-${_toastId}`;
    set((s) => ({
      toasts: [{ ...toast, id, timestamp: Date.now(), dismissed: false }, ...s.toasts].slice(0, 10),
    }));
  },
  dismiss: (id) => {
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, dismissed: true } : t)),
    }));
    // Remove after exit animation
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 300);
  },
  clear: () => set({ toasts: [] }),
}));

/**
 * Toast notification container. Renders floating toast alerts at the top-right.
 * Toasts auto-dismiss after 5 seconds.
 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const active = toasts.filter((t) => !t.dismissed);
    if (active.length === 0) return;

    const timers = active.map((t) => {
      const elapsed = Date.now() - t.timestamp;
      const remaining = Math.max(0, 5000 - elapsed);
      return setTimeout(() => dismiss(t.id), remaining);
    });

    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  const visibleToasts = toasts.filter((t) => !t.dismissed).slice(0, 5);

  if (visibleToasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[999] flex flex-col gap-2 w-80 pointer-events-none">
      {visibleToasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const handleDismiss = useCallback(() => onDismiss(toast.id), [toast.id, onDismiss]);

  const colors = toast.severity === 'info'
    ? { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' }
    : SEVERITY_COLORS[toast.severity] ?? SEVERITY_COLORS.low;

  return (
    <div
      className={`pointer-events-auto rounded-lg border ${colors.border} ${colors.bg} p-3 shadow-lg shadow-black/20 backdrop-blur-sm animate-in slide-in-from-right duration-300`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 shrink-0 ${colors.text}`}>
          {toast.severity === 'critical' ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          ) : toast.severity === 'info' ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold ${colors.text}`}>{toast.title}</p>
          <p className="mt-0.5 text-[11px] text-slate-400 leading-relaxed truncate">
            {toast.message}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
          aria-label="Dismiss notification"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {/* Auto-dismiss progress bar */}
      <div className="mt-2 h-0.5 w-full rounded-full bg-slate-700/50 overflow-hidden">
        <div
          className={`h-full rounded-full ${colors.text.replace('text-', 'bg-')}`}
          style={{
            animation: 'toast-progress 5s linear forwards',
          }}
        />
      </div>
      <style>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
