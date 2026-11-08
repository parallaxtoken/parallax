# Parallax E2E Test Infrastructure Specification

## 1. Executive Summary & Philosophy

Parallax is a decentralized share-equivalence standing limit order protocol deployed on Stellar Soroban for tokenized equities (NVDA, AAPL, TSLA, BENJI) with Binance price pegging and Stellar SEP compliance (SEP-1, SEP-10, SEP-24, SEP-38).

This specification establishes the **opaque-box, requirement-driven End-to-End (E2E) Test Suite** for Parallax. In accordance with test integrity guidelines:
- **Opaque-Box Principle**: Tests evaluate public contract interfaces, API endpoints, mathematical invariants, and observable system behaviors without coupling to internal module implementation details.
- **Requirement-Driven**: Every expected output is directly derived from authoritative specifications: `PROJECT.md`, `ORIGINAL_REQUEST.md`, Stellar Ecosystem Proposals (SEP-1, SEP-10, SEP-24, SEP-38), and formal mathematical identities.
- **Progressive Testability**: Verification exercises current and dependency-satisfied features systematically, isolating mock elimination and live testnet workflows.
- **Anti-Facade Integrity**: Tests exercise real calculations, cryptographic operations, state transitions, and boundary constraints; no dummy passes or hardcoded assertions.

---

## 2. 4-Tier Test Architecture

The E2E test suite is organized into four systematic tiers:

| Tier | Category | Description | Minimum Requirement | Actual Tests |
|---|---|---|---|---|
| **Tier 1** | **Feature Coverage** | Primary happy-path behavior and functional validation for every feature in scope. | $\ge 5$ tests per feature (F1–F18) | **90 tests** |
| **Tier 2** | **Boundary & Corner Cases** | Edge conditions, zero/max limits, overflow thresholds, off-by-one errors, and permission failures. | $\ge 5$ tests per feature (F1–F18) | **90 tests** |
| **Tier 3** | **Cross-Feature Combinations** | Multi-subsystem interactions between equities, price pegs, Soroban orders, and SEP protocols. | Cross-module flows | **20 tests** |
| **Tier 4** | **Real-World Scenarios** | End-to-end user workflows and lifecycles on Stellar testnet (onboarding, arbitrage, splits, flash crash). | Production-grade flows | **10 tests** |
| **Total** | | | **$\ge 200$ tests** | **210 tests** |

---

## 3. Feature Inventory & Coverage Matrix

Every feature from `PROJECT.md § Feature Inventory` is covered in both Tier 1 and Tier 2, plus synthesized across Tiers 3 and 4:

| Feature ID | Feature Name | Tier 1 Tests | Tier 2 Tests | Tier 3 / 4 Presence |
|---|---|---|---|---|
| **F1** | Contract Overflow Normalization | 5 | 5 | T3.01, T3.14, T4.02 |
| **F2** | Equity Token Catalog Completeness | 5 | 5 | T3.01, T3.09, T3.10, T4.05 |
| **F3** | Contract Negative & Invariant Tests | 5 | 5 | T3.01, T3.03, T3.08, T4.04 |
| **F4** | SEP-1 stellar.toml Hosting | 5 | 5 | T3.04, T4.01 |
| **F5** | SEP-10 Stellar WebAuth | 5 | 5 | T3.04, T3.05, T4.01 |
| **F6** | SEP-24 Interactive Deposit/Withdraw | 5 | 5 | T3.06, T3.07, T3.17, T4.01, T4.08 |
| **F7** | SEP-38 Anchor RFQ with Live Feeds | 5 | 5 | T3.02, T3.05, T3.06, T4.01 |
| **F8** | Live UI Surface Zero-Mock | 5 | 5 | T3.07, T3.16, T4.01 |
| **F9** | Live Order Book Queries | 5 | 5 | T3.08, T3.11, T3.12, T4.02 |
| **F10** | Automated Testnet Deployment | 5 | 5 | T3.15, T3.19, T4.09 |
| **F11** | Testnet Closed-Loop Script | 5 | 5 | T3.16, T4.01, T4.02 |
| **F12** | Keeper Binance Peg & BENJI Integration | 5 | 5 | T3.02, T3.03, T3.08, T3.09, T4.02, T4.04 |
| **F13** | Fix Claims Check CI Blocker | 5 | 5 | T3.13 |
| **F14** | Fix TypeScript Typecheck in Keeper | 5 | 5 | T3.09, T3.12 |
| **F15** | Generative Property-Based Tests | 5 | 5 | T3.14 |
| **F16** | Vitest Coverage Configuration | 5 | 5 | T3.13 |
| **F17** | Grant Proposal & Fix-Log | 5 | 5 | T3.13, T3.20 |
| **F18** | Architecture & Roadmap Sync | 5 | 5 | T3.20 |

