// BNB Agent Studio, commerce: one ERC-8183 certificate job on BSC mainnet, client = the owner test wallet,
// provider = the keeper. The deliverable is a decomposition of one ticker across all wrappers at a block.
// Price is zero (no U-token is held), so no tokens move; the escrow state machine is unchanged.
// Settlement waits the policy dispute window, so the script records the state it reached and stops there.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import '../../../scripts/mainnet/lib';
import { EVMWalletProvider } from '@bnbagent/sdk';
import { ERC8183Client, DeliverableManifest, SCHEMA_VERSION, JobStatus } from '@bnbagent/sdk/erc8183';
import { sharesFor, tokens, wadFromDecimal, wadToDecimal } from '@parallax/kernel';
import { USDT, directRoutes, makeClient, readUnit, wrappersFor } from '@parallax/registry';

const TICKER = (process.env.CERT_TICKER ?? 'NVDA').toUpperCase();
const chain = makeClient(process.env.BSC_RPC_URL);

async function certificate() {
  const block = await chain.getBlockNumber();
  const rows = [];
  for (const w of wrappersFor(TICKER)) {
    const u = await readUnit(chain, w, block).catch(() => null);
    const r = u ? (await directRoutes(chain, { tokenIn: USDT, tokenOut: w.token, amountIn: wadFromDecimal('50'), recipient: w.token, deadline: BigInt(Math.floor(Date.now() / 1000) + 300) }))[0] : undefined;
    rows.push({
      symbol: w.symbol, issuer: w.issuer, token: w.token, unitWad: u?.unit.toString() ?? null, paused: u?.paused ?? null,
      sharesFor50Usd: u && r ? wadToDecimal(sharesFor(tokens(r.amountOut), u.unit), 6) : null, venue: r?.venue ?? null,
    });
  }
  return { ticker: TICKER, block: block.toString(), asOf: new Date().toISOString(), quoteUsd: 50, wrappers: rows };
}

const keeper = new EVMWalletProvider({ password: process.env.WALLET_PASSWORD!, privateKey: process.env.KEEPER_PRIVATE_KEY });
const owner = new EVMWalletProvider({ password: process.env.WALLET_PASSWORD!, privateKey: process.env.USER_PRIVATE_KEY });
const client = await ERC8183Client.create({ walletProvider: owner, network: 'bsc-mainnet' });
const provider = await ERC8183Client.create({ walletProvider: keeper, network: 'bsc-mainnet' });

const cert = await certificate();
const certJson = JSON.stringify(cert);
const sha = createHash('sha256').update(certJson).digest('hex');

const window = await client.policy.disputeWindow();
const expiredAt = BigInt(Math.floor(Date.now() / 1000)) + window + 3600n;
const created = await client.createJob({ provider: process.env.KEEPER_ADDRESS!, expiredAt, description: `Parallax certificate: ${TICKER} decomposition across wrappers at block ${cert.block}` });
const jobId = created.jobId!;
console.log('createJob', jobId);
await client.registerJob(jobId);
await client.setBudget(jobId, 0n);
await client.fund(jobId, 0n);
console.log('funded (price 0)');

const manifest = new DeliverableManifest({
  version: SCHEMA_VERSION,
  jobId: Number(jobId),
  chainId: 56,
  contracts: { commerce: provider.commerce.address, router: provider.router.address, policy: provider.policy.address },
  response: { content: certJson, contentType: 'application/json' },
});
const url = `${process.env.PUBLIC_WEB_ORIGIN ?? ''}/evidence/mainnet/certificate_job_${jobId}.json`;
const submitted = await provider.submit(jobId, manifest.manifestHash(), { deliverable_url: url });
console.log('submitted', JSON.stringify(submitted, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));

const job = await client.getJob(jobId);
mkdirSync('evidence/mainnet', { recursive: true });
writeFileSync(`evidence/mainnet/certificate_job_${jobId}.json`, JSON.stringify({ certificate: cert, sha256: sha, manifestHash: manifest.manifestHash() }, null, 2));
writeFileSync('evidence/mainnet/erc8183_job.json', JSON.stringify({
  jobId: jobId.toString(), status: JobStatus[job.status], client: process.env.USER_ADDRESS, provider: process.env.KEEPER_ADDRESS, budget: '0',
  disputeWindowSec: window.toString(), expiredAt: expiredAt.toString(), manifestHash: manifest.manifestHash(), certificateSha256: sha,
  note: 'Settlement is permissionless after the dispute window; not claimed as completed until that transaction exists.', at: new Date().toISOString(),
}, null, 2));
console.log('status', JobStatus[job.status]);
