import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sell_asset: string;
      buy_asset: string;
      sell_amount?: string;
      buy_amount?: string;
    };

    if (!body?.sell_asset || !body?.buy_asset) {
      return NextResponse.json(
        { error: 'Missing sell_asset or buy_asset' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    let unitPrice = 145.20;
    if (body.buy_asset.includes('AAPL')) unitPrice = 230.15;
    if (body.buy_asset.includes('TSLA')) unitPrice = 250.80;
    if (body.buy_asset.includes('BENJI')) unitPrice = 1.00;

    const sellAmountNum = parseFloat(body.sell_amount ?? '145.20');
    const buyAmountNum = (sellAmountNum / unitPrice).toFixed(6);

    const now = Date.now();
    return NextResponse.json(
      {
        id: `sep38_quote_${now}`,
        expires_at: new Date(now + 60000).toISOString(),
        total_price: unitPrice.toFixed(4),
        price: unitPrice.toFixed(4),
        sell_asset: body.sell_asset,
        sell_amount: sellAmountNum.toFixed(4),
        buy_asset: body.buy_asset,
        buy_amount: buyAmountNum,
        fee: {
          total: '0.20',
          asset: body.sell_asset,
        },
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
      }
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