---

## 4. Authoritative Ground Truth & Oracles

Expected test outputs are strictly derived from authoritative specifications and independent mathematical models:

1. **Soroban Fixed-Point Arithmetic (F1, F3)**:
   - STROOP = $10^7$ (7 decimals)
   - WAD = $10^{18}$ (18 decimals)
   - SCALE_STROOP_TO_WAD = $10^{11}$
   - Mathematical identity:
     $$\text{shares} = \frac{\text{tokens\_out} \times \text{unit}}{10^7}$$
   - Bound check: Fits in $i128$ for $\text{tokens\_out} < 1.7 \times 10^{20}$ STROOP ($\approx 17$ trillion tokens), preventing the $171$ token overflow panic of the legacy formula $(\text{tokens\_out} \times 10^{11} \times \text{unit}) / 10^{18}$.

2. **Stellar Ecosystem Proposals (F4, F5, F6, F7)**:
   - SEP-1: Spec-compliant TOML format, CORS `*`, version `2.0.0`, all 4 equities and USDC declared.
   - SEP-10: Cryptographic challenge transactions with `webAuthDomain`, client keypair signature verification, valid JWT structure (`sub`, `iss`, `iat`, `exp`).
   - SEP-24: Interactive URL generation (`/sep24/interactive`), transaction status state machine (`incomplete` $\to$ `pending_user_transfer_start` $\to$ `completed`).
   - SEP-38: Live reference feeds, pricing formulas without hardcoded `$145.20`, quote expiration.

3. **Binance Pegging & Divergence Math (F7, F12)**:
   - Divergence BPS:
     $$\Delta_{\text{bps}} = \left\lfloor \frac{|\text{stellar\_price} - \text{binance\_price}|}{\text{binance\_price}} \times 10,000 \right\rfloor$$
   - Peg actions:
     - $\Delta_{\text{bps}} \le 150$: `HOLD`
     - $150 < \Delta_{\text{bps}} \le 500$: `UPDATE_MULTIPLIER`
     - $\Delta_{\text{bps}} > 500$: `CIRCUIT_BREAK`

4. **Documentation & Ledger Claims (F13, F17, F18)**:
   - Verification against `docs/CLAIMS.json`, itemized budget totaling exactly $\$50,000$, and regression invariant tables.

---

## 5. Test Suite Directory Structure

```
tests/e2e/
├── helpers/
│   └── oracles.ts                  # Ground truth mathematical and protocol oracles
├── tier1_feature_coverage.test.ts  # Tier 1: 90 tests covering F1 through F18
├── tier2_boundary_corner.test.ts   # Tier 2: 90 tests covering edge values & boundary constraints
├── tier3_cross_feature.test.ts     # Tier 3: 20 tests covering cross-feature interactions
├── tier4_real_world.test.ts        # Tier 4: 10 tests covering full user workflows & scenarios
└── runner.ts                       # Unified CLI and CI test execution harness
```

---

## 6. Execution Instructions

### Running via PNPM
```bash
pnpm test:e2e
```

### Running via TSX directly
```bash
npx tsx tests/e2e/runner.ts
# or on Windows:
.\node_modules\.bin\tsx.cmd tests/e2e/runner.ts
```

### Running individual tiers
```bash
npx tsx tests/e2e/runner.ts --tier=1
npx tsx tests/e2e/runner.ts --tier=2
npx tsx tests/e2e/runner.ts --tier=3
npx tsx tests/e2e/runner.ts --tier=4
```

### Output Artifacts
- **Console**: ANSI-colored progress report with individual test names, execution timings, and tier breakdowns.
- **Summary File**: `data/tests/e2e_summary.json` containing total count, passed/failed stats, duration, and feature checklist.
