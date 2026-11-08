# BNB Agent Studio toolchain

What was run, with the commands verified against the published package (`@bnbagent/studio-cli` 0.0.14, `@bnbagent/studio-runtime` 0.0.14) rather than guessed.

## Commands

```bash
npx -p @bnbagent/studio-cli bag init parallaxcert --llm-provider openai --network bsc-mainnet \
  --wallet-kind evm-local --storage-provider local --protocols A2A,MCP,X402 --rails b402 \
  --seller-price-usd 0.01 --destination self --no-onboard
cd parallaxcert/app/agent
bag config set payments.b402_seller.pay_to <owner pay-to address>
printf '%s' "$KEEPER_PRIVATE_KEY" | bag wallet new --private-key - --generate-password
bag erc8004 show                       # agent_id 370049 for this wallet
bag erc8004 resolve 370049             # read-only, no wallet needed
bag erc8004 update-endpoint --protocol A2A --endpoint https://parallax-keeper.onrender.com/.well-known/agent-card.json
```

## Result

| Check | Result |
|---|---|
| `bag erc8004 show` | agent_id 370049, address `0x4408...cf73`, the keeper wallet |
| `bag erc8004 update-endpoint` | transaction `0xa35ebc3fe3bea5669ac6b5d40cec918f2b2dd6e88c9a3837b8caa5b9261bbe3a`; `bag erc8004 resolve 370049` then lists A2A at the Render agent card and MCP at the web app |
| Agent card on the Render host | `https://parallax-keeper.onrender.com/.well-known/agent-card.json` (served by `services/keeper/src/index.ts`) |

## Notes from using it

- `bag init` refuses names with a dash or underscore and caps them at 23 characters; `parallaxcert` was accepted.
- `bag init` scaffolds a workspace that expects `pnpm install` inside it; the nested workspace install failed here, so the scaffold was used for its `studio.toml`, identity and wallet commands, and the seller logic that actually sells stays in the web app route.
- Importing a raw key goes through stdin or a hidden prompt; passing it inline is refused, which is the right default.
- `update-endpoint` printed an audit line with status `submitted` and a null `tx_hash`; the hash had to be recovered from the registry log (`scripts/mainnet/find_uri_update.ts`).
- The keystore and the generated password live under `.studio/` of the scaffold, which is kept out of the repository.
