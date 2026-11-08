import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      deposit: {
        USDC: { enabled: true, min_amount: 1, max_amount: 1000000, fee_fixed: 0 },
        bNVDA: { enabled: true, min_amount: 0.01, fee_fixed: 0 },
        bAAPL: { enabled: true, min_amount: 0.01, fee_fixed: 0 },
        bTSLA: { enabled: true, min_amount: 0.01, fee_fixed: 0 },
        BENJI: { enabled: true, min_amount: 1, fee_fixed: 0 },
      },
      withdraw: {
        USDC: { enabled: true, min_amount: 1, fee_fixed: 0 },
        bNVDA: { enabled: true, min_amount: 0.01, fee_fixed: 0 },
        bAAPL: { enabled: true, min_amount: 0.01, fee_fixed: 0 },
        bTSLA: { enabled: true, min_amount: 0.01, fee_fixed: 0 },
        BENJI: { enabled: true, min_amount: 1, fee_fixed: 0 },
      },
      fee: { enabled: false },
      features: { account_creation: true, claimable_balances: true },
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

