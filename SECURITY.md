# Security

## Security Model

| Actor | Trust | Can do |
|---|---|---|
| Owner | their own funds only | place, cancel; approve exact amounts |
| Keeper / any filler | none | call `fill`; at worst do nothing |
| Registry owner | curation | add wrappers, allowlist routers, deactivate wrappers; cannot touch funds |
| Issuer | external | pause tokens, change units; the book reads both at fill |
| Router | external, allowlisted | receives an exact approval during one call |

## Properties

See `INVARIANTS.md`. The contract has no admin withdrawal, no custody between transactions, and no unit argument in `fill`.

## Secrets

- Private keys live in `.env.local` locally and in the host secret store only. They are never committed (`.gitignore`) and never sent to the web deployment.
- The web deployment holds the public data API key and public RPC settings only. It has no signing key.
- The keeper key is a dedicated hot wallet funded with transaction fee gas only.

## Reporting

Open a private security advisory on the GitHub repository.
