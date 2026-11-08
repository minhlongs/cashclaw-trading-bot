// GET /api/bots/[id] — bot detail + trades (user-facing, session-cookie auth)
// POST /api/bots/[id] — control action (start/stop/pause/resume) (user-facing)
// PATCH /api/bots/[id] — update bot configuration (user-facing)
//
// Operator/CLI access via Bearer token lives in src/worker.ts → /internal/api/bots.
import { NextResponse } from 'next/server';
import { botDetailHandler, botControlHandler, botUpdateConfigHandler } from '@/forest/api/routes';

export const dynamicParams = true;

function sessionUserId(req: Request): string | undefined {
  return req.headers.get('x-user-id')?.trim() || undefined;
}

/** A bot the caller cannot see must be indistinguishable from a bot that does
 *  not exist, so a cross-tenant probe learns nothing about another tenant. */
function notFoundStatus(error: string | undefined): number | undefined {
  return error && error.toLowerCase().includes('not found') ? 404 : undefined;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = sessionUserId(req);
  const result = userId ? await botDetailHandler(id, userId) : await botDetailHandler(id);
  if (!result.ok) {
    const status = notFoundStatus(result.error);
    if (status) return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action as 'start' | 'stop' | 'pause' | 'resume' | undefined;
  if (!action) {
    return NextResponse.json({ ok: false, error: 'Missing action' }, { status: 400 });
  }
  const userId = sessionUserId(req);
  const result = userId
    ? await botControlHandler(id, action, userId)
    : await botControlHandler(id, action);
  if (!result.ok) {
    const status = notFoundStatus(result.error);
    if (status) return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { config?: Record<string, number> };
  if (!body.config || typeof body.config !== 'object' || Array.isArray(body.config)) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid config object' }, { status: 400 });
  }
  const userId = sessionUserId(req);
  const result = userId
    ? await botUpdateConfigHandler(id, body.config, userId)
    : await botUpdateConfigHandler(id, body.config);
  const status = result.ok ? 200 : (notFoundStatus(result.error) ?? 400);
  return NextResponse.json(result, { status });
}
