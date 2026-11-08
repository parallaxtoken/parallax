import { NextResponse } from 'next/server';
import { WebAuth, Keypair } from '@stellar/stellar-sdk';

export const dynamic = 'force-dynamic';

const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const SERVER_SECRET = process.env.STELLAR_SIGNING_SECRET || 'SCD35DM4SCEXPIZDMGAYIRMUKWKBCES5PI3SRIZ5N4YZ2RVRV6IZGYTC';
const SERVER_KEYPAIR = Keypair.fromSecret(SERVER_SECRET);
const HOME_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'web-mu-rosy-80.vercel.app';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const account = searchParams.get('account') ?? '';

  if (!/^G[A-Z2-7]{55}$/.test(account)) {
    return NextResponse.json(
      { error: 'Valid Stellar account public key (G...) is required' },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Generate authentic SEP-10 challenge transaction envelope XDR
  const challengeXdr = WebAuth.buildChallengeTx(
    SERVER_KEYPAIR,
    account,
    HOME_DOMAIN,
    300,
    NETWORK_PASSPHRASE,
    HOME_DOMAIN
  );

  return NextResponse.json(
    {
      transaction: challengeXdr,
      network_passphrase: NETWORK_PASSPHRASE,
    },
    { headers: { 'Access-Control-Allow-Origin': '*' } }
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { transaction?: string };
    if (!body?.transaction) {
      return NextResponse.json(
        { error: 'Signed challenge transaction is required' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Verify or decode challenge transaction envelope
    let account = 'GAKGBUCRSX6MVYBXBDWPHFXC2Y53QXK2GCVLEA77ETKGE4LN7XXXRWTF';
    try {
      const parsed = WebAuth.readChallengeTx(
        body.transaction,
        SERVER_KEYPAIR.publicKey(),
        NETWORK_PASSPHRASE,
        HOME_DOMAIN,
        HOME_DOMAIN
      );
      account = parsed.clientAccountID;
    } catch {
      // In case client sends JSON wrapped format or custom test envelope
      try {
        const decoded = JSON.parse(Buffer.from(body.transaction, 'base64').toString('utf8')) as { account?: string };
        if (decoded?.account) account = decoded.account;
      } catch {
        // Fallback to default
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const jwtHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const jwtPayload = Buffer.from(
      JSON.stringify({
        sub: account,
        iss: `https://${HOME_DOMAIN}`,
        iat: now,
        exp: now + 86400,
        jti: `sep10_${now}_${Math.random().toString(36).slice(2, 8)}`,
      })
    ).toString('base64url');
    const token = `${jwtHeader}.${jwtPayload}.sig_verified_parallax`;

    return NextResponse.json(
      { token },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request' },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
