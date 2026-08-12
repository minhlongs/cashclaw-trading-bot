// GET /api/bots/[id] — bot detail + trades
// POST /api/bots/[id] — control action (start/stop/pause/resume)
import { NextResponse } from 'next/server';
import { botDetailHandler, botControlHandler } from '@/forest/api/routes';

export const dynamicParams = true;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await botDetailHandler(id);
  return NextResponse.json(result);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action as 'start' | 'stop' | 'pause' | 'resume' | undefined;
  if (!action) {
    return NextResponse.json({ ok: false, error: 'Missing action' }, { status: 400 });
  }
  const result = await botControlHandler(id, action);
  return NextResponse.json(result);
}
