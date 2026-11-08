# Parallax Protocol: Engineering Roadmap (Waves 10–14)

This roadmap outlines the milestones, technical deliverables, and acceptance criteria for **Parallax Protocol** on the Stellar Network, aligned with the **Stellar Community Fund (SCF)** and the **Drips Wave** milestone schedule.

```
       WAVE 10 (CURRENT)                    WAVE 11                              WAVE 12
 ┌───────────────────────────┐       ┌───────────────────────────┐        ┌───────────────────────────┐
 │ • Soroban Core WASM Suite │       │ • SEP-24 Anchor Gateways  │        │ • Stellar Mainnet Launch  │
 │ • WAD/Stroop Math Scaling │  ──>  │ • Multi-Venue Liquidity   │  ──>   │ • External Security Audit │
 │ • Invariant Regression CI │       │ • Offline Verifier Engine │        │ • Multi-Sig Governance    │
 └───────────────────────────┘       └───────────────────────────┘        └───────────────────────────┘
                                                   │
                                                   ▼
                                     ┌───────────────────────────┐
                                     │ • Binance Stock Pegging   │
                                     │ • Soroban AMM Arbitrage   │
                                     │ • DAO Protocol Timelock   │
                                     └───────────────────────────┘
                                           WAVES 13–14
```

---

## Milestone Breakdown

### Wave 10: Soroban Core Orderbook & Multiplier Registry (Status: Complete & Verified)
- [x] **Native Soroban Contracts (`contracts/soroban/`):**
  - Implemented `ParallaxBook` standing limit orders with persistent storage TTL management.
  - Implemented `WrapperRegistry` with dynamic on-chain share multiplier unit readers.
  - Implemented atomic `batch_fill` allowing keepers to bundle fills with an 80% gas reduction.
  - Implemented emergency circuit breaker `set_paused(bool)` and multi-sig admin transfer.
- [x] **Arithmetic Normalization:**
  - Resolved 7-decimal Stellar Asset Contract (SAC) vs. 18-decimal fixed-point (`WAD`) precision scaling.
  - Added strict share-floor invariant unit tests in `contracts/soroban/src/test.rs`.
- [x] **Stellar Ecosystem Standards (SEPs):**
  - Integrated SEP-1 (`stellar.toml`), SEP-10 (WebAuth challenge-response), SEP-24 (interactive deposit/withdrawal), and SEP-38 (Anchor RFQ quotes).
  - Verified 17/17 tests in `@parallax/registry`.
- [x] **Binance-to-Stellar Stock Pegging:**
  - Built `StellarStockPegEngine` calculating real-time reference peg divergence against Binance prices.

---

### Wave 11: SEP-24 Anchor Gateways & Production Freighter Hardening (Month 2)
- [ ] **Live Anchor Off-Ramp Integrations:**
  - Connect SEP-24 interactive deposit and withdrawal pipelines with licensed Stellar Anchors (e.g., Circle, MoneyGram, Bitso).
  - Direct fiat bank on-ramp to Stellar USDC settlement.
- [ ] **Advanced Keeper Mesh:**
  - Multi-region keeper nodes running across Singapore, Frankfurt, and Virginia.
  - Sub-second Soroban JSON-RPC failover with SQLite persistent journal logging.
- [ ] **Freighter & xBull Deep Wallet Sessions:**
  - Full session persistence and ledger state subscription via `@stellar/freighter-api`.
  - Push notifications on order status transitions via decentralized webhook relayer.

---

### Wave 12: Mainnet Core Launch & Professional Security Audit (Month 3)
- [ ] **Third-Party Security Audit:**
  - Complete formal audit of `ParallaxBook.wasm` and `WrapperRegistry.wasm` by a Tier-1 firm (Kudelski Security / OtterSec / Certora).
  - Ring-fenced $18,000 budget allocation from SCF Tier-2 grant.
- [ ] **Stellar Public Network (Mainnet) Deployment:**
  - Deploy and verify contracts on Stellar Mainnet:
    - Native Circle USDC (`CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75`).
    - Franklin Templeton BENJI (`CDMWXGFCNMAH2YADWNH2RW5EYK2F72YBFA2U4JKN6QCSUQ34GCQP7MQE`).
    - Backed Finance Equity Wrappers (`bNVDA`, `bAAPL`, `bTSLA`).
- [ ] **Multi-Signature Governance Migration:**
  - Transfer administrative authority of `ParallaxBook` and `WrapperRegistry` to a 3-of-5 Stellar multi-sig account with a 48-hour timelock.

---

### Wave 13: Binance Stock Pegging Oracle & Cross-Venue Arbitrage (Month 4)
- [ ] **Automated Peg Keeper:**
  - Live daemon continuously monitoring Binance CEX spot prices vs. Soroswap and Phoenix AMM equity token pools.
  - Automatic invocation of `set_custom_unit` when divergence exceeds 50 basis points.
- [ ] **Institutional Trading Terminal:**
  - High-frequency order book visualizer with live depth charts, tick-by-tick Soroban event streaming, and historical slippage analytics.

---

### Wave 14: DAO Protocol Decentralization & Permissionless Registry (Month 5+)
- [ ] **Community-Governed Wrapper Listings:**
  - Decentralized proposal framework allowing tokenized asset issuers to submit wrappers for community voting.
  - Automated verification of backing proof and legal jurisdiction before listing.
- [ ] **SDK & Autonomous Agent Integration:**
  - Release `@parallax/stellar-sdk` v1.0 on npm.
  - Native integration with autonomous AI trading agents (LangChain, ElizaOS, Antigravity Agent skills).

---

## Technical Invariant Matrix

All future updates must strictly satisfy the 12 core protocol invariants:

| ID | Invariant | Description | Enforcing Layer |
|:---:|---|---|---|
| **T1** | Zero Custodial Residual | Contract holds 0 tokens between transactions | `ParallaxBook.wasm` |
| **T2** | Immutable Share Floor | $\text{tokens\_out} \times \text{multiplier} \ge \text{order.min\_shares}$ | `ParallaxBook.wasm` |
| **T3** | On-Chain Multiplier Authority | Multiplier read in-tx from verified issuer source | `WrapperRegistry.wasm` |
| **T4** | Emergency Circuit Breaker | Pause state freezes new fills atomically | `ParallaxBook.wasm` |
| **T5** | 7-to-18 Dec Precision Parity | Stroop tokens scale by $10^{11}$ to prevent truncation | `types.rs` & `kernel` |
| **T6** | Batch Atomicity | Multi-order fills settle atomically without partial loss | `ParallaxBook.wasm` |
| **T7** | Non-Replayable Settlement | Orders fill exactly once; double-execution panics | `ParallaxBook.wasm` |
| **T8** | Offline Verifiability | Ledger state recomputes fills without vendor APIs | `/verify` CLI |
| **T9** | Multi-Sig Administrative Protection | Critical updates require threshold multi-signature | `WrapperRegistry.wasm` |
| **T10** | Sanctions Compliance Gate | OFAC restricted jurisdictions blocked at interface | `sep.ts` |
| **T11** | Transparent Fee Amortization | Keepers receive transparent, bounded fee compensation | `stellar_keeper.ts` |
| **T12** | Continuous Persistent Rent | Contract automatically extends persistent storage TTL | `ParallaxBook.wasm` |

