// GET /api/bots/[id] — bot detail + trades (user-facing, session-cookie auth)
// POST /api/bots/[id] — control action (start/stop/pause/resume) (user-facing)
// PATCH /api/bots/[id] — update bot configuration (user-facing)
//
// Operator/CLI access via Bearer token lives in src/worker.ts → /internal/api/bots.
import { NextResponse } from 'next/server';
import { botDetailHandler, botControlHandler, botUpdateConfigHandler } from '@/forest/api/routes';

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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { config?: Record<string, number> };
  if (!body.config || typeof body.config !== 'object' || Array.isArray(body.config)) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid config object' }, { status: 400 });
  }
  const result = await botUpdateConfigHandler(id, body.config);
  const status = result.ok ? 200 : (result.error?.includes('not found') ? 404 : 400);
  return NextResponse.json(result, { status });
}
