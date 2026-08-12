// Agent Metadata Endpoint — /.well-known/agent.json
// Public discovery document for external dashboards.
// Returns bot metadata: name, version, strategies — no secrets exposed.

import { NextResponse } from 'next/server';

const AGENT_METADATA = {
  name: 'CashClaw AI Trading Bot',
  version: '1.0.0',
  description: 'AI-driven crypto trading bot platform (paper mode)',
  strategies: ['grid', 'mean_reversion'],
  capabilities: {
    paper_trading: true,
    live_trading: false,
    killswitch: true,
  },
  endpoints: {
    health: '/api/health',
    version: '/api/version',
  },
} as const;

export async function GET() {
  return NextResponse.json(AGENT_METADATA, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
