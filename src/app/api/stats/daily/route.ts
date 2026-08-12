// GET /api/stats/daily
import { NextResponse } from 'next/server';
import { dailyStatsHandler } from '@/forest/api/routes';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await dailyStatsHandler();
  return NextResponse.json(result);
}
