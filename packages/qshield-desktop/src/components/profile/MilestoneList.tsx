import { ALL_MILESTONES } from '@/stores/profile-store';
import type { Milestone } from '@/stores/profile-store';

interface MilestoneListProps {
  earned: Milestone[];
}

const ICON_PATHS: Record<string, React.ReactNode> = {
  shield: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  ),
  fire: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
  ),
  bolt: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  ),
  star: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
  ),
  check: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function MilestoneList({ earned }: MilestoneListProps) {
  const earnedIds = new Set(earned.map(m => m.id));

  const upcoming = ALL_MILESTONES
    .filter(m => !earnedIds.has(m.id))
    .slice(0, 3);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
      <h3 className="mb-4 text-sm font-semibold text-slate-200">Milestones</h3>

      <div className="space-y-2">
        {/* Earned milestones */}
        {earned.map(m => {
          const def = ALL_MILESTONES.find(a => a.id === m.id);
          const iconKey = def?.icon ?? m.icon ?? 'shield';
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  {ICON_PATHS[iconKey] ?? ICON_PATHS.shield}
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-amber-300">{m.title}</span>
                <p className="text-xs text-slate-500 truncate">{m.description}</p>
              </div>
              <span className="text-xs text-slate-500 shrink-0">
                {formatDate(m.earnedAt)}
              </span>
            </div>
          );
        })}

        {/* Upcoming milestones */}
        {upcoming.map(m => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700/50">
              <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                {ICON_PATHS[m.icon] ?? ICON_PATHS.shield}
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-slate-400">{m.title}</span>
              <p className="text-xs text-slate-600 truncate">{m.description}</p>
            </div>
            <span className="text-xs text-slate-600 shrink-0">
              {m.hint}
            </span>
          </div>
        ))}

        {earned.length === 0 && upcoming.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-600">
            No milestones yet. Keep monitoring to earn achievements!
          </p>
        )}
      </div>
    </div>
  );
}
