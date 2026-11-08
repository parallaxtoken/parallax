// Self-funding loop, x402 leg: buy a few cents of the facilitator payment token with the owner wallet through the
// Trading API, then call the paid certificate endpoint, sign the EIP-3009 authorisation and let B402 settle it.
// payTo is the address configured at onboarding (the owner test wallet), so this proves the loop, not revenue.
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { encodeFunctionData, parseAbi, type Hex } from 'viem';
import { SignedClient } from '@parallax/binance';
import { acct, pub, send, wallet, USDT, erc20 } from './lib';

const U = '0xcE24439F2D9C6a2289F741120FE202248B666666' as const;
const ORIGIN = process.env.PUBLIC_WEB_ORIGIN!;
const owner = acct('USER');
const w = wallet(owner);
const uAbi = parseAbi(['function balanceOf(address) view returns (uint256)']);

const have = await pub.readContract({ address: U, abi: uAbi, functionName: 'balanceOf', args: [owner.address] });
if (have < 2n * 10n ** 16n) {
  const client = new SignedClient({ apiKey: process.env.BINANCE_WEB3_API_KEY!, secretKey: process.env.BINANCE_WEB3_SECRET_KEY! });
  const amountRaw = (5n * 10n ** 16n).toString(); // 0.05 USDT
  const q = await client.quote({ from: USDT, to: U, amountRaw, taker: owner.address });
  if (!q.ok || !q.data[0]) throw new Error('no quote for the payment token');
  const r = q.data[0];
  const s = await client.swap({ quoteId: r.quoteId, from: USDT, to: U, amountRaw, taker: owner.address, slippagePercent: '1' });
  if (!s.ok) throw new Error('swap build failed');
  await send(w, { address: USDT, abi: erc20, functionName: 'approve', args: [s.data.to as Hex, BigInt(amountRaw)] }, 'approve USDT for the router');
  const est = await pub.estimateGas({ account: owner.address, to: s.data.to as Hex, data: s.data.data as Hex, value: BigInt(s.data.value || '0') });
  const hash = await w.sendTransaction({ to: s.data.to as Hex, data: s.data.data as Hex, value: BigInt(s.data.value || '0'), gas: (est * 13n) / 10n });
  console.log('buy payment token', (await pub.waitForTransactionReceipt({ hash })).status, hash);
}

// 1. ask for the requirements
const first = await fetch(`${ORIGIN}/api/certificate?ticker=NVDA`);
console.log('first call', first.status);
const body = (await first.json()) as { accepts?: { scheme: string; network: string; amount: string; asset: Hex; payTo: Hex; maxTimeoutSeconds: number; extra: { name: string; version: string } }[]; error?: string };
const req = body.accepts?.[0];
if (first.status !== 402 || !req) throw new Error(`expected 402 with requirements, got ${first.status} ${JSON.stringify(body).slice(0, 300)}`);

// 2. sign the EIP-3009 TransferWithAuthorization
const now = Math.floor(Date.now() / 1000);
const authorization = { from: owner.address, to: req.payTo, value: BigInt(req.amount), validAfter: BigInt(now - 60), validBefore: BigInt(now + req.maxTimeoutSeconds), nonce: `0x${randomBytes(32).toString('hex')}` as Hex };
const signature = await owner.signTypedData!({
  domain: { name: req.extra.name, version: req.extra.version, chainId: 56, verifyingContract: req.asset },
  types: { TransferWithAuthorization: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
  ] },
  primaryType: 'TransferWithAuthorization',
  message: authorization,
});
const payload = {
  x402Version: 2,
  resource: { url: `${ORIGIN}/api/certificate?ticker=NVDA`, description: 'Parallax certificate', mimeType: 'application/json' },
  accepted: req,
  payload: { signature, authorization: { from: authorization.from, to: authorization.to, value: authorization.value.toString(), validAfter: authorization.validAfter.toString(), validBefore: authorization.validBefore.toString(), nonce: authorization.nonce } },
};
const header = Buffer.from(JSON.stringify(payload)).toString('base64');

// 3. pay and receive
const paid = await fetch(`${ORIGIN}/api/certificate?ticker=NVDA`, { headers: { 'X-PAYMENT': header } });
const out = await paid.json();
console.log('paid call', paid.status, JSON.stringify(out).slice(0, 600));
writeFileSync('evidence/mainnet/paid_certificate.json', JSON.stringify({ at: new Date().toISOString(), http: paid.status, requirements: req, response: out }, null, 2));
void encodeFunctionData;
