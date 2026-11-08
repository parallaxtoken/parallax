import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ operation: string }> }
) {
  const { operation } = await params;
  const { searchParams } = new URL(req.url);
  const assetCode = searchParams.get('asset_code') ?? 'USDC';
  const account = searchParams.get('account') ?? '';

  if (!['deposit', 'withdraw'].includes(operation.toLowerCase())) {
    return NextResponse.json(
      { error: 'Invalid operation: must be deposit or withdraw' },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const txId = `sep24_${operation}_${Date.now()}`;
  return NextResponse.json(
    {
      type: 'interactive_customer_info_needed',
      url: `http://localhost:3000/onboard/sep24?transaction_id=${txId}&asset_code=${assetCode}&account=${account}`,
      id: txId,
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

