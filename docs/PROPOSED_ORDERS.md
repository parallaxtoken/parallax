# Proposed standing orders

Status: order 1 PLACED by the owner on 2026-10-10 (order 9 on the book, approve 0x032111a8...9ac5, placeBuy 0x763a19fe...2970, filled by the keeper within the minute). Orders 2 to 6 are still only proposed. Total at risk if all buys fill: $0.15 of USDT, plus 0.0003 NVDA shares offered for sale.
Owner wallet: 0x3939...3Ed5. Deadlines are spread from 12 to 23 Oct 2026 (UTC).

| # | Order | Deadline (UTC) | Designed outcome |
|---|---|---|---|
| 1 | Buy NVDA, tight tolerance | 2026-10-12 23:59 | Fills at the Monday open if the net premium stays inside 0.25%. |
| 2 | Buy TSLA, normal tolerance | 2026-10-14 23:59 | Fills when TSLA has a contract route and a live reference. |
| 3 | Buy AAPL, wide tolerance | 2026-10-17 23:59 | Fills early in the week; the wide band keeps it patient. Restricted to bStocks because Ondo names need a 5 USD aggregator order. |
| 4 | Sell NVDA above the reference | 2026-10-19 23:59 | Sells 0.0002 NVDA shares only if each share fetches at least $240. Stays open until the price gets there or the deadline passes. |
| 5 | Buy MSFT with an unreachable floor (designed to refuse) | 2026-10-21 23:59 | Placed with a share floor of one whole share for five cents (encoded by scripts/mainnet/agentic_calls.ts, not by the planner, which would never produce it). The keeper must refuse with PREMIUM_ABOVE_LIMIT on every pass and the diary shows it. The calls below show the planner normal floor for comparison; only minShares changes. |
| 6 | Sell NVDA at an impossible price (designed to refuse) | 2026-10-23 23:59 | A sell floor of $99,999 per share: the keeper refuses for the whole window and the order expires unfilled. |

## Exact calls from the live planner

### 1. Buy NVDA, tight tolerance

- Deadline: 2026-10-12T23:59:00Z (51 hours from now)
- Planner: NVDAB; NVDAB (BSTOCKS) delivers the most shares for $0.05: 0.0002 NVDA.
- Calls the owner would sign:
    - Approve USDT: `USDT.approve(ParallaxBook, $0.05)`
    - Place standing buy: `ParallaxBook.placeBuy(NVDA, $0.05, at least 0.0002 shares, mask 1)`

### 2. Buy TSLA, normal tolerance

- Deadline: 2026-10-14T23:59:00Z (99 hours from now)
- Planner: TSLAB; TSLAB (BSTOCKS) delivers the most shares for $0.05: 0.0001 TSLA.
- Calls the owner would sign:
    - Approve USDT: `USDT.approve(ParallaxBook, $0.05)`
    - Place standing buy: `ParallaxBook.placeBuy(TSLA, $0.05, at least 0.0001 shares, mask 1)`

### 3. Buy AAPL, wide tolerance

- Deadline: 2026-10-17T23:59:00Z (171 hours from now)
- Planner: AAPLB; AAPLB (BSTOCKS) delivers the most shares for $0.05: 0.0001 AAPL.
- Calls the owner would sign:
    - Approve USDT: `USDT.approve(ParallaxBook, $0.05)`
    - Place standing buy: `ParallaxBook.placeBuy(AAPL, $0.05, at least 0.0001 shares, mask 1)`

### 4. Sell NVDA above the reference

- Deadline: 2026-10-19T23:59:00Z (219 hours from now)
- Planner: NVDAB; Sells 0.0002 NVDA shares only if each share fetches at least 240.00 USDT, enforced on-chain.
- Calls the owner would sign:
    - Approve NVDAB: `NVDAB.approve(ParallaxBook, 0.000199)`
    - Place standing sell: `ParallaxBook.placeSell(NVDA, 0.0002 shares, floor 240.00 USDT per share, mask 1)`

### 5. Buy MSFT with an unreachable floor (designed to refuse)

- Deadline: 2026-10-21T23:59:00Z (267 hours from now)
- Planner: MSFTB; MSFTB (BSTOCKS) delivers the most shares for $0.05: 0.0000 MSFT.
- Calls the owner would sign:
    - Approve USDT: `USDT.approve(ParallaxBook, $0.05)`
    - Place standing buy: `ParallaxBook.placeBuy(MSFT, $0.05, at least 0.0000 shares, mask 7)`

### 6. Sell NVDA at an impossible price (designed to refuse)

- Deadline: 2026-10-23T23:59:00Z (315 hours from now)
- Planner: NVDAB; Sells 0.0001 NVDA shares only if each share fetches at least 99999.00 USDT, enforced on-chain.
- Calls the owner would sign:
    - Approve NVDAB: `NVDAB.approve(ParallaxBook, 0.000099)`
    - Place standing sell: `ParallaxBook.placeSell(NVDA, 0.0001 shares, floor 99999.00 USDT per share, mask 1)`


Say which of these to place and I will place only those, through the web app journey or the Agentic Wallet as you prefer.
