import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sellAsset = searchParams.get('sell_asset') ?? '';

  return NextResponse.json(
    {
      buy_assets: [
        {
          asset: 'stellar:bNVDA:CBG4XKLKV4TPIBCVR5HM4HZG3CSNJPQ3EEYNAXRYJKAXKKP2PYCDOTNG',
          price: '145.20',
          decimals: 7,
        },
        {
          asset: 'stellar:bAAPL:CDYYFXXT4RNVQHIFR3FVUSFSWPFPAUYEI7GVBQHGDVJKVMFL3YLLQHTE',
          price: '230.15',
          decimals: 7,
        },
        {
          asset: 'stellar:bTSLA:CDBPE4Q4RSBQWXYPFAECE5AANQ3BOARNALARQ7CXDS2OYROATR2WLJNO',
          price: '250.80',
          decimals: 7,
        },
        {
          asset: 'stellar:BENJI:CDMWXGFCNMAH2YADWNH2RW5EYK2F72YBFA2U4JKN6QCSUQ34GCQP7MQE',
          price: '1.00',
          decimals: 7,
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

