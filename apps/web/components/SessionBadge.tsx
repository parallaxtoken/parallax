import { hoursAgo } from '@/lib/format';

const LABEL: Record<string, string> = {
  REGULAR: 'New York open',
  PRE: 'Pre-market',
  POST: 'After hours',
  OVERNIGHT: 'Overnight',
  CLOSED_WEEKEND: 'New York closed',
  CLOSED_HOLIDAY: 'Market holiday',
  HALTED: 'Halted',
  CORPORATE_ACTION: 'Corporate action',
};

export function SessionBadge({ session, ageSec }: { session: string; ageSec: number }) {
  const live = ageSec === 0 && !['CORPORATE_ACTION', 'HALTED'].includes(session);
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-xs ${live ? 'bg-net/15 text-net' : 'bg-session/25 text-ink'}`}>
      <span className={`size-2 rounded-full ${live ? 'bg-net' : 'bg-session'}`} aria-hidden />
      {LABEL[session] ?? session}
      {!live && ageSec > 0 ? `, reference ${hoursAgo(ageSec)} old` : ''}
    </span>
  );
}
