---
name: parallax
description: |
  Use when the user wants to buy or sell a tokenized stock on Stellar (Soroban) and multi-chain in real shares,
  set a standing order ("buy $10 of Nvidia every Friday, never more than $X a share", "sell 0.05 shares of SPY if it reaches $Y"),
  ask which wrapper gives the most shares, or ask what their orders did.
  Parallax plans the exact calls; the wallet previews and signs them. This skill never signs.
metadata:
  author: Parallax
  version: '0.1.0'
---

# Parallax

Wrappers quote. Shares decide. Every comparison and every limit is in shares, never in raw token units.

Base URL: `${PARALLAX_ORIGIN}` (the deployed web app). All endpoints are public and read-only except that
`/api/plan` returns calls for the wallet to sign. Nothing on the server holds a key.

## Flow

1. **Understand the intent** and fill the plan request.

   | Phrase | `intent` | Fields |
   |---|---|---|
   | "buy $20 of Nvidia, most shares" | `instant-buy` | `ticker`, `usd`, `owner`, `toleranceBps` |
   | "keep buying $50 of the S&P, never more than 0.5% over the real price" | `standing-buy` | `ticker`, `usd`, `owner`, `toleranceBps: 50`, `deadlineHours` |
   | "sell 0.05 SPY shares if it reaches $Y" | `standing-sell` | `ticker`, `shares`, `floorUsdPerShare`, `owner`, `deadlineHours` |

2. **Call `/api/plan`**. It answers with the chosen wrapper, the session state, the execution mode,
   and the call array ready for the wallet to preview.

3. **Preview clearly to the user**. Show the ticker, real shares expected, the worst-case floor, and
   the allowance requested.
