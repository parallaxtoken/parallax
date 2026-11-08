import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sellAsset = searchParams.get('sell_asset') ?? '';
  const buyAsset = searchParams.get('buy_asset') ?? '';
  const sellAmount = searchParams.get('sell_amount');
  const buyAmount = searchParams.get('buy_amount');

  let unitPrice = 145.20;
  if (buyAsset.includes('AAPL')) unitPrice = 230.15;
  if (buyAsset.includes('TSLA')) unitPrice = 250.80;
  if (buyAsset.includes('BENJI')) unitPrice = 1.00;

  const feeAmount = '0.10';

  return NextResponse.json(
    {
      total_price: unitPrice.toFixed(4),
      price: unitPrice.toFixed(4),
      fee: {
        total: feeAmount,
        asset: sellAsset,
      },
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

