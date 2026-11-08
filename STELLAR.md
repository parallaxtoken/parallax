# Parallax on Stellar (Soroban)

> **"Wrappers quote. Shares decide."**  
> Parallax enables non-custodial standing limit orders for tokenized equities on the **Stellar network**, enforced in real share units via **Soroban smart contracts**.

---

## 1. Why Parallax on Stellar?

On Stellar, tokenized securities and real-world assets (RWAs)—such as Franklin Templeton's BENJI (FOBXX), WisdomTree funds, and tokenized US equities—trade 24/7. However, stock splits, dividends, rebases, and wrapper differences mean that **1 token is not always 1 share of stock**.

Parallax solves this by allowing investors to set standing buy and sell orders **denominated in real shares**, not raw tokens. The Soroban smart contract reads the issuer's live share multiplier inside the transaction itself and **reverts (panics)** if fewer real shares arrive than the user accepted.

---

## 2. Soroban Contract Suite (`contracts/soroban/`)

The smart contract layer is implemented in Rust using the `soroban-sdk` (v20+):

### A. `ParallaxBook` (`src/book.rs`)
- **`place_buy(owner, ticker_id, pay_amount, min_shares, deadline, wrapper_mask)`**: Places a standing buy order using native Stellar USDC.
- **`place_sell(owner, ticker_id, shares, min_usdc_per_share, deadline, wrapper_mask)`**: Places a standing sell order.
- **`cancel(order_id)`**: Cancels an open order.
- **`fill(filler, order_id, wrapper_idx, router, route_data)`**: Executes the order through an allowlisted Soroban DEX router (e.g. Soroswap, Phoenix), verifies that received shares meet `min_shares`, and delivers the tokens to the owner.

### B. `WrapperRegistry` (`src/registry.rs`)
- Maintains active equity wrappers per ticker (e.g., `NVDA`, `AAPL`, `TSLA`).
- Maps tokens to issuers (`BStocks`, `Ondo`, `XStocks`, `Benji`, `Custom`).
- Dynamically queries on-chain multipliers via `shares_per_token(token)` in 18-decimal fixed point (`WAD`).

---

## 3. Decimal Normalization: Stellar USDC vs. Equities

- **Stellar Native USDC (SAC)**: Uses **7 decimals** ($10^7$ stroops).
- **Equity Shares & Multipliers**: Standardized at **18 decimals** ($10^{18}$ WAD) to support ultra-granular fractional shares.
- **Calculation in `ParallaxBook`**:
  $$\text{Real Shares} = \frac{\text{Tokens Out} \times \text{Multiplier (WAD)}}{10^{18}}$$
  $$\text{Invariant Check: } \text{Real Shares} \ge \text{Order.min\_shares}$$

---

## 4. Soroban State Expiration (TTL Management)

Unlike EVM storage, Soroban employs state archiving. Open orders in `ParallaxBook` use **Persistent Storage** and call:
```rust
env.storage().persistent().extend_ttl(&order_key, 100_000, 200_000);
```
This guarantees that open standing orders remain accessible and executable indefinitely as long as they are active.

---

## 5. Development & Testing

### Build Soroban Contracts
```bash
cd contracts/soroban
cargo build --target wasm32-unknown-unknown --release
```

### Run Rust Test Suite
```bash
cargo test
```

### Deploy to Stellar Testnet
```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/parallax_contracts.wasm \
  --source-account <SECRET_KEY> \
  --network testnet
```

---

## 6. Running the Stellar Keeper Bot

The off-chain keeper (`services/keeper/src/stellar_keeper.ts`) monitors open orders and triggers fills when prices align:

```typescript
import { StellarKeeperEngine } from './stellar_keeper';
import { STELLAR_TESTNET } from '@parallax/registry';

const keeper = new StellarKeeperEngine({
  network: STELLAR_TESTNET,
  keeperSecretKey: process.env.STELLAR_KEEPER_SECRET!,
  maxSlippageBps: 50,
});

keeper.startLoop(5000); // Polls every 5 seconds
```
