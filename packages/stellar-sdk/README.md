# @parallax/stellar-sdk

Official TypeScript Developer SDK for **Parallax** on Stellar.

Parallax is a decentralized share-equivalence standing limit order protocol deployed on Stellar Soroban for tokenized equities (NVDA, AAPL, TSLA, BENJI) with Binance price pegging, Stellar SEP compliance (SEP-1, SEP-10, SEP-24, SEP-38), and automated keeper settlement.

---

## Features

- **Typed Soroban RPC Bindings**: Full TypeScript clients for `ParallaxBook` and `WrapperRegistry`.
- **ScVal Serialization Utilities**: Seamless bidirectional conversion between native TypeScript models (`Order`, `Wrapper`, `FillArgs`) and Soroban XDR `ScVal`.
- **SEP-10 WebAuth Utilities**: Request challenges, inspect timebounds/nonces, sign via Freighter wallet or secret key, and authenticate bearer JWTs.
- **SEP-38 Anchor RFQ & Peg Engine**: Price discovery, firm binding RFQ quotes, and secondary market Binance spot peg divergence evaluation against a 250 bps threshold with automated ShareFloor checks.
- **Zero Heavy Native Dependencies**: Pure TypeScript compiled to modern ESM with complete type declarations (`.d.ts`).

---

## Installation

```bash
pnpm add @parallax/stellar-sdk
# or
npm install @parallax/stellar-sdk
```

---

## Quickstart

### 1. Interacting with `ParallaxBook`

```typescript
import { ParallaxBookClient, STELLAR_TESTNET_PASSPHRASE } from '@parallax/stellar-sdk';

const book = new ParallaxBookClient({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
});

// Check if book is paused
const paused = await book.isPaused();
console.log('Book paused:', paused);

// Query an open standing order
const order = await book.getOrder(101n);
console.log(`Order #${order.id}: ${order.tickerId} amount=${order.amount} limit=${order.limit}`);

// Build an un-signed transaction to place a buy order
const tx = await book.buildPlaceBuyTx({
  sourceAccount: 'GAKGBUCRSX6MVYBXBDWPHFXC2Y53QXK2GCVLEA77ETKGE4LN7XXXRWTF',
  ticker: 'NVDA',
  payAmountUsdcStroops: 145_0000000n, // 145 USDC (7 decimals)
  minSharesWad: 1_000000000000000000n, // 1.0 real share (18 decimals)
  deadlineSeconds: Math.floor(Date.now() / 1000) + 86400,
});
```

### 2. Querying `WrapperRegistry`

```typescript
import { WrapperRegistryClient } from '@parallax/stellar-sdk';

const registry = new WrapperRegistryClient();

// Query number of registered wrappers for Apple
const count = await registry.getWrapperCount('AAPL');

// Query wrapper at index 0
const wrapper = await registry.getWrapperAt('AAPL', 0);
console.log(`AAPL wrapper token: ${wrapper.token}, active: ${wrapper.active}`);

// Query real-time unit multiplier in 18-decimal fixed point WAD
const unit = await registry.getSharesPerToken(wrapper.token);
console.log(`Shares per token: ${unit} (1.0 = 10^18)`);
```

### 3. SEP-10 WebAuth Flow

```typescript
import { Sep10Client } from '@parallax/stellar-sdk';

const sep10 = new Sep10Client({
  webAuthEndpoint: 'https://auth.parallax.finance/auth',
  serverSigningKey: 'GDGQD7FOHX...SERVER_KEY',
});

// End-to-end programmatic authentication (for automated keepers / bots)
const jwt = await sep10.authenticateWithSecret('SBHYTZBNY7...SECRET_KEY');

// Verify claims and expiration
const claims = sep10.verifyJwt(jwt);
console.log(`Authenticated as ${claims.sub}, expires at ${claims.exp}`);
```

### 4. SEP-38 Quotes & Secondary Market Binance Peg Analysis

```typescript
import { Sep38Client } from '@parallax/stellar-sdk';

const sep38 = new Sep38Client({ quoteServer: 'https://quotes.parallax.finance' });

// Evaluate Binance spot reference price against Stellar DEX price
const quote = await sep38.fetchPeggedQuote({
  ticker: 'NVDA',
  sellAmountUsdc: '145.00',
  binanceRefPriceUsd: 145.20,
});

console.log(`Divergence: ${quote.pegDivergenceBps} bps, Pegged: ${quote.isPegged}`);
console.log(`Action: ${quote.action}, Estimated Shares: ${quote.estimatedSharesWad}`);
```

---

## Testnet Contract Addresses

| Component | Contract Address |
|-----------|------------------|
| **ParallaxBook** | `CBM3NZ46TSRLH4W7TF2OWA2GVK4XJYZRVGLTXODUBVVPQEN6SX5M432W` |
| **WrapperRegistry** | `CAKOH4URENBVDAXAFSIPVSDDRFJTEHKMA77BRCH6B7WMOIOVF5ES2LFU` |
| **Circle USDC SAC** | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| **bNVDA (Backed)** | `CBG4XKLKV4TPIBCVR5HM4HZG3CSNJPQ3EEYNAXRYJKAXKKP2PYCDOTNG` |
| **bAAPL (Backed)** | `CDYYFXXT4RNVQHIFR3FVUSFSWPFPAUYEI7GVBQHGDVJKVMFL3YLLQHTE` |
| **bTSLA (Backed)** | `CDBPE4Q4RSBQWXYPFAECE5AANQ3BOARNALARQ7CXDS2OYROATR2WLJNO` |
| **BENJI (Franklin Templeton)** | `CDMWXGFCNMAH2YADWNH2RW5EYK2F72YBFA2U4JKN6QCSUQ34GCQP7MQE` |

---

## Exports

- `@parallax/stellar-sdk` — Main entrypoint
- `@parallax/stellar-sdk/contracts` — Contract clients and ScVal serializers
- `@parallax/stellar-sdk/sep` — SEP-10 & SEP-38 clients
- `@parallax/stellar-sdk/types` — TypeScript interfaces and enums
- `@parallax/stellar-sdk/constants` — Deployed addresses, network passphrases, and math constants

---

## License

MIT © Parallax Protocol
