// POST /api/killswitch/halt — halt all bots
import { NextResponse } from 'next/server';
import { killswitchHaltHandler } from '@/forest/api/routes';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const result = await killswitchHaltHandler(body.reason ?? 'Manual halt from admin panel');
  return NextResponse.json(result);
}
