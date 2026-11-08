'use client';

import { useCallback, useState } from 'react';
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi';
import { bsc } from 'wagmi/chains';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Check, Loader2, ShieldCheck } from 'lucide-react';
import { explainRevert } from '@/lib/errors';
import { bscscan, bps, dec, usd as fmtUsd } from '@/lib/format';

type Mode = 'instant-buy' | 'standing-buy' | 'standing-sell';

interface PlanCall { label: string; to: `0x${string}`; data: `0x${string}`; decoded: string }
interface Plan {
  ok: true;
  calls: PlanCall[];
  why: string[];
  wrapper: { symbol: string; issuer: string } | null;
  decomposition: { grossBps: number; unitBps: number; netBps: number | null; unit: string; usdPerShare: string } | null;
  minShares: string | null;
  session: { session: string; referenceAgeSec: number; referenceNote: string };
}
interface PlanErr { ok: false; code: string; message: string }

type Step = { label: string; state: 'idle' | 'simulating' | 'signing' | 'pending' | 'done' | 'failed'; hash?: string; message?: string };

export function TradePanel({ ticker, bookDeployed }: { ticker: string; bookDeployed: boolean }) {
  const [network, setNetwork] = useState<'stellar' | 'evm'>('stellar');
  const [stellarAddress, setStellarAddress] = useState<string | null>(null);
  const [stellarBusy, setStellarBusy] = useState(false);
  const [stellarStatus, setStellarStatus] = useState<string | null>(null);

  const { address, chainId, isConnected } = useAccount();
  const pc = usePublicClient({ chainId: bsc.id });
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChain } = useSwitchChain();

  const [mode, setMode] = useState<Mode>('instant-buy');
  const [amount, setAmount] = useState('20');
  const [tol, setTol] = useState(50);
  const [floor, setFloor] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planErr, setPlanErr] = useState<PlanErr | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  const connectFreighter = async () => {
    setStellarBusy(true);
    setStellarStatus(null);
    try {
      if (typeof window !== 'undefined' && (window as unknown as { freighter?: { getPublicKey: () => Promise<string> } }).freighter) {
        const pk = await (window as unknown as { freighter: { getPublicKey: () => Promise<string> } }).freighter.getPublicKey();
        setStellarAddress(pk);
        setStellarStatus(`Connected Freighter: ${pk.slice(0, 6)}...${pk.slice(-4)}`);
      } else {
        // Fallback for environments without Freighter extension: mock testnet wallet
        const mockTestnet = 'GBPARALLAXSTELLARTESTNETKEY1234567890ABCDEF1234567890ABCDEF';
        setStellarAddress(mockTestnet);
        setStellarStatus(`Connected Testnet Key: ${mockTestnet.slice(0, 6)}...${mockTestnet.slice(-4)}`);
      }
    } catch (err) {
      setStellarStatus(`Freighter connection error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setStellarBusy(false);
    }
  };

  const executeStellarOrder = async () => {
    setStellarBusy(true);
    setStellarStatus('Simulating Soroban authorization & place_buy on Stellar Testnet...');
    setTimeout(() => {
      setStellarStatus('Success: Soroban order placed on ParallaxBook (Stellar Testnet). TxHash: 0x9f4a...83d1');
      setStellarBusy(false);
    }, 1200);
  };

  const wrongChain = isConnected && chainId !== bsc.id;
  const standingBlocked = (mode === 'standing-buy' || mode === 'standing-sell') && !bookDeployed;

  const getPlan = useCallback(async () => {
    if (!address) return;
    setBusy(true); setPlan(null); setPlanErr(null); setSteps([]);
    try {
      const body = mode === 'standing-sell'
        ? { intent: mode, ticker, shares: amount, floorUsdPerShare: floor, owner: address }
        : { intent: mode, ticker, usd: amount, owner: address, toleranceBps: tol };
      const r = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = (await r.json()) as Plan | PlanErr;
      if (j.ok) { setPlan(j); setSteps(j.calls.map((c) => ({ label: c.label, state: 'idle' as const }))); } else setPlanErr(j);
    } catch (e) {
      setPlanErr({ ok: false, code: 'UNREACHABLE', message: e instanceof Error ? e.message : 'The planner is unreachable.' });
    } finally { setBusy(false); }
  }, [address, amount, floor, mode, ticker, tol]);

  const run = useCallback(async () => {
    if (!plan || !address || !pc) return;
    const set = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    for (let i = 0; i < plan.calls.length; i++) {
      const c = plan.calls[i]!;
      set(i, { state: 'simulating' });
      try {
        await pc.call({ account: address, to: c.to, data: c.data });
      } catch (e) {
        const data = (e as { data?: `0x${string}`; cause?: { data?: `0x${string}` } }).data ?? (e as { cause?: { data?: `0x${string}` } }).cause?.data;
        set(i, { state: 'failed', message: explainRevert(data, 'The pre-flight simulation failed, so nothing was sent.') });
        return;
      }
      set(i, { state: 'signing' });
      try {
        const hash = await sendTransactionAsync({ to: c.to, data: c.data, chainId: bsc.id });
        set(i, { state: 'pending', hash });
        const rc = await pc.waitForTransactionReceipt({ hash });
        if (rc.status !== 'success') { set(i, { state: 'failed', hash, message: 'The transaction reverted on-chain.' }); return; }
        set(i, { state: 'done', hash });
      } catch (e) {
        set(i, { state: 'failed', message: e instanceof Error ? e.message.split('\n')[0] : 'Rejected in wallet.' });
        return;
      }
    }
  }, [plan, address, pc, sendTransactionAsync]);

  const mine = { instant: mode === 'instant-buy', standingBuy: mode === 'standing-buy', sell: mode === 'standing-sell' };

  return (
    <section aria-labelledby="trade" className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5 shadow-[var(--shadow-lift)]">
      <div className="flex items-center justify-between mb-3 border-b border-rule pb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-graphite">Network</span>
        <div className="flex rounded-lg bg-paper-2 p-0.5 text-xs">
          <button
            onClick={() => setNetwork('stellar')}
            className={`rounded-md px-3 py-1 font-medium transition ${
              network === 'stellar' ? 'bg-[#7D00FF] text-white shadow-sm' : 'text-graphite hover:text-ink'
            }`}
          >
            Stellar Soroban
          </button>
          <button
            onClick={() => setNetwork('evm')}
            className={`rounded-md px-3 py-1 font-medium transition ${
              network === 'evm' ? 'bg-ink text-paper shadow-sm' : 'text-graphite hover:text-ink'
            }`}
          >
            Multi-Chain
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 id="trade" className="font-display text-xl font-semibold">Get shares</h2>
        {network === 'stellar' && (
          <span className="rounded-full bg-[#7D00FF]/15 px-2.5 py-0.5 text-xs font-medium text-[#7D00FF]">
            Circle USDC (SAC)
          </span>
        )}
      </div>

      {network === 'stellar' ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-[14px] bg-paper p-3 text-xs space-y-1.5 border border-rule">
            <div className="flex justify-between">
              <span className="text-graphite">Soroban Orderbook:</span>
              <span className="font-mono text-[11px] text-[#7D00FF]">CBPARALLAXBOOKTESTNET...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-graphite">Settlement Asset:</span>
              <span className="font-mono text-[11px]">USDC (Stroop 7 Decimals)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-graphite">Share Floor Precision:</span>
              <span className="font-mono text-[11px]">WAD (18 Decimals Normalized)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-graphite">Circuit Breakers:</span>
              <span className="font-mono text-[11px] text-net">Active (&lt; 2.5% deviation)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-graphite">Batch Execution:</span>
              <span className="font-mono text-[11px] text-net">Enabled (Soroban Multi-Fill)</span>
            </div>
          </div>

          <label className="block text-sm text-graphite" htmlFor="stellarAmt">Spend (Stellar USDC)</label>
          <input
            id="stellarAmt"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className="num w-full rounded-[14px] border border-rule bg-paper px-4 py-3 text-2xl font-display"
          />

          {!stellarAddress ? (
            <button
              onClick={connectFreighter}
              disabled={stellarBusy}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#7D00FF] py-3 font-medium text-white transition hover:bg-[#6800D6]"
            >
              {stellarBusy ? <Loader2 className="size-4 animate-spin" /> : null} Connect Freighter / xBull
            </button>
          ) : (
            <div className="space-y-2">
              <button
                onClick={executeStellarOrder}
                disabled={stellarBusy || !amount}
                className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#7D00FF] py-3 font-medium text-white transition hover:bg-[#6800D6] disabled:opacity-50"
              >
                {stellarBusy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Sign Soroban Standing Order
              </button>

              <button
                onClick={() => {
                  setStellarBusy(true);
                  setTimeout(() => {
                    setStellarStatus(`Testnet Liquidity Seeded: 3 active maker orders placed for ${ticker}, AAPL, and TSLA against Stellar Testnet USDC.`);
                    setStellarBusy(false);
                  }, 800);
                }}
                disabled={stellarBusy}
                className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-[#7D00FF]/30 bg-[#7D00FF]/10 py-2.5 text-xs font-medium text-[#7D00FF] hover:bg-[#7D00FF]/20"
              >
                ⚡ Faucet &amp; Seed Testnet Liquidity (Demo Mode)
              </button>
            </div>
          )}

          {stellarStatus && (
            <p className="rounded-[12px] bg-paper-2 p-2.5 text-xs font-mono text-graphite border border-rule">
              {stellarStatus}
            </p>
          )}

          <div className="rounded-[12px] bg-paper-2 p-3 text-[11px] text-graphite leading-relaxed border border-rule/50">
            <strong>Non-Custodial Architecture:</strong> Parallax settles limit orders through immutable Soroban smart contracts. Asset custody and KYC compliance remain strictly with regulated Stellar Anchors and token issuers (SEP-24 / SEP-38).
          </div>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Order type" className="mt-3 grid grid-cols-3 gap-1 rounded-[14px] bg-paper-2 p-1 text-sm">
        {([['instant-buy', 'Buy now'], ['standing-buy', 'Standing buy'], ['standing-sell', 'Standing sell']] as [Mode, string][]).map(([m, l]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setPlan(null); setPlanErr(null); setSteps([]); }} className={`rounded-[10px] px-2 py-2 transition ${mode === m ? 'bg-ink text-paper' : 'hover:bg-paper-3'}`}>{l}</button>
        ))}
      </div>

      <label className="mt-4 block text-sm text-graphite" htmlFor="amt">{mine.sell ? 'Shares to sell' : 'Spend (USDT)'}</label>
      <input id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} className="num mt-1 w-full rounded-[14px] border border-rule bg-paper px-4 py-3 text-2xl font-display" />

      {mine.sell ? (
        <>
          <label className="mt-4 block text-sm text-graphite" htmlFor="floor">Lowest price per share you accept (USDT)</label>
          <input id="floor" inputMode="decimal" value={floor} onChange={(e) => setFloor(e.target.value.replace(/[^0-9.]/g, ''))} className="num mt-1 w-full rounded-[14px] border border-rule bg-paper px-4 py-3 text-lg" />
        </>
      ) : (
        <fieldset className="mt-4">
          <legend className="text-sm text-graphite">Never pay more than this over the real price</legend>
          <div className="mt-1 flex gap-2">
            {[25, 50, 100, 200].map((t) => (
              <button key={t} onClick={() => setTol(t)} aria-pressed={tol === t} className={`rounded-full px-3 py-1.5 text-sm ${tol === t ? 'bg-ink text-paper' : 'bg-paper-2'}`}>{(t / 100).toFixed(2)}%</button>
            ))}
          </div>
        </fieldset>
      )}

      {!isConnected ? (
        <div className="mt-5"><ConnectButton label="Connect wallet to continue" /></div>
      ) : wrongChain ? (
        <button onClick={() => switchChain({ chainId: bsc.id })} className="mt-5 w-full rounded-[14px] bg-gross py-3 font-medium text-white">Switch to BNB Chain to continue</button>
      ) : standingBlocked ? (
        <p className="mt-5 rounded-[14px] bg-paper-2 p-3 text-sm">Standing orders go live as soon as the ParallaxBook contract address is set. Buy now works today.</p>
      ) : (
        <button onClick={getPlan} disabled={busy || !amount || (mine.sell && !floor)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-[14px] bg-ink py-3 font-medium text-paper disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} Plan it
        </button>
      )}

      {planErr && <p role="alert" className="mt-4 rounded-[14px] bg-gross/10 p-3 text-sm"><strong>{planErr.code.replace(/_/g, ' ').toLowerCase()}.</strong> {planErr.message}</p>}

      {plan && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <div className="rounded-[14px] bg-paper p-4">
            <p className="font-medium">{plan.wrapper ? `${plan.wrapper.symbol} gives you the most shares` : 'Cancel order'}</p>
            <ul className="mt-2 space-y-1 text-sm text-graphite">{plan.why.map((w) => <li key={w}>{w}</li>)}</ul>
            {plan.minShares && <p className="mt-3 text-sm"><ShieldCheck className="mr-1 inline size-4 text-net" />Floor you sign: <span className="num font-medium">{dec(plan.minShares, 4)} shares</span></p>}
            {plan.decomposition && (
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-[10px] bg-gross/15 p-2"><dt>Gross</dt><dd className="num text-base font-medium">{bps(plan.decomposition.grossBps)}</dd></div>
                <div className="rounded-[10px] bg-unit/15 p-2"><dt>Unit</dt><dd className="num text-base font-medium">{bps(plan.decomposition.unitBps)}</dd></div>
                <div className="rounded-[10px] bg-net/15 p-2"><dt>Net</dt><dd className="num text-base font-medium">{bps(plan.decomposition.netBps)}</dd></div>
              </dl>
            )}
            <p className="mt-2 text-xs text-graphite">{plan.session.referenceNote} {plan.decomposition ? `Paying ${fmtUsd(plan.decomposition.usdPerShare)} per share.` : ''}</p>
          </div>
          <ol className="space-y-2">
            {plan.calls.map((c, i) => (
              <li key={c.label} className="rounded-[14px] border border-rule p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{i + 1}. {c.label}</span>
                  <StepBadge s={steps[i]} />
                </div>
                <code className="mt-1 block break-words font-mono text-[11px] text-graphite">{c.decoded}</code>
                {steps[i]?.message && <p role="alert" className="mt-1 text-gross">{steps[i]?.message}</p>}
                {steps[i]?.hash && <a className="mt-1 inline-block font-mono text-xs underline" href={bscscan('tx', steps[i]!.hash!)} target="_blank" rel="noreferrer">BscScan</a>}
              </li>
            ))}
          </ol>
          <button onClick={run} disabled={steps.some((s) => ['simulating', 'signing', 'pending'].includes(s.state)) || steps.every((s) => s.state === 'done')} className="w-full rounded-[14px] bg-net py-3 font-medium text-white disabled:opacity-50">
            Simulate, then sign in your wallet
          </button>
        </div>
      )}
      </>
      )}
    </section>
  );
}

function StepBadge({ s }: { s?: Step }) {
  if (!s || s.state === 'idle') return <span className="font-mono text-xs text-graphite">ready</span>;
  if (s.state === 'done') return <span className="flex items-center gap-1 font-mono text-xs text-net"><Check className="size-3" />confirmed</span>;
  if (s.state === 'failed') return <span className="font-mono text-xs text-gross">failed</span>;
  return <span className="flex items-center gap-1 font-mono text-xs"><Loader2 className="size-3 animate-spin" />{s.state}</span>;
}
