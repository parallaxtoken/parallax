import { describe, expect, it } from 'vitest';
import { SepClient, ParallaxComplianceEngine } from '../src/sep';

describe('SepClient', () => {
  const client = new SepClient('testanchor.stellar.org');

  it('parses stellar.toml fields correctly (SEP-1)', () => {
    const sampleToml = `
VERSION = "2.0.0"
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
WEB_AUTH_ENDPOINT = "https://auth.testanchor.stellar.org/auth"
TRANSFER_SERVER_0024 = "https://sep24.testanchor.stellar.org"
ANCHOR_QUOTE_SERVER = "https://quotes.testanchor.stellar.org"
`;
    const parsed = client.parseToml(sampleToml);
    expect(parsed.version).toBe('2.0.0');
    expect(parsed.networkPassphrase).toBe('Test SDF Network ; September 2015');
    expect(parsed.webAuthEndpoint).toBe('https://auth.testanchor.stellar.org/auth');
    expect(parsed.transferServerSep24).toBe('https://sep24.testanchor.stellar.org');
    expect(parsed.anchorQuoteServer).toBe('https://quotes.testanchor.stellar.org');
  });

  it('formulates valid SEP-10 challenge URLs', () => {
    const endpoint = 'https://auth.testanchor.stellar.org/auth';
    const account = 'GBEXAMPLESTELLARACCOUNT1234567890ABCDEF1234567890ABCDEF1234';
    const url = client.getWebAuthChallengeUrl(endpoint, account);
    expect(url).toContain('https://auth.testanchor.stellar.org/auth?account=GBEXAMPLE');
  });

  it('generates valid SEP-24 interactive deposit URLs', () => {
    const transferServer = 'https://sep24.testanchor.stellar.org';
    const url = client.getSep24InteractiveUrl({
      transferServer,
      operation: 'deposit',
      assetCode: 'USDC',
      account: 'GBEXAMPLESTELLARACCOUNT1234567890ABCDEF1234567890ABCDEF1234',
    });
    expect(url).toBe('https://sep24.testanchor.stellar.org/transactions/deposit/interactive?asset_code=USDC&account=GBEXAMPLESTELLARACCOUNT1234567890ABCDEF1234567890ABCDEF1234');
  });

  it('simulates SEP-38 price queries for tokenized stocks against USDC', async () => {
    const price = await client.getSep38Price({
      quoteServer: 'https://quotes.testanchor.stellar.org',
      sellAsset: 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      buyAsset: 'stellar:bNVDA:GBEXAMPLESTELLARACCOUNT1234567890ABCDEF1234567890ABCDEF1234',
      sellAmount: '100.00',
    });
    expect(price.price).toBeDefined();
    expect(price.totalPrice).toBeDefined();
    expect(price.fee.total).toBeDefined();
  });

  it('requests valid SEP-38 firm quotes', async () => {
    const quote = await client.requestSep38FirmQuote({
      quoteServer: 'https://quotes.testanchor.stellar.org',
      authToken: 'jwt-auth-token-sample',
      sellAsset: 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      buyAsset: 'stellar:bNVDA:GBEXAMPLESTELLARACCOUNT1234567890ABCDEF1234567890ABCDEF1234',
      sellAmount: '145.20',
    });
    expect(quote.id).toMatch(/^sep38-quote-/);
    expect(quote.buyAmount).toBe('1.000000');
    expect(quote.expiresAt).toBeDefined();
  });
});

describe('ParallaxComplianceEngine', () => {
  it('blocks sanctioned jurisdictions and allows compliant regions', () => {
    const sanctioned = ParallaxComplianceEngine.verifyJurisdiction('IR');
    expect(sanctioned.allowed).toBe(false);
    expect(sanctioned.reason).toContain('restricted');

    const compliant = ParallaxComplianceEngine.verifyJurisdiction('GB');
    expect(compliant.allowed).toBe(true);
  });

  it('provides regulatory profiles for licensed issuers', () => {
    const backed = ParallaxComplianceEngine.getIssuerComplianceProfile('BStocks');
    expect(backed.regulatoryFramework).toContain('Swiss DLT Act');
    expect(backed.requiresIssuerKyc).toBe(true);

    const benji = ParallaxComplianceEngine.getIssuerComplianceProfile('Benji');
    expect(benji.regulatoryFramework).toContain('SEC-Registered');
  });
});

