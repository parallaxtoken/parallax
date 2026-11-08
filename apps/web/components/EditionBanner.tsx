'use client';

import { useEffect, useState } from 'react';
import { hoursAgo } from '@/lib/format';

interface SessionPayload {
  session: string;
  referenceAgeSec: number;
  nextOpenUtc: string | null;
  degraded: { kind: string } | null;
}

/** Market-clock theme: the paper edition while New York trades, the night edition while it is closed. */
export function EditionBanner() {
  const [s, setS] = useState<SessionPayload | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/session')
        .then((r) => r.json())
        .then((j) => alive && setS(j))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    const night = s ? !['REGULAR', 'PRE', 'POST'].includes(s.session) : false;
    document.documentElement.dataset.edition = night ? 'night' : 'day';
  }, [s]);

  if (!s) return <div className="mx-auto mt-4 h-5 w-[min(1180px,calc(100%-24px))]" aria-hidden />;
  const closed = !['REGULAR', 'PRE', 'POST', 'OVERNIGHT'].includes(s.session);
  const text = s.degraded
    ? 'Market status unavailable: the data source did not answer. Orders are still on-chain.'
    : s.session === 'CORPORATE_ACTION'
      ? 'A corporate action is in progress on this stock. Fills are paused by the issuer.'
      : closed
        ? `New York closed ${hoursAgo(s.referenceAgeSec)}. Your orders are still being watched.`
        : s.session === 'OVERNIGHT'
          ? 'Overnight session. Equity feeds are live; liquidity is thin.'
          : `New York is open (${s.session.toLowerCase()}).`;
  return (
    <p className="mx-auto mt-4 w-[min(1180px,calc(100%-24px))] px-2 text-center font-mono text-xs text-graphite" role="status">
      {text}
    </p>
  );
}
