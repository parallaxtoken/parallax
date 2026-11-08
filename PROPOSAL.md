# Stellar Community Fund (SCF) Tier-2 Proposal: Parallax

**Project Title:** Parallax — Share-Equivalence Standing Orders & Wrapper Registry for Tokenized Equities on Stellar Soroban  
**Applicant:** `warlock-netizen`  
**Funding Ask:** \$50,000 USD (SCF Tier-2 Open Grant)  
**Target Networks:** Stellar Testnet & Stellar Mainnet  
**Target Assets:** Native Circle USDC (SAC), Franklin Templeton BENJI (FOBXX), Backed Finance Tokens (`bNVDA`, `bAAPL`, `bTSLA`, `bSPY`), Ondo Finance  

---

## 1. Executive Summary

Tokenized equities on public blockchains present a hidden hazard to everyday investors: **1 token is almost never equal to 1 equity share**. Due to stock splits, dividend rebasing, and wrapper management fees, the real equity backing behind tokenized stocks fluctuates continuously. Standard limit orders signed in raw tokens leave savers exposed to severe under-delivery when corporate actions occur.

**Parallax solves this on Stellar Soroban:**
1. Investors sign standing limit orders in **real equity shares**, not raw token quantities.
2. The Stellar Soroban contract (`ParallaxBook.wasm`) queries the live on-chain share multiplier in the exact transaction of execution from `WrapperRegistry.wasm`.
3. If the shares delivered fail to meet the user's signed share floor ($\text{tokens} \times \text{multiplier} < \text{floor}$), the transaction atomically reverts.
4. Non-custodial 24/7 execution via an autonomous Keeper bot that monitors SDEX, Soroswap, and Phoenix AMM liquidity.

---

## 2. Itemized Budget Buckets (SCF Tier-2: $50,000 Total Ask)

| Budget Bucket | Allocation | Description & Justification |
|---|:---:|---|
| **1. Soroban Smart Contract Security Audit & Formal Verification** | \$18,000 | Professional third-party security audit of `ParallaxBook.wasm` and `WrapperRegistry.wasm`, invariant fuzz testing, and formal verification of `WAD` (18-decimal) to `STROOP` (7-decimal) conversions. |
| **2. Stellar Anchor & SEP-38 / SEP-24 Liquidity Integration** | \$14,000 | Implementation and production testing of SEP-38 (Anchor RFQ Quotes) and SEP-24 (Deposit/Withdraw) rails to bridge institutional and retail stock liquidity onto Stellar. |
| **3. High-Availability Keeper & Relayer Infrastructure** | \$10,000 | Deployment of geographically distributed keeper daemon nodes (Singapore, EU, US) with sub-second Soroban RPC failover, SQLite journal mirroring, and automated ledger alert bots. |
| **4. Developer Tooling, TypeScript SDK, & Community Education** | \$8,000 | Documentation, interactive web visualizer, open-source `@parallax/stellar-sdk` for automated trading agents, and step-by-step developer integration guides. |
| **Total Grant Ask** | **\$50,000** | **Fully itemized milestone-based disbursement** |

---

## 3. Milestones, Deliverables, & Acceptance Criteria

### Milestone 1: Soroban Testnet Core Orderbook & Multiplier Registry (Month 1)
- **Deliverables:**
  - Release candidate of `ParallaxBook.wasm` and `WrapperRegistry.wasm` compiled and deployed to Stellar Testnet.
  - Test suite with >95% code coverage verifying invariant T2 (Share Floor Revert) and invariant T8 (Fill Exactly Once).
  - TypeScript SDK package `@parallax/stellar-sdk` published and documented.
- **Acceptance Criteria:**
  - Public contract IDs committed on Stellar Testnet.
  - Automated tests passing in GitHub Actions CI with live RPC simulation.

### Milestone 2: Web Application Freighter Integration & SEP-38 Bridge (Month 2)
- **Deliverables:**
  - Integration of `@stellar/freighter-api` and `@stellar/stellar-sdk` in the Parallax web interface.
  - Real-time SEP-38 RFQ integration providing live pricing between Stellar USDC and registered equity wrappers.
  - Offline deterministic verifier (`/verify`) recomputing Stellar Soroban fill events directly from Horizon ledger logs.
- **Acceptance Criteria:**
  - Live hosted web application supporting Freighter wallet order placement on Stellar Testnet.
  - Verifier successfully validating testnet transaction hashes without external APIs.

### Milestone 3: Mainnet Deployment, Audit Sign-Off, & Asset Expansion (Month 3)
- **Deliverables:**
  - Publication of the completed third-party security audit report.
  - Mainnet deployment of `ParallaxBook` and `WrapperRegistry` on the Stellar public network.
  - Keeper bot active on mainnet monitoring SDEX and Soroban AMM liquidity pools.
- **Acceptance Criteria:**
  - Mainnet contract addresses published and source-verified on Stellar Expert.
  - Successful non-custodial fill of a live mainnet order with zero escrow and deterministic invariant satisfaction.

---

## 4. Maintenance Fix-Log & Regression Invariants

Parallax enforces a strict regression harness to guarantee that every bug fix or feature addition preserves core protocol invariants:

| Invariant | Description | Verification Method |
|---|---|---|
| **T1: Non-Custodial Residual** | The contract holds zero tokens or USDC between transactions. | Soroban storage assertion: contract balance is 0 at end of tx. |
| **T2: Share Floor Guarantee** | Fills never deliver fewer shares than `order.min_shares`. | Contract panics with `ShareFloor` if output < limit. |
| **T3: Multiplier Authority** | The keeper cannot pass an arbitrary multiplier; it is read on-chain. | Registry queries issuer's verified unit source directly. |
| **T4: Pause Fail-Safe** | Corporate actions or issuer pauses trigger atomic rejection. | Registry returns `is_paused = true`; order execution halts. |
| **T8: Exactly-Once Fill** | An order cannot be double-filled or replayed. | Order status transitions `Open -> Filled`; subsequent calls panic. |
| **T10: Offline Verifiability** | Any third party can verify a fill without proprietary APIs. | `/verify` recomputes share delivery from ledger state and events. |

---

## 5. Team & Commitment

- **Lead Architect & Maintainer:** `warlock-netizen`
- **Codebase:** 100% open-source under MIT License.
- **Repository:** [https://github.com/warlock-netizen/parallax](https://github.com/warlock-netizen/parallax)
