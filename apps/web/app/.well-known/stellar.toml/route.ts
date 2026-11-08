export const dynamic = 'force-dynamic';

const TOML_CONTENT = `# Parallax Protocol Stellar Discovery Configuration (SEP-1)
VERSION = "2.0.0"
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
WEB_AUTH_ENDPOINT = "http://localhost:3000/api/sep10"
TRANSFER_SERVER_0024 = "http://localhost:3000/api/sep24"
ANCHOR_QUOTE_SERVER = "http://localhost:3000/api/sep38"

[DOCUMENTATION]
ORG_NAME = "Parallax Protocol"
ORG_URL = "https://github.com/warlock-netizen/parallax"
ORG_DESCRIPTION = "Share-equivalence standing limit order protocol for tokenized equities on Stellar Soroban"
ORG_OFFICIAL_EMAIL = "warlock-netizen@users.noreply.github.com"

# Registered Native & Tokenized Assets
[[CURRENCIES]]
code = "USDC"
issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
status = "live"
is_asset_anchor = true
desc = "Circle USD Coin native on Stellar"

[[CURRENCIES]]
code = "bNVDA"
issuer = "CBG4XKLKV4TPIBCVR5HM4HZG3CSNJPQ3EEYNAXRYJKAXKKP2PYCDOTNG"
status = "live"
is_asset_anchor = true
desc = "Backed Finance NVIDIA tokenized stock tracker"

[[CURRENCIES]]
code = "bAAPL"
issuer = "CDYYFXXT4RNVQHIFR3FVUSFSWPFPAUYEI7GVBQHGDVJKVMFL3YLLQHTE"
status = "live"
is_asset_anchor = true
desc = "Backed Finance Apple tokenized stock tracker"

[[CURRENCIES]]
code = "bTSLA"
issuer = "CDBPE4Q4RSBQWXYPFAECE5AANQ3BOARNALARQ7CXDS2OYROATR2WLJNO"
status = "live"
is_asset_anchor = true
desc = "Backed Finance Tesla tokenized stock tracker"

[[CURRENCIES]]
code = "BENJI"
issuer = "CDMWXGFCNMAH2YADWNH2RW5EYK2F72YBFA2U4JKN6QCSUQ34GCQP7MQE"
status = "live"
is_asset_anchor = true
desc = "Franklin Templeton OnChain U.S. Government Money Fund (FOBXX)"
`;

export async function GET() {
  return new Response(TOML_CONTENT, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

