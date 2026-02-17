interface ProofBadgeProps {
  status: 'verified' | 'unverified' | 'failed';
  className?: string;
}

const STYLES = {
  verified: 'text-emerald-400',
  unverified: 'text-slate-500',
  failed: 'text-red-400',
} as const;

const LABELS = {
  verified: 'Verified',
  unverified: 'Unverified',
  failed: 'Failed',
} as const;

/**
 * Small shield icon showing cryptographic verification status.
 *
 * - Verified: green shield with checkmark
 * - Unverified: gray shield with question mark
 * - Failed: red shield with X
 */
export function ProofBadge({ status, className = '' }: ProofBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${STYLES[status]} ${className}`}
      title={LABELS[status]}
    >
      {status === 'verified' && (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      )}
      {status === 'unverified' && (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
      )}
      {status === 'failed' && (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      )}
      <span className="text-[11px] font-medium">{LABELS[status]}</span>
    </span>
  );
}
