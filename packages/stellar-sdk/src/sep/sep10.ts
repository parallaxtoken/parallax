/**
 * SEP-10 Stellar Web Authentication Client
 */

import { Keypair, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import { DEFAULT_PARALLAX_DOMAIN, STELLAR_TESTNET_PASSPHRASE } from '../constants.js';
import {
  type Sep10ChallengeResponse,
  type Sep10ClientConfig,
  type Sep10JwtClaims,
  type Sep10ParsedChallenge,
} from '../types.js';

export class Sep10Client {
  public readonly webAuthEndpoint: string;
  public readonly serverSigningKey: string;
  public readonly networkPassphrase: string;
  public readonly homeDomain: string;
  public readonly webAuthDomain: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: Sep10ClientConfig) {
    this.webAuthEndpoint = config.webAuthEndpoint;
    this.serverSigningKey = config.serverSigningKey;
    this.networkPassphrase = config.networkPassphrase ?? STELLAR_TESTNET_PASSPHRASE;
    this.homeDomain = config.homeDomain ?? DEFAULT_PARALLAX_DOMAIN;
    this.webAuthDomain = config.webAuthDomain ?? this.homeDomain;
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Requests an un-signed challenge transaction from the WebAuth server
   */
  public async getChallenge(clientAccount: string): Promise<Sep10ChallengeResponse> {
    const url = new URL(this.webAuthEndpoint);
    url.searchParams.set('account', clientAccount);
    if (this.homeDomain) {
      url.searchParams.set('home_domain', this.homeDomain);
    }

    const res = await this.fetchFn(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`SEP-10 challenge request failed with status ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as Sep10ChallengeResponse;
    if (!data.transaction) {
      throw new Error('SEP-10 challenge response missing "transaction" field');
    }
    return data;
  }

  /**
   * Cryptographically parses and inspects a challenge transaction XDR
   */
  public parseChallenge(challengeXdr: string): Sep10ParsedChallenge {
    const parsed = WebAuth.readChallengeTx(
      challengeXdr,
      this.serverSigningKey,
      this.networkPassphrase,
      this.homeDomain,
      this.webAuthDomain
    );

    let nonce = '';
    for (const op of parsed.tx.operations) {
      if (op.type === 'manageData' && op.name !== 'client_domain') {
        const val = op.value;
        if (typeof val === 'string') {
          nonce = val;
        } else if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
          nonce = Buffer.from(val).toString('base64');
        }
      }
    }

    return {
      clientAccountId: parsed.clientAccountID,
      homeDomain: parsed.matchedHomeDomain,
      nonce,
      minTime: Number(parsed.tx.timeBounds?.minTime ?? 0),
      maxTime: Number(parsed.tx.timeBounds?.maxTime ?? 0),
    };
  }

  /**
   * Signs the challenge transaction using the Freighter browser wallet extension
   */
  public async signChallengeWithFreighter(challengeXdr: string): Promise<string> {
    const g = globalThis as {
      window?: {
        freighter?: {
          signTransaction: (xdr: string, opts: { networkPassphrase: string }) => Promise<string>;
        };
      };
      freighter?: {
        signTransaction: (xdr: string, opts: { networkPassphrase: string }) => Promise<string>;
      };
    };

    const freighter = g.freighter ?? g.window?.freighter;
    if (!freighter) {
      throw new Error(
        'Freighter wallet is not available in the current environment (requires browser extension)'
      );
    }

    return freighter.signTransaction(challengeXdr, {
      networkPassphrase: this.networkPassphrase,
    });
  }

  /**
   * Signs the challenge transaction programmatically using a Stellar secret seed key
   */
  public signChallengeWithSecret(challengeXdr: string, secretKey: string): string {
    const kp = Keypair.fromSecret(secretKey);
    const tx = TransactionBuilder.fromXDR(challengeXdr, this.networkPassphrase);
    tx.sign(kp);
    return tx.toXDR();
  }

  /**
   * Exchanges the client-signed challenge transaction XDR for an authenticated JWT token
   */
  public async getToken(signedChallengeXdr: string): Promise<string> {
    // Attempt standard POST with JSON body
    let res = await this.fetchFn(this.webAuthEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ transaction: signedChallengeXdr }),
    });

    // Fall back to GET with transaction query parameter if POST is not supported
    if (!res.ok && res.status === 405) {
      const url = new URL(this.webAuthEndpoint);
      url.searchParams.set('transaction', signedChallengeXdr);
      res = await this.fetchFn(url.toString(), {
        headers: { Accept: 'application/json' },
      });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`SEP-10 token exchange failed with status ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { token?: string };
    if (!data.token) {
      throw new Error('SEP-10 token response missing "token" property');
    }
    return data.token;
  }

  /**
   * Full end-to-end programmatic authentication: fetches challenge, signs with secret, returns JWT
   */
  public async authenticateWithSecret(secretKey: string): Promise<string> {
    const kp = Keypair.fromSecret(secretKey);
    const challenge = await this.getChallenge(kp.publicKey());
    const signedXdr = this.signChallengeWithSecret(challenge.transaction, secretKey);
    return this.getToken(signedXdr);
  }

  /**
   * Decodes and validates claims of a SEP-10 JWT token
   */
  public verifyJwt(token: string): Sep10JwtClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT: expected header.payload.signature format');
    }

    const payloadBase64 = parts[1]!;
    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const claims = JSON.parse(payloadJson) as Sep10JwtClaims;

    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) {
      throw new Error(`JWT token has expired (exp: ${claims.exp}, now: ${now})`);
    }

    return claims;
  }
}
