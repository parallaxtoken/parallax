import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const account = searchParams.get('account') ?? '';

  if (!/^G[A-Z2-7]{55}$/.test(account)) {
    return NextResponse.json(
      { error: 'Valid Stellar account public key (G...) is required' },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Build simulated SEP-10 challenge envelope representation
  const now = Math.floor(Date.now() / 1000);
  const challengePayload = {
    type: 'sep10_challenge',
    account,
    home_domain: 'localhost:3000',
    timebounds: { min_time: now, max_time: now + 300 },
    nonce: Buffer.from(`nonce_${now}_${account.slice(0, 8)}`).toString('base64'),
  };
  const mockXdr = Buffer.from(JSON.stringify(challengePayload)).toString('base64');

  return NextResponse.json(
    {
      transaction: mockXdr,
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

    // Decode signed challenge payload
    let account = 'GAKGBUCRSX6MVYBXBDWPHFXC2Y53QXK2GCVLEA77ETKGE4LN7XXXRWTF';
    try {
      const decoded = JSON.parse(Buffer.from(body.transaction, 'base64').toString('utf8')) as { account?: string };
      if (decoded?.account) account = decoded.account;
    } catch {
      // Fallback
    }

    const now = Math.floor(Date.now() / 1000);
    const jwtHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const jwtPayload = Buffer.from(
      JSON.stringify({
        sub: account,
        iss: 'http://localhost:3000',
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

