'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface Check { id: string; name: string; status: 'PASS' | 'FAIL' | 'NOT_APPLICABLE' | 'UNKNOWN'; detail: string }

const TONE: Record<Check['status'], string> = { PASS: 'bg-net/20 text-net', FAIL: 'bg-gross/20 text-gross', NOT_APPLICABLE: 'bg-paper-2 text-graphite', UNKNOWN: 'bg-session/30' };

export function VerifyClient() {
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null); setChecks(null);
    try {
      const r = await fetch('/api/mcp', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'parallax_verify_fill', arguments: { orderId: Number(id) } } }),
      });
      const j = await r.json();
      const text = j.result?.content?.[0]?.text as string | undefined;
      if (j.result?.isError || !text) throw new Error(text ?? 'verification failed');
      setChecks(JSON.parse(text) as Check[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'verification failed');
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-8 max-w-2xl">
      <label htmlFor="oid" className="text-sm text-graphite">Order id</label>
      <div className="mt-1 flex gap-2">
        <input id="oid" inputMode="numeric" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ''))} className="num w-full rounded-[14px] border border-rule bg-paper-3 px-4 py-3 text-lg" placeholder="0" />
        <button onClick={run} disabled={busy || id === ''} className="flex items-center gap-2 rounded-[14px] bg-ink px-5 text-paper disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : null}Verify</button>
      </div>
      {err && <p role="alert" className="mt-4 rounded-[14px] bg-gross/10 p-3 text-sm">{err}</p>}
      {checks && (
        <ul className="mt-6 grid gap-2" aria-live="polite">
          {checks.map((c) => (
            <li key={c.id + c.name} className="grid grid-cols-[auto_1fr] gap-x-4 rounded-[14px] border border-rule bg-paper-3 p-3 text-sm">
              <span className={`h-fit rounded-full px-2.5 py-0.5 font-mono text-xs ${TONE[c.status]}`}>{c.status}</span>
              <span><strong>{c.id}</strong> {c.name}<span className="block font-mono text-[11px] text-graphite">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 font-mono text-xs text-graphite">CLI: pnpm parallax verify --order {id || '0'} --book $NEXT_PUBLIC_PARALLAXBOOK</p>
    </div>
  );
}

