# Parallax Design Decisions

## D1. Name: Parallax

**Parallax.** The apparent shift of an object's position when viewed along different lines of sight. In tokenized stock markets, one share looks different depending on the wrapper lens you view it through. Parallax strips the wrapper distortions and calculates the true equity value.

## D2. Share denomination on-chain, not off-chain

Limits are signed in real shares, and the contract queries the unit multiplier in the exact transaction of execution. An off-chain guard protects only while an app is open and a user is awake to sign; on-chain enforcement guarantees invariant protection 24/7.

## D3. Allowance model, zero custody

The user authorizes `ParallaxBook` for the exact amount needed for the order. The contract pulls funds during the fill, executes the swap, verifies the share floor, delivers shares to the user, and leaves zero residual custody in the contract.

## D4. Stellar Soroban Target

The protocol is built natively for Stellar's Soroban WebAssembly (WASM) smart contract platform (Protocol 20+). Soroban provides Turing-complete execution, atomic cross-contract calls, and instantaneous panics/reverts when the `ShareFloor` is violated. Open orders are stored in Persistent Storage with automated TTL rent extensions.

## D5. Stellar Native USDC 7-Decimal Scaling

On Stellar, native Circle USDC uses 7 decimals (stroops). The protocol normalizes USDC values to 18-decimal fixed point (`WAD`) internally when computing per-share pricing to maintain high fractional equity precision.

## D6. Autonomous Keeper Execution

The keeper bot evaluates open orders continuously. The contract allows any caller to execute a fill provided the router is allowlisted and the share floor invariant is satisfied. A malicious keeper cannot steal funds or deliver fewer shares than the user accepted.

## D7. Direct DEX Routing via Soroswap & Phoenix

Swaps are routed through decentralized liquidity pools (Soroswap, Phoenix AMM, SDEX) on Stellar, tapping into multi-hop liquidity while keeping execution atomic.
