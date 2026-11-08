// Places one proposed standing order for the owner wallet: asks the live planner for the exact calls, then signs
// them with the owner test key and waits for each receipt. Usage: tsx place_proposed.ts 1
import './lib';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';

const SPECS: Record<string, { body: Record<string, unknown>; deadline: string }> = {
  '1': { body: { intent: 'standing-buy', ticker: 'NVDA', usd: '0.05', toleranceBps: 25, issuers: ['BSTOCKS'] }, deadline: '2026-10-12T23:59:00Z' },
};
const which = process.argv[2] ?? '1';
const spec = SPECS[which];
if (!spec) throw new Error(`no spec ${which}`);

const origin = process.env.PUBLIC_WEB_ORIGIN ?? 'https://parallax.network';
const account = privateKeyToAccount(process.env.USER_PRIVATE_KEY as Hex);
const hours = Math.max(1, Math.round((Date.parse(spec.deadline) - Date.now()) / 3_600_000));
const r = await fetch(`${origin}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...spec.body, owner: account.address, deadlineHours: hours }) });
const plan = (await r.json()) as { ok: boolean; message?: string; calls?: { label: string; to: Hex; data: Hex; decoded: string }[]; minShares?: string; reference?: unknown };
if (!plan.ok || !plan.calls) throw new Error(`planner refused: ${plan.message}`);
console.log('reference', JSON.stringify(plan.reference), 'minShares', plan.minShares);

const chain = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL) });
const wallet = createWalletClient({ account, chain: bsc, transport: http(process.env.BSC_RPC_URL) });
const hashes: Record<string, string> = {};
for (const c of plan.calls) {
  const gas = await chain.estimateGas({ account: account.address, to: c.to, data: c.data });
  const hash = await wallet.sendTransaction({ to: c.to, data: c.data, value: 0n, gas: (gas * 125n) / 100n });
  const rc = await chain.waitForTransactionReceipt({ hash, timeout: 120_000 });
  console.log(c.label, rc.status, hash);
  if (rc.status !== 'success') throw new Error(`${c.label} reverted`);
  hashes[c.label] = hash;
}
console.log(JSON.stringify({ spec: which, deadline: spec.deadline, hours, hashes }, null, 2));
