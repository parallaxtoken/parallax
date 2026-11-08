// Proposes, without placing anything, a set of tiny standing orders with deadlines spread across 12 to 23 Oct 2026.
// It asks the live planner for the exact calls and writes docs/PROPOSED_ORDERS.md for the owner to approve.
import { writeFileSync } from 'node:fs';
import './mainnet/lib';

const ORIGIN = process.env.PUBLIC_WEB_ORIGIN ?? 'https://parallax.network';
const OWNER = process.env.USER_ADDRESS as string;

interface Spec { n: number; label: string; body: Record<string, unknown>; deadline: string; designed: string }
const at = (iso: string) => Math.max(1, Math.round((Date.parse(iso) - Date.now()) / 3_600_000));

const specs: Spec[] = [
  { n: 1, label: 'Buy NVDA, tight tolerance', deadline: '2026-10-12T23:59:00Z', designed: 'Fills at the Monday open if the net premium stays inside 0.25%.', body: { intent: 'standing-buy', ticker: 'NVDA', usd: '0.05', toleranceBps: 25, issuers: ['BSTOCKS'] } },
  { n: 2, label: 'Buy TSLA, normal tolerance', deadline: '2026-10-14T23:59:00Z', designed: 'Fills when TSLA has a contract route and a live reference.', body: { intent: 'standing-buy', ticker: 'TSLA', usd: '0.05', toleranceBps: 50, issuers: ['BSTOCKS'] } },
  { n: 3, label: 'Buy AAPL, wide tolerance', deadline: '2026-10-17T23:59:00Z', designed: 'Fills early in the week; the wide band keeps it patient. Restricted to bStocks because Ondo names need a 5 USD aggregator order.', body: { intent: 'standing-buy', ticker: 'AAPL', usd: '0.05', toleranceBps: 100, issuers: ['BSTOCKS'] } },
  { n: 4, label: 'Sell NVDA above the reference', deadline: '2026-10-19T23:59:00Z', designed: 'Sells 0.0002 NVDA shares only if each share fetches at least $240. Stays open until the price gets there or the deadline passes.', body: { intent: 'standing-sell', ticker: 'NVDA', shares: '0.0002', floorUsdPerShare: '240', issuers: ['BSTOCKS'] } },
  { n: 5, label: 'Buy MSFT with an unreachable floor (designed to refuse)', deadline: '2026-10-21T23:59:00Z', designed: 'Placed with a share floor of one whole share for five cents (encoded by scripts/mainnet/agentic_calls.ts, not by the planner, which would never produce it). The keeper must refuse with PREMIUM_ABOVE_LIMIT on every pass and the diary shows it. The calls below show the planner normal floor for comparison; only minShares changes.', body: { intent: 'standing-buy', ticker: 'MSFT', usd: '0.05', toleranceBps: 50 } },
  { n: 6, label: 'Sell NVDA at an impossible price (designed to refuse)', deadline: '2026-10-23T23:59:00Z', designed: 'A sell floor of $99,999 per share: the keeper refuses for the whole window and the order expires unfilled.', body: { intent: 'standing-sell', ticker: 'NVDA', shares: '0.0001', floorUsdPerShare: '99999', issuers: ['BSTOCKS'] } },
];

const out: string[] = [
  '# Proposed standing orders',
  '',
  'Status: PROPOSED. Nothing below has been placed. Total at risk if all buys fill: $0.15 of USDT, plus 0.0003 NVDA shares offered for sale.',
  `Owner wallet: ${OWNER.slice(0, 6)}...${OWNER.slice(-4)}. Deadlines are spread from 12 to 23 Oct 2026 (UTC).`,
  '',
  '| # | Order | Deadline (UTC) | Designed outcome |',
  '|---|---|---|---|',
];
const detail: string[] = [];
for (const s of specs) {
  const hours = at(s.deadline);
  const body = { ...s.body, owner: OWNER, deadlineHours: hours };
  let note = 'plan not fetched';
  let calls = '';
  try {
    const r = await fetch(`${ORIGIN}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
    const j = (await r.json()) as { ok: boolean; why?: string[]; calls?: { label: string; decoded: string }[]; minShares?: string | null; message?: string; wrapper?: { symbol: string } | null };
    if (j.ok) {
      note = `${j.wrapper?.symbol ?? 'n/a'}; ${j.why?.[0] ?? ''}`;
      calls = (j.calls ?? []).map((c) => `    - ${c.label}: \`${c.decoded}\``).join('\n');
    } else note = `planner says: ${j.message}`;
  } catch (e) {
    note = `planner unreachable: ${e instanceof Error ? e.message : String(e)}`;
  }
  out.push(`| ${s.n} | ${s.label} | ${s.deadline.slice(0, 16).replace('T', ' ')} | ${s.designed} |`);
  detail.push(`### ${s.n}. ${s.label}`, '', `- Deadline: ${s.deadline} (${hours} hours from now)`, `- Planner: ${note}`, calls ? `- Calls the owner would sign:\n${calls}` : '', '');
}
out.push('', '## Exact calls from the live planner', '', ...detail, '', 'Say which of these to place and I will place only those, through the web app journey or the Agentic Wallet as you prefer.', '');
writeFileSync('docs/PROPOSED_ORDERS.md', out.join('\n'));
console.log(out.join('\n'));
