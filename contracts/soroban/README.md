# Parallax Soroban Smart Contracts

This directory contains the Stellar/Soroban smart contracts for **Parallax: Share-equivalence standing limit orders for tokenized stocks on Stellar**.

## Contracts

1. **`ParallaxBook`** (`src/book.rs`):
   - Non-custodial standing limit order book for tokenized equities.
   - Enforces the `ShareFloor` invariant: `shares_out >= min_shares` read dynamically inside the transaction.
   - Operates with Stellar native USDC (7 decimals) and shares (18 decimals fixed point WAD).
   - Manages state expiration using Soroban Persistent Storage TTL extensions.

2. **`WrapperRegistry`** (`src/registry.rs`):
   - Curated list of active wrappers per stock ticker (e.g. `NVDA`, `AAPL`).
   - Maps tokens to issuers (`BStocks`, `Ondo`, `XStocks`, `Benji`, `Custom`).
   - Dynamic on-chain reader for live multiplier units (`shares_per_token`) and pause status (`is_paused`).

## Building & Testing

### Prerequisites
- Rust toolchain (`rustup target add wasm32-unknown-unknown`)
- Stellar CLI (`cargo install --locked stellar-cli`)

### Build WASM
```bash
cargo build --target wasm32-unknown-unknown --release
```

### Run Tests
```bash
cargo test
```

### Deploy to Stellar Testnet
```bash
# 1. Deploy WrapperRegistry
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/parallax_contracts.wasm \
  --source-account <YOUR_KEY> \
  --network testnet

# 2. Deploy ParallaxBook
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/parallax_contracts.wasm \
  --source-account <YOUR_KEY> \
  --network testnet
```
