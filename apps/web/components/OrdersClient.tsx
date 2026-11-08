'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAccount, usePublicClient, useSendTransaction } from 'wagmi';
import { bsc } from 'wagmi/chains';
import { explainRevert } from '@/lib/errors';
import { dec } from '@/lib/format';

interface Order {
  id: string;
  side: 'BUY' | 'SELL';
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  ticker: string | null;
  amount: string;
  limit: string;
  deadline: string;
  diary: string[];
  reconciliation?: { tx: string; state: 'MATCH' | 'MISMATCH' | 'NOT_INDEXED' | 'UNAVAILABLE'; txStatus: string | null; block: string | null; feeBnb: string | null }[];
}
interface Payload { deployed: boolean; orders: Order[]; keeper: string }

const TONE: Record<string, string> = { open: 'bg-session/25', filled: 'bg-net/20', cancelled: 'bg-paper-2', expired: 'bg-paper-2' };
const LABEL: Record<string, string> = { open: 'watching', filled: 'filled', cancelled: 'cancelled', expired: 'expired' };

export function OrdersClient() {
  const { address, isConnected } = useAccount();
  const pc = usePublicClient({ chainId: bsc.id });
  const { sendTransactionAsync } = useSendTransaction();
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const cancelParam = useSearchParams().get('cancel');

  const load = useCallback(async () => {
    if (!address) return;
    setErr(null);
    try {
      const r = await fetch(`/api/orders?owner=${address}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? j.error ?? 'orders unavailable');
      setData(j as Payload);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The orders could not be read.');
    }
  }, [address]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const cancel = useCallback(
    async (id: string) => {
      if (!address || !pc) return;
      setMsg(null);
      try {
        const r = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent: 'cancel', orderId: id }) });
        const j = await r.json();
        if (!j.ok) throw new Error(j.message);
        const c = j.calls[0] as { to: `0x${string}`; data: `0x${string}` };
        await pc.call({ account: address, to: c.to, data: c.data });
        const hash = await sendTransactionAsync({ to: c.to, data: c.data, chainId: bsc.id });
        await pc.waitForTransactionReceipt({ hash });
        setMsg(`Order ${id} cancelled.`);
        void load();
      } catch (e) {
        const d = (e as { data?: `0x${string}` }).data;
        setMsg(explainRevert(d, e instanceof Error ? e.message.split('\n')[0] : 'Cancel failed.'));
      }
    },
    [address, pc, sendTransactionAsync, load],
  );

  if (!isConnected) {
    return (
      <div className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-8 text-center">
        <p className="mb-4">Connect the wallet that placed the orders to see them. Reading is free; nothing is signed.</p>
        <div className="flex justify-center"><ConnectButton /></div>
      </div>
    );
  }
  if (err) return <p role="alert" className="rounded-[14px] bg-gross/10 p-4">Orders unavailable: {err}</p>;
  if (!data) return <div className="skeleton h-40 w-full" aria-label="Loading orders" />;
  if (!data.deployed) return <p className="rounded-[14px] bg-paper-2 p-4">The ParallaxBook contract address is not configured yet, so there are no standing orders to show. Buy now works without it.</p>;
  if (data.orders.length === 0) return <p className="rounded-[14px] bg-paper-2 p-4">No standing orders for this wallet. Open a ticker and choose Standing buy or Standing sell.</p>;

  return (
    <div>
      {cancelParam && <p className="mb-4 rounded-[14px] bg-session/20 p-3 text-sm">A link asked to cancel order {cancelParam}. Use the Cancel button on it below; your wallet signs.</p>}
      {msg && <p role="status" className="mb-4 rounded-[14px] bg-paper-2 p-3 text-sm">{msg}</p>}
      {data.keeper === 'unreachable' && <p className="mb-4 rounded-[14px] bg-gross/10 p-3 text-sm">The keeper did not answer, so the diary below is incomplete. The chain state is current.</p>}
      <ul className="grid gap-4">
        {data.orders.map((o) => (
          <li key={o.id} className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5 shadow-[var(--shadow-lift)]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm text-graphite">#{o.id}</span>
              <span className="font-display text-xl font-semibold">{o.side === 'BUY' ? 'Buy' : 'Sell'} {o.ticker ?? 'unknown'}</span>
              <span className={`rounded-full px-3 py-1 font-mono text-xs ${TONE[o.status]}`}>{LABEL[o.status]}</span>
              {o.status === 'open' && (
                <button onClick={() => cancel(o.id)} className="ml-auto rounded-[12px] border border-rule px-3 py-1.5 text-sm hover:bg-paper-2">Cancel</button>
              )}
            </div>
            <p className="num mt-2 text-sm text-graphite">
              {o.side === 'BUY' ? `$${dec(o.amount, 2)} for at least ${dec(o.limit, 4)} shares` : `${dec(o.amount, 4)} shares at no less than $${dec(o.limit, 2)} each`}, until {new Date(o.deadline).toUTCString().slice(5, 22)} UTC
            </p>
            {o.diary.length > 0 ? (
              <ol className="mt-3 space-y-1 border-l border-rule pl-4 text-sm">
                {o.diary.map((d) => <li key={d}>{d}</li>)}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-graphite">The keeper has not written a line for this order yet. It is being watched.</p>
            )}
            {(o.reconciliation ?? []).map((r) => (
              <p key={r.tx} className="mt-2 text-xs text-graphite">
                Reconciled with Binance transaction detail for {r.tx.slice(0, 10)}…:{' '}
                {r.state === 'MATCH' && <span className="text-net">{r.txStatus} at block {r.block ? Number(r.block).toLocaleString('en-US') : '?'}{r.feeBnb ? `, fee ${r.feeBnb} BNB` : ''}</span>}
                {r.state === 'MISMATCH' && <span className="text-gross">MISMATCH: the index says {r.txStatus}</span>}
                {r.state === 'NOT_INDEXED' && 'not indexed yet'}
                {r.state === 'UNAVAILABLE' && 'the index could not be reached'}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
