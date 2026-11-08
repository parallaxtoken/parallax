// BNB Agent Studio, identity: registers the keeper under ERC-8004 on BSC mainnet with the SDK, then writes the
// agent id to .env.local and evidence/mainnet/identity.json. Idempotent: it stops if an id is already recorded.
import { readFileSync, writeFileSync } from 'node:fs';
import '../../../scripts/mainnet/lib';
import { EVMWalletProvider } from '@bnbagent/sdk';
import { AgentEndpoint, ERC8004Agent } from '@bnbagent/sdk/erc8004';

const origin = process.env.PUBLIC_WEB_ORIGIN?.replace(/\/$/, '');
if (process.env.KEEPER_AGENT_ID) {
  console.log(`already registered: agent #${process.env.KEEPER_AGENT_ID}`);
  process.exit(0);
}

const wallet = new EVMWalletProvider({ password: process.env.WALLET_PASSWORD!, privateKey: process.env.KEEPER_PRIVATE_KEY });
const agent = await ERC8004Agent.create({ walletProvider: wallet, network: 'bsc-mainnet' });

const endpoints = origin ? [AgentEndpoint.a2a(origin), AgentEndpoint.mcp(`${origin}/api/mcp`)] : [];
const uri = agent.generateAgentUri({
  name: 'Parallax keeper',
  description: 'Keeper for Parallax standing orders on tokenized stocks. It fills share-denominated orders from the wrapper that delivers the most shares; the ParallaxBook contract refuses any fill below the signed floor. Sells signed decompositions per call.',
  endpoints,
  supportedTrust: ['reputation'],
});

const res = await agent.registerAgent(uri);
console.log('registered', JSON.stringify(res, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
const id = String(res.agentId);
let env = readFileSync('.env.local', 'utf8');
env = env.replace(/^KEEPER_AGENT_ID=.*$/m, `KEEPER_AGENT_ID=${id}`);
writeFileSync('.env.local', env);
writeFileSync('evidence/mainnet/identity.json', JSON.stringify({ standard: 'ERC-8004', chainId: 56, registry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', agentId: id, owner: process.env.KEEPER_ADDRESS, txHash: (res as { transactionHash?: string }).transactionHash ?? null, endpoints: endpoints.map((e) => e.endpoint), registeredAt: new Date().toISOString() }, null, 2));
