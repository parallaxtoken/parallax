import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** A2A agent card for the Parallax planner and certificate seller. */
export async function GET(req: Request) {
  const origin = process.env.PUBLIC_WEB_ORIGIN ?? new URL(req.url).origin;
  return NextResponse.json({
    name: 'Parallax',
    description: 'Real shares per dollar for tokenized stocks on Stellar (Soroban) & Multi-chain. Wrappers quote. Shares decide.',
    url: `${origin}/api/mcp`,
    version: '0.1.0',
    provider: { organization: 'Parallax' },
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: [
      { id: 'parallax_shelf', name: 'Shelf', description: 'Every wrapper of a ticker with unit, route and net premium, in shares.' },
      { id: 'parallax_decompose', name: 'Decompose', description: 'Split a wrapper price into gross, unit and net.' },
      { id: 'parallax_best_route', name: 'Best route', description: 'The wrapper that delivers the most shares for an amount.' },
      { id: 'parallax_verify_fill', name: 'Verify fill', description: 'Recompute a fill from chain logs.' },
      { id: 'parallax_session', name: 'Session', description: 'Market session and reference age for a ticker.' },
    ],
    identity: null,
    payments: { standard: 'x402', endpoint: `${origin}/api/certificate` },
  });
}
