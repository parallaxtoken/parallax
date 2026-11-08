import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      assets: [
        {
          asset: 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
          decimals: 7,
          significant_decimals: 2,
        },
        {
          asset: 'stellar:bNVDA:CBG4XKLKV4TPIBCVR5HM4HZG3CSNJPQ3EEYNAXRYJKAXKKP2PYCDOTNG',
          decimals: 7,
          significant_decimals: 4,
        },
        {
          asset: 'stellar:bAAPL:CDYYFXXT4RNVQHIFR3FVUSFSWPFPAUYEI7GVBQHGDVJKVMFL3YLLQHTE',
          decimals: 7,
          significant_decimals: 4,
        },
        {
          asset: 'stellar:bTSLA:CDBPE4Q4RSBQWXYPFAECE5AANQ3BOARNALARQ7CXDS2OYROATR2WLJNO',
          decimals: 7,
          significant_decimals: 4,
        },
        {
          asset: 'stellar:BENJI:CDMWXGFCNMAH2YADWNH2RW5EYK2F72YBFA2U4JKN6QCSUQ34GCQP7MQE',
          decimals: 7,
          significant_decimals: 2,
        },
      ],
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    }
  );
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

