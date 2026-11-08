# Parallax Invariants

Each invariant is named, independently checkable, and enforced by the smart contract and verified by tests.

| ID | Invariant | Checked by |
|---|---|---|
| P1 | **Unit normalisation.** No comparison, ranking or enforced limit uses raw token units. | Branded kernel types (`packages/kernel/src/units.ts`), `ParallaxBook.fill`, verifier |
| P2 | **Share floor.** A buy never delivers fewer share-equivalents than `order.minShares`. | `ParallaxBook` revert `ShareFloor`, `test_shareFloorRevert`, Soroban tests |
| P2b | **Sell floor.** A sell never pays less than `shares x floor` in USDC. | `ParallaxBook` revert `SellFloor`, `test_sellFloorRevert`, verifier |
| P3 | **Live unit.** The unit used at fill is read on-chain in the same transaction; `fill` has no unit argument. | `ParallaxBook.fill`, `test_keeperCannotPassUnit`, Soroban contracts |
| P4 | **Corporate-action freeze.** No fill while the issuer pause source reports paused. | `WrapperRegistry.isPaused`, `test_corporatePause`, kernel policy |
| P5 | **Allowlist.** Only registered wrappers of the order ticker and only allowlisted routers. | `ParallaxBook.fill`, `test_unlistedRouter`, `test_wrongWrapper` |
| P6 | **No custody.** Funds stay in the owner wallet until the fill transaction; the book holds nothing between transactions. | `testFuzz_noResidual`, `invariant_bookHoldsNothing` |
| P7 | **Recipient lock.** Output reaches the owner; routes that send it elsewhere deliver zero and revert. | `test_maliciousRecipient`, Soroban transfer check |
| P8 | **Exactly once.** An order fills at most once; replay reverts. | `test_replay`, `invariant_floorAndExactlyOnce` |
| P9 | **Simulate before send.** The keeper never broadcasts without a passing simulation; the source is recorded. | `services/keeper` journal |
| P10 | **Stale is labelled.** A reference older than the last live session is never presented or used as live. | `packages/kernel/test`, UI session badge |
| P11 | **Decomposition closure.** `(1 + gross) = unit x (1 + net)` within 1e-9 for every stored quote. | Property test |
| P12 | **Degraded is distinct.** "Source unavailable" and "no wrapper" are different typed states everywhere. | TypeScript kernel types, UI states |

## Named failure mode

A limit expressed in tokens is filled wrongly after a unit change. In real shares, `ParallaxBook` panics/reverts with `ShareFloor` when the live multiplier reveals under-delivery.
