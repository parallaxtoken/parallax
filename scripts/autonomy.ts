// Autonomy proof (7.6): generates data/autonomy/summary.json from the placement record, the keeper journal,
// the verifier outputs and chain reads. Nothing here is typed: every field is read from a file or the chain.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { nyseSessionAt } from '@parallax/kernel';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { pub, BOOK } from './mainnet/lib';

const archive = createPublicClient({ chain: bsc, transport: http((process.env.BSC_ARCHIVE_RPC_URL ?? '').split(/\s+#/)[0]!.trim() || undefined) });

interface J { t: string; orderId: string; status: string; decision: string; reasons: string[]; txHash?: string; simSource?: string; simResult?: string; sharesWad?: string; venue?: string }
const place = JSON.parse(readFileSync('data/autonomy/placement.json', 'utf8')) as { placedAt: string; orders: Record<string, string>; ownerNonceAfterPlacing: number };
const ref = existsSync('evidence/mainnet/refusal_and_cancel.json') ? (JSON.parse(readFileSync('evidence/mainnet/refusal_and_cancel.json', 'utf8')) as Record<string, string>) : null;
const journal = readFileSync('data/keeper/journal.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as J);

// the autonomy run is the three orders placed together in placement.json; later orders (UI journey) are separate evidence
const runIds = new Set(Array.from({ length: Number((JSON.parse(readFileSync('data/autonomy/placement.json', 'utf8')) as { nextId: string }).nextId) }, (_, i) => String(i)));
const confirmed = journal.filter((e) => e.status === 'CONFIRMED' && e.txHash && runIds.has(e.orderId));
const fills = [];
const USER = process.env.USER_ADDRESS as `0x${string}`;
for (const e of confirmed) {
  const rc = await pub.getTransactionReceipt({ hash: e.txHash as `0x${string}` });
  const blk = await pub.getBlock({ blockNumber: rc.blockNumber });
  const ts = Number(blk.timestamp) * 1000;
  const receiptTx = await pub.getTransaction({ hash: e.txHash as `0x${string}` });
  fills.push({
    orderId: e.orderId, txHash: e.txHash, block: rc.blockNumber.toString(), at: new Date(ts).toISOString(), nySession: nyseSessionAt(ts),
    sentBy: receiptTx.from, sentByKeeper: receiptTx.from.toLowerCase() === (process.env.KEEPER_ADDRESS ?? '').toLowerCase(), ownerSigned: receiptTx.from.toLowerCase() === USER.toLowerCase(),
    simSource: e.simSource ?? null, simResult: e.simResult ?? null, venue: e.venue ?? null, sharesWad: e.sharesWad ?? null,
  });
}
const placedAtMs = Date.parse(place.placedAt);
const firstFill = fills.map((f) => Date.parse(f.at)).sort((a, b) => a - b)[0];
const refusalsAll = journal.filter((e) => ['WAIT', 'SKIP', 'REFUSED'].includes(e.status));
const seen = new Set<string>();
const refusals = refusalsAll.filter((e) => { const k = `${e.orderId}:${e.reasons.join(',')}`; if (seen.has(k)) return false; seen.add(k); return true; }).map((e) => ({ t: e.t, orderId: e.orderId, reasons: e.reasons }));

// owner absence: the owner nonce at the fill blocks equals the nonce after placing (no owner transaction in between)
const nonceAtFill: Record<string, number | null> = {};
for (const f of fills) {
  try {
    nonceAtFill[f.block] = await archive.getTransactionCount({ address: USER, blockNumber: BigInt(f.block) });
  } catch {
    nonceAtFill[f.block] = null;
  }
}

// replay arm: an app-side guard needs a live signature for every fill; count fills that required one, and the
// recorded quotes each approach would have stopped (3% off-chain guard vs the 5% broken-quote threshold)
const rec = readFileSync('data/discovery/e4_session_basis.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { rows: { ticker: string; issuer: string; stockPrice: string | null; unit: string | null; tokensOut: string | null; quoteUsd: number }[] });
const refPx: Record<string, number> = {};
let over3 = 0, over5 = 0, quotesSeen = 0;
for (const r of rec) {
  for (const x of r.rows) if (x.issuer === 'ONDO' && x.stockPrice) refPx[x.ticker] = Number(x.stockPrice);
  for (const x of r.rows) {
    if (!x.tokensOut || !x.unit || !refPx[x.ticker]) continue;
    const unit = x.issuer === 'XSTOCKS' ? 1 : Number(BigInt(x.unit)) / 1e18;
    const shares = (Number(BigInt(x.tokensOut)) / 1e18) * unit;
    if (shares <= 0) continue;
    quotesSeen++;
    const dev = Math.abs(x.quoteUsd / shares / refPx[x.ticker]! - 1);
    if (dev > 0.03) over3++;
    if (dev > 0.05) over5++;
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  book: BOOK,
  ordersPlaced: Object.keys(place.orders).length,
  placedAt: place.placedAt,
  ownerNonceAfterPlacing: place.ownerNonceAfterPlacing,
  fills: fills.length,
  ownerOfflineFills: fills.filter((f) => f.sentByKeeper && !f.ownerSigned).length,
  fillsWhileNewYorkClosed: fills.filter((f) => ['CLOSED_WEEKEND', 'CLOSED_HOLIDAY', 'OVERNIGHT'].includes(f.nySession)).length,
  firstFillSecondsAfterPlacing: firstFill ? Math.round((firstFill - placedAtMs) / 1000) : null,
  ownerNonceAtFillBlocks: nonceAtFill,
  refusalsLogged: refusals.length,
  refusalPassesLogged: refusalsAll.length,
  onChainRefusal: ref ? { orderId: ref.refusalOrderId, revertTx: ref.manualFillRevertTx, impossibleFloorWad: ref.impossibleFloorWad, quotedSharesWad: ref.quotedSharesWad } : null,
  cancel: ref ? { orderId: ref.cancelOrderId, tx: ref.cancelTx } : null,
  fillDetails: fills,
  refusals,
  replayArm: {
    guard: 'off-chain guard, 3 percent over reference, requires a live owner signature for every fill',
    fillsThatRequiredAnOwnerSignature: fills.length,
    quotesReplayed: quotesSeen,
    quotesOver3Pct: over3,
    quotesOver5Pct: over5,
    note: 'Both approaches stop the same broken quotes above their thresholds. The on-chain floor additionally holds while nobody is watching; the replay does not show it catches more bad quotes.',
  },
};
mkdirSync('data/autonomy', { recursive: true });
writeFileSync('data/autonomy/summary.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ fills: out.fills, offline: out.ownerOfflineFills, closed: out.fillsWhileNewYorkClosed, firstFillSec: out.firstFillSecondsAfterPlacing, refusals: out.refusalsLogged, nonces: nonceAtFill }));
