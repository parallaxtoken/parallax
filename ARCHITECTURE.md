# Parallax Architecture

Spine: **Wrappers quote. Shares decide.**

No price is compared, displayed as a deal, or enforced on-chain in token units. Every comparison and every limit is in underlying shares, converted with a unit factor read from the blockchain at the moment of execution. The agent proposes; deterministic code computes what a share costs; the contract refuses any fill that delivers fewer shares than the owner signed for.

---

## Stellar Soroban Architecture

On the Stellar network, Parallax operates via native WebAssembly (WASM) smart contracts using the `soroban-sdk` (v20+):

```mermaid
flowchart LR
  U[User Wallet Freighter / xBull] --> W[Parallax Web App / API]
  W --> K[Share-Equivalence Kernel]
  R[Wrapper Registry<br/>Soroban Contract] --> K
  K --> P{Policy}
  P -- standing order --> PB[ParallaxBook (Soroban)]
  KP[Autonomous Stellar Keeper] -->|simulate via Soroban RPC| PB
  PB -->|shares_per_token read in-tx| CH[(Stellar Network)]
  PB -->|Execute Swap via SAC| AMM[Soroswap / Phoenix AMM]
  PB -->|Verify shares >= min_shares| U
```

---

## The Execution Flow

```
 quote ──> kernel ──> simulate ──> fill ──> unit read ──> share floor ──> receipt
   │         │            │          │          │               │            │
 routes   rank in     Soroban       anyone    registry reads  shares >=     OrderFilled
 + RWA    shares      RPC           calls     the issuer's    min_shares    event with
 status   not tokens  simulation    Parallax  own source     else PANIC    unit + shares
                                    Book      in this tx      ShareFloor
```

---

## Core Components

| Path | Role | Execution Environment |
|---|---|---|
| `contracts/soroban/src/book.rs` | `ParallaxBook`: Non-custodial limit orders, persistent storage TTL extensions, atomic share floor invariant | Stellar Soroban (WASM) |
| `contracts/soroban/src/registry.rs` | `WrapperRegistry`: Active wrappers, allowlisted DEX routers, dynamic multiplier unit reads | Stellar Soroban (WASM) |
| `packages/kernel` | Unit-safe fixed-point math, 7-decimal USDC stroops to 18-decimal WAD conversions, session clock | TypeScript (Pure Math) |
| `packages/registry` | Stellar network endpoints (Testnet/Mainnet), native SAC USDC addresses, RWA wrapper catalog | TypeScript |
| `services/keeper` | Autonomous Stellar keeper: polls Soroban RPC, evaluates orders, broadcasts `fill` | Node.js / TypeScript |
| `apps/web` | Next.js web application, trading panel, portfolio review, MCP agent routes | Next.js / React |
| `skills/parallax` | Autonomous Agent Wallet skill | CLI / Agent tool |

---

## Unit Mechanisms on Stellar

| Asset Category | Where the Unit Lives | Read Mechanism in Contract |
|---|---|---|
| **Stellar Native RWAs (e.g. BENJI / FOBXX)** | Stellar Asset Contract (SAC) | 1:1 parity with underlying fund shares |
| **Bridged Equity Wrappers (Backed bNVDA, bAAPL)** | Token Multiplier or Oracle | `shares_per_token(token)` reads live scaling factor |
| **Synthetic / Oracle Equities** | Reflector / Pyth Oracle on Soroban | Real-time equity oracle feed query |

---

## Trust Boundaries

- **The Smart Contract** trusts only the curated registry and the on-chain unit sources it reads in the fill transaction.
- **The Keeper** is completely untrusted by the contract: anyone may fill; the worst an offline or malicious keeper can do is nothing.
- **The Web App** never signs and never holds private keys. Transactions are prepared and previewed for the user's wallet to sign.
