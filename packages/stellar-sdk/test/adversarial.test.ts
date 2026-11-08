import { describe, expect, it } from 'vitest';
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  WebAuth,
  xdr,
} from '@stellar/stellar-sdk';
import {
  CIRCUIT_BREAKER_DIVERGENCE_BPS,
  MAX_PEG_DIVERGENCE_BPS,
  STELLAR_TESTNET_PASSPHRASE,
  Sep10Client,
  Sep38Client,
  WAD,
} from '../src/index.js';

describe('SEP-10 WebAuth Adversarial Challenge', () => {
  const genuineServerKp = Keypair.random();
  const rogueServerKp = Keypair.random();
  const clientKp = Keypair.random();
  const attackerKp = Keypair.random();
  const domain = 'parallax.finance';

  const defaultSep10 = new Sep10Client({
    webAuthEndpoint: 'https://auth.parallax.finance/auth',
    serverSigningKey: genuineServerKp.publicKey(),
    homeDomain: domain,
    webAuthDomain: domain,
    networkPassphrase: Networks.TESTNET,
  });

  describe('Challenge Transaction Validation & Malformed Inputs', () => {
    it('rejects challenge signed by rogue/mismatched server account', () => {
      // Build challenge using rogue server keypair
      const rogueChallengeXdr = WebAuth.buildChallengeTx(
        rogueServerKp,
        clientKp.publicKey(),
        domain,
        300,
        Networks.TESTNET,
        domain
      );

      // Client configured with genuineServerKp should reject rogueChallengeXdr
      expect(() => {
        defaultSep10.parseChallenge(rogueChallengeXdr);
      }).toThrow();
    });

    it('rejects challenge built with wrong network passphrase', () => {
      // Challenge created on PUBLIC network
      const publicChallengeXdr = WebAuth.buildChallengeTx(
        genuineServerKp,
        clientKp.publicKey(),
        domain,
        300,
        Networks.PUBLIC,
        domain
      );

      // Client configured for TESTNET must reject public network challenge
      expect(() => {
        defaultSep10.parseChallenge(publicChallengeXdr);
      }).toThrow();
    });

    it('rejects challenge transactions with expired timebounds exceeding clock-skew grace', () => {
      const now = Math.floor(Date.now() / 1000);
      // Stellar WebAuth.readChallengeTx enforces a 300s (5-minute) grace period for clock skew.
      // A transaction expired 10 minutes ago (>300s grace period) must be rejected.
      const expiredMinTime = now - 1200;
      const expiredMaxTime = now - 600; // expired 10 minutes ago
      const nonce = Buffer.alloc(48, 'a').toString('base64'); // valid 64-char base64 string

      const serverAccount = new Account(genuineServerKp.publicKey(), '-1');
      const tx = new TransactionBuilder(serverAccount, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
        timebounds: {
          minTime: String(expiredMinTime),
          maxTime: String(expiredMaxTime),
        },
      })
        .addOperation(
          Operation.manageData({
            source: clientKp.publicKey(),
            name: `${domain} auth`,
            value: nonce,
          })
        )
        .build();

      tx.sign(genuineServerKp);
      const expiredXdr = tx.toXDR();

      expect(() => defaultSep10.parseChallenge(expiredXdr)).toThrow(
        /The transaction has expired/
      );
    });

    it('rejects challenge transactions with future minTime', () => {
      const now = Math.floor(Date.now() / 1000);
      const futureMinTime = now + 3600; // 1 hour in future
      const futureMaxTime = now + 7200;
      const nonce = Buffer.alloc(48, 'b').toString('base64');

      const serverAccount = new Account(genuineServerKp.publicKey(), '-1');
      const tx = new TransactionBuilder(serverAccount, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
        timebounds: {
          minTime: String(futureMinTime),
          maxTime: String(futureMaxTime),
        },
      })
        .addOperation(
          Operation.manageData({
            source: clientKp.publicKey(),
            name: `${domain} auth`,
            value: nonce,
          })
        )
        .build();

      tx.sign(genuineServerKp);
      const futureXdr = tx.toXDR();

      expect(() => defaultSep10.parseChallenge(futureXdr)).toThrow(
        /The transaction has expired/
      );
    });

    it('rejects challenge with injected malicious non-manageData operations', () => {
      const now = Math.floor(Date.now() / 1000);
      const nonce = Buffer.alloc(48, 'c').toString('base64');

      const serverAccount = new Account(genuineServerKp.publicKey(), '-1');
      const tx = new TransactionBuilder(serverAccount, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
        timebounds: {
          minTime: String(now - 100),
          maxTime: String(now + 300),
        },
      })
        .addOperation(
          Operation.manageData({
            source: clientKp.publicKey(),
            name: `${domain} auth`,
            value: nonce,
          })
        )
        .addOperation(
          Operation.payment({
            destination: attackerKp.publicKey(),
            asset: Asset.native(),
            amount: '100',
          })
        )
        .build();

      tx.sign(genuineServerKp);
      expect(() => defaultSep10.parseChallenge(tx.toXDR())).toThrow(
        /The transaction has operations that are not of type 'manageData'/
      );
    });

    it('rejects malformed XDR strings', () => {
      const malformedInputs = [
        '',
        'not-a-valid-xdr',
        'AAAAAG',
        '{"transaction": "invalid"}',
        '!!!###$$$%%%',
        'AAAAAQAAAAC544...truncated',
      ];

      for (const badXdr of malformedInputs) {
        expect(() => {
          defaultSep10.parseChallenge(badXdr);
        }).toThrow();

        expect(() => {
          defaultSep10.signChallengeWithSecret(badXdr, clientKp.secret());
        }).toThrow();
      }
    });

    it('rejects invalid client secret seed when signing', () => {
      const challengeXdr = WebAuth.buildChallengeTx(
        genuineServerKp,
        clientKp.publicKey(),
        domain,
        300,
        Networks.TESTNET,
        domain
      );

      const invalidSecrets = [
        '',
        'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
        'invalid-seed-format',
      ];

      for (const badSecret of invalidSecrets) {
        expect(() => {
          defaultSep10.signChallengeWithSecret(challengeXdr, badSecret);
        }).toThrow();
      }
    });

    it('detects forged client signatures when verifying signers', () => {
      const challengeXdr = WebAuth.buildChallengeTx(
        genuineServerKp,
        clientKp.publicKey(),
        domain,
        300,
        Networks.TESTNET,
        domain
      );

      // Sign with attacker keypair instead of expected client keypair
      const forgedSignedXdr = defaultSep10.signChallengeWithSecret(
        challengeXdr,
        attackerKp.secret()
      );

      // Verify that clientKp is NOT recognized as a signer
      expect(() => {
        WebAuth.verifyChallengeTxSigners(
          forgedSignedXdr,
          genuineServerKp.publicKey(),
          Networks.TESTNET,
          [clientKp.publicKey()],
          domain,
          domain
        );
      }).toThrow();
    });
  });

  describe('JWT Verification & Malformed Token Structures', () => {
    it('rejects tokens that do not have 3 dot-separated segments', () => {
      const badTokens = [
        '',
        'single-segment',
        'two.segments',
        'four.segments.are.here',
        'a.b.c.d.e',
      ];

      for (const token of badTokens) {
        expect(() => defaultSep10.verifyJwt(token)).toThrow(/Invalid JWT/);
      }
    });

    it('rejects tokens with non-JSON or corrupted base64url payload', () => {
      const invalidPayloadTokens = [
        'header.not-base-64.sig',
        'header.YWJj.sig', // 'abc' is not valid JSON
        'header.eyBpbnZhbGlkIGpzb24gfQ.sig', // '{ invalid json }'
      ];

      for (const token of invalidPayloadTokens) {
        expect(() => defaultSep10.verifyJwt(token)).toThrow();
      }
    });

    it('rejects tokens where expiration is in the past', () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredPayload = Buffer.from(
        JSON.stringify({
          sub: clientKp.publicKey(),
          iss: 'https://auth.parallax.finance/auth',
          iat: now - 3600,
          exp: now - 1,
        })
      ).toString('base64url');

      expect(() => defaultSep10.verifyJwt(`h.${expiredPayload}.s`)).toThrow(
        /JWT token has expired/
      );
    });

    it('accepts tokens that are active and not yet expired', () => {
      const now = Math.floor(Date.now() / 1000);
      const validPayload = Buffer.from(
        JSON.stringify({
          sub: clientKp.publicKey(),
          iss: 'https://auth.parallax.finance/auth',
          iat: now,
          exp: now + 3600,
        })
      ).toString('base64url');

      const claims = defaultSep10.verifyJwt(`h.${validPayload}.s`);
      expect(claims.sub).toBe(clientKp.publicKey());
      expect(claims.exp).toBe(now + 3600);
    });
  });

  describe('HTTP & Remote Endpoint Error Handling', () => {
    it('throws descriptive error on server 500 error during challenge request', async () => {
      const mockFetch = async () =>
        new Response('Internal Server Error', { status: 500, statusText: 'Server Error' });

      const client = new Sep10Client({
        webAuthEndpoint: 'https://auth.parallax.finance/auth',
        serverSigningKey: genuineServerKp.publicKey(),
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(client.getChallenge(clientKp.publicKey())).rejects.toThrow(
        /SEP-10 challenge request failed with status 500/
      );
    });

    it('throws error when challenge response omits transaction field', async () => {
      const mockFetch = async () =>
        new Response(JSON.stringify({ otherField: 'data' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const client = new Sep10Client({
        webAuthEndpoint: 'https://auth.parallax.finance/auth',
        serverSigningKey: genuineServerKp.publicKey(),
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(client.getChallenge(clientKp.publicKey())).rejects.toThrow(
        /missing "transaction" field/
      );
    });

    it('throws descriptive error on 401 Unauthorized during token exchange', async () => {
      const mockFetch = async () =>
        new Response(JSON.stringify({ error: 'Signature verification failed' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });

      const client = new Sep10Client({
        webAuthEndpoint: 'https://auth.parallax.finance/auth',
        serverSigningKey: genuineServerKp.publicKey(),
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(client.getToken('someSignedChallengeXdr')).rejects.toThrow(
        /SEP-10 token exchange failed with status 401/
      );
    });

    it('falls back to GET if POST receives 405 Method Not Allowed', async () => {
      let methodCalled = '';
      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return new Response('Method Not Allowed', { status: 405 });
        }
        methodCalled = 'GET';
        return new Response(JSON.stringify({ token: 'jwt-via-get-fallback' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = new Sep10Client({
        webAuthEndpoint: 'https://auth.parallax.finance/auth',
        serverSigningKey: genuineServerKp.publicKey(),
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const token = await client.getToken('someSignedChallengeXdr');
      expect(methodCalled).toBe('GET');
      expect(token).toBe('jwt-via-get-fallback');
    });
  });
});

describe('SEP-38 Price Fetcher Adversarial Challenge', () => {
  const quoteServer = 'https://quotes.parallax.finance';
  const sep38 = new Sep38Client({ quoteServer });

  describe('Peg Divergence Precision & Threshold Invariants', () => {
    it('evaluates exact 250 bps peg divergence as pegged (action = HOLD)', async () => {
      // 250 bps = 2.50% divergence
      // binance: 100.00, dex: 102.50 -> diff = 2.50 -> 250 bps
      const res = await sep38.fetchPeggedQuote({
        ticker: 'NVDA',
        sellAmountUsdc: '100.00',
        binanceRefPriceUsd: 100.0,
        simulatedDexPriceUsd: 102.5,
      });

      expect(res.pegDivergenceBps).toBe(250);
      expect(res.isPegged).toBe(true);
      expect(res.circuitBreakerTripped).toBe(false);
      expect(res.action).toBe('HOLD');
    });

    it('evaluates 251 bps peg divergence as unpegged warning (action = UPDATE_MULTIPLIER)', async () => {
      // 251 bps = 2.51% divergence
      // binance: 100.00, dex: 102.51 -> diff = 2.51 -> 251 bps
      const res = await sep38.fetchPeggedQuote({
        ticker: 'NVDA',
        sellAmountUsdc: '100.00',
        binanceRefPriceUsd: 100.0,
        simulatedDexPriceUsd: 102.51,
      });

      expect(res.pegDivergenceBps).toBe(251);
      expect(res.isPegged).toBe(false);
      expect(res.circuitBreakerTripped).toBe(false);
      expect(res.action).toBe('UPDATE_MULTIPLIER');
    });

    it('evaluates exact 500 bps peg divergence as warning threshold (action = UPDATE_MULTIPLIER)', async () => {
      // 500 bps = 5.00% divergence
      // binance: 100.00, dex: 105.00 -> diff = 5.00 -> 500 bps
      const res = await sep38.fetchPeggedQuote({
        ticker: 'AAPL',
        sellAmountUsdc: '100.00',
        binanceRefPriceUsd: 100.0,
        simulatedDexPriceUsd: 105.0,
      });

      expect(res.pegDivergenceBps).toBe(500);
      expect(res.isPegged).toBe(false);
      expect(res.circuitBreakerTripped).toBe(false);
      expect(res.action).toBe('UPDATE_MULTIPLIER');
    });

    it('trips circuit breaker immediately at 501 bps peg divergence (action = CIRCUIT_BREAK)', async () => {
      // 501 bps = 5.01% divergence
      // binance: 100.00, dex: 105.01 -> diff = 5.01 -> 501 bps
      const res = await sep38.fetchPeggedQuote({
        ticker: 'TSLA',
        sellAmountUsdc: '100.00',
        binanceRefPriceUsd: 100.0,
        simulatedDexPriceUsd: 105.01,
      });

      expect(res.pegDivergenceBps).toBe(501);
      expect(res.isPegged).toBe(false);
      expect(res.circuitBreakerTripped).toBe(true);
      expect(res.action).toBe('CIRCUIT_BREAK');
    });

    it('handles negative price deviation (DEX price below Binance ref price)', async () => {
      // binance: 100.00, dex: 97.50 -> diff = 2.50 -> 250 bps
      const res250 = await sep38.fetchPeggedQuote({
        ticker: 'NVDA',
        sellAmountUsdc: '100.00',
        binanceRefPriceUsd: 100.0,
        simulatedDexPriceUsd: 97.5,
      });
      expect(res250.pegDivergenceBps).toBe(250);
      expect(res250.isPegged).toBe(true);
      expect(res250.action).toBe('HOLD');

      // binance: 100.00, dex: 94.99 -> diff = 5.01 -> 501 bps
      const res501 = await sep38.fetchPeggedQuote({
        ticker: 'NVDA',
        sellAmountUsdc: '100.00',
        binanceRefPriceUsd: 100.0,
        simulatedDexPriceUsd: 94.99,
      });
      expect(res501.pegDivergenceBps).toBe(501);
      expect(res501.circuitBreakerTripped).toBe(true);
      expect(res501.action).toBe('CIRCUIT_BREAK');
    });
  });

  describe('Franklin Templeton BENJI & FOBXX $1.0000 NAV Parity Invariant', () => {
    it('strictly enforces $1.0000 NAV parity for BENJI regardless of external price input', async () => {
      // External price could be 0, negative, or absurd ($999.00)
      const inputs = [0, -50, 999.99, 0.0001, 12345];
      for (const externalPrice of inputs) {
        const res = await sep38.fetchPeggedQuote({
          ticker: 'BENJI',
          sellAmountUsdc: '500.00',
          binanceRefPriceUsd: externalPrice,
          simulatedDexPriceUsd: 1.0,
        });

        expect(res.binanceRefPriceUsd).toBe(1.0);
        expect(res.stellarDexPriceUsd).toBe(1.0);
        expect(res.pegDivergenceBps).toBe(0);
        expect(res.isPegged).toBe(true);
        expect(res.circuitBreakerTripped).toBe(false);
        expect(res.action).toBe('HOLD');
        expect(res.estimatedSharesWad).toBe(500n * WAD);
      }
    });

    it('strictly enforces $1.0000 NAV parity for FOBXX ticker symbol', async () => {
      const res = await sep38.fetchPeggedQuote({
        ticker: 'FOBXX',
        sellAmountUsdc: '250.00',
        binanceRefPriceUsd: 0, // FOBXX has no Binance spot pair
        simulatedDexPriceUsd: 1.0,
      });

      expect(res.binanceRefPriceUsd).toBe(1.0);
      expect(res.pegDivergenceBps).toBe(0);
      expect(res.isPegged).toBe(true);
      expect(res.action).toBe('HOLD');
    });

    it('correctly detects secondary market DEX drift for BENJI against $1.0000 NAV parity', async () => {
      // If someone on Stellar DEX trades BENJI at $1.06 (600 bps depeg)
      const res = await sep38.fetchPeggedQuote({
        ticker: 'BENJI',
        sellAmountUsdc: '100.00',
        binanceRefPriceUsd: 1.0,
        simulatedDexPriceUsd: 1.06,
      });

      expect(res.binanceRefPriceUsd).toBe(1.0);
      expect(res.stellarDexPriceUsd).toBe(1.06);
      expect(res.pegDivergenceBps).toBe(600);
      expect(res.circuitBreakerTripped).toBe(true);
      expect(res.action).toBe('CIRCUIT_BREAK');
    });

    it('handles lowercase ticker strings seamlessly', async () => {
      const resBenji = await sep38.fetchPeggedQuote({
        ticker: 'benji',
        sellAmountUsdc: '100.00',
        binanceRefPriceUsd: 0,
        simulatedDexPriceUsd: 1.0,
      });
      expect(resBenji.ticker).toBe('BENJI');
      expect(resBenji.binanceRefPriceUsd).toBe(1.0);

      const resFobxx = await sep38.fetchPeggedQuote({
        ticker: 'fobxx',
        sellAmountUsdc: '100.00',
        binanceRefPriceUsd: 0,
        simulatedDexPriceUsd: 1.0,
      });
      expect(resFobxx.ticker).toBe('FOBXX');
      expect(resFobxx.binanceRefPriceUsd).toBe(1.0);
    });
  });

  describe('Adversarial & Boundary Numeric Inputs', () => {
    it('rejects negative, zero, and non-numeric sellAmountUsdc', async () => {
      const badAmounts = ['-1', '-0.001', '0', '0.000', 'abc', '', 'NaN', 'undefined'];

      for (const amount of badAmounts) {
        await expect(
          sep38.fetchPeggedQuote({
            ticker: 'NVDA',
            sellAmountUsdc: amount,
            binanceRefPriceUsd: 145.0,
            simulatedDexPriceUsd: 145.0,
          })
        ).rejects.toThrow(/Invalid sellAmountUsdc/);
      }
    });

    it('rejects zero or negative binanceRefPriceUsd for non-BENJI equities', async () => {
      const badPrices = [0, -1, -0.0001];

      for (const price of badPrices) {
        await expect(
          sep38.fetchPeggedQuote({
            ticker: 'NVDA',
            sellAmountUsdc: '100.00',
            binanceRefPriceUsd: price,
            simulatedDexPriceUsd: 145.0,
          })
        ).rejects.toThrow(/Invalid binanceRefPriceUsd/);
      }
    });

    it('rejects zero or negative simulatedDexPriceUsd', async () => {
      const badPrices = [0, -1, -0.0001];

      for (const price of badPrices) {
        await expect(
          sep38.fetchPeggedQuote({
            ticker: 'NVDA',
            sellAmountUsdc: '100.00',
            binanceRefPriceUsd: 145.0,
            simulatedDexPriceUsd: price,
          })
        ).rejects.toThrow(/Invalid stellarDexPriceUsd/);
      }
    });

    it('handles extreme decimal precision without throwing or loss of precision', async () => {
      const highPrecisionAmount = '123.4567890123456789';
      const res = await sep38.fetchPeggedQuote({
        ticker: 'NVDA',
        sellAmountUsdc: highPrecisionAmount,
        binanceRefPriceUsd: 145.123456,
        simulatedDexPriceUsd: 145.123456,
      });

      expect(res.pegDivergenceBps).toBe(0);
      expect(res.isPegged).toBe(true);
      expect(res.estimatedSharesWad).toBeGreaterThan(0n);
    });

    it('handles multi-billion dollar amounts without numeric overflow', async () => {
      const tenBillionUsdc = '10000000000.00';
      const res = await sep38.fetchPeggedQuote({
        ticker: 'AAPL',
        sellAmountUsdc: tenBillionUsdc,
        binanceRefPriceUsd: 200.0,
        simulatedDexPriceUsd: 200.0,
      });

      // 10B / 200 = 50M shares = 50,000,000 * 10^18 WAD
      expect(res.estimatedSharesWad).toBe(50_000_000n * WAD);
      expect(res.action).toBe('HOLD');
    });
  });

  describe('SEP-38 Quote Server API Integration & Error Propagation', () => {
    it('propagates HTTP 400 bad request error from /price endpoint', async () => {
      const mockFetch = async () =>
        new Response(JSON.stringify({ error: 'Unsupported asset pair' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });

      const client = new Sep38Client({
        quoteServer: 'https://quotes.parallax.finance',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(
        client.getPrice({ sellAsset: 'INVALID', buyAsset: 'UNKNOWN' })
      ).rejects.toThrow(/SEP-38 GET \/price failed with status 400/);
    });

    it('propagates HTTP 404 not found error from /prices endpoint', async () => {
      const mockFetch = async () =>
        new Response('Not Found', { status: 404, statusText: 'Not Found' });

      const client = new Sep38Client({
        quoteServer: 'https://quotes.parallax.finance',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(client.getPrices('UNKNOWN_ASSET')).rejects.toThrow(
        /SEP-38 GET \/prices failed with status 404/
      );
    });

    it('propagates HTTP 500 internal server error from /info endpoint', async () => {
      const mockFetch = async () =>
        new Response('Internal Server Error', { status: 500 });

      const client = new Sep38Client({
        quoteServer: 'https://quotes.parallax.finance',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(client.getInfo()).rejects.toThrow(
        /SEP-38 GET \/info failed with status 500/
      );
    });

    it('propagates HTTP 422 unprocessable entity on /quote endpoint', async () => {
      const mockFetch = async () =>
        new Response(JSON.stringify({ error: 'Requested amount exceeds liquidity reserve' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        });

      const client = new Sep38Client({
        quoteServer: 'https://quotes.parallax.finance',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(
        client.requestFirmQuote('jwt-token', {
          sellAsset: 'USDC',
          buyAsset: 'bNVDA',
          sellAmount: '999999999999',
        })
      ).rejects.toThrow(/SEP-38 POST \/quote failed with status 422/);
    });
  });
});
