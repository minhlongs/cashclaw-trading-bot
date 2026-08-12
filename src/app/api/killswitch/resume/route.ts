// POST /api/killswitch/resume — resume trading
import { NextResponse } from 'next/server';
import { killswitchResumeHandler } from '@/forest/api/routes';

export const dynamic = 'force-dynamic';

export async function POST() {
  const result = await killswitchResumeHandler();
  return NextResponse.json(result);
}
