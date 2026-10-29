// User-facing bot routes: every operation is bound to the authenticated workspace.
import { NextResponse } from 'next/server';
import { botDetailHandler, botControlHandler, botUpdateConfigHandler } from '@/forest/api/routes';
import { resolveWorkspaceTierContext, workspaceContextErrorResponse } from '@/ee/tenancy/workspace-request-context';

export const dynamicParams = true;
type RouteParams = { params: Promise<{ id: string }> };

async function findAuthorizedBot(req: Request, id: string, write: boolean) {
  const context = await resolveWorkspaceTierContext(req);
  if (write && !['OWNER', 'ADMIN', 'TRADER'].includes(context.role)) {
    return { response: NextResponse.json({ ok: false, error: 'Workspace role cannot modify bots' }, { status: 403 }) } as const;
  }
  const bot = await context.db.prepare('SELECT id, user_id FROM bots WHERE id = ? AND workspace_id = ?')
    .bind(id, context.workspaceId).first<{ id: string; user_id: string }>();
  if (!bot) return { response: NextResponse.json({ ok: false, error: 'Bot not found' }, { status: 404 }) } as const;
  return { context, bot } as const;
}

export async function GET(req: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const access = await findAuthorizedBot(req, id, false);
    if ('response' in access && access.response) return access.response;
    const result = await botDetailHandler(id, access.bot.user_id);
    return NextResponse.json(result, result.ok ? undefined : { status: 503 });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as { action?: unknown };
    if (!['start', 'stop', 'pause', 'resume'].includes(String(body.action))) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid action' }, { status: 400 });
    }
    const access = await findAuthorizedBot(req, id, true);
    if ('response' in access && access.response) return access.response;
    const result = await botControlHandler(id, body.action as 'start' | 'stop' | 'pause' | 'resume', access.bot.user_id);
    return NextResponse.json(result, result.ok ? undefined : { status: 400 });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as { config?: unknown };
    if (!body.config || typeof body.config !== 'object' || Array.isArray(body.config)) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid config object' }, { status: 400 });
    }
    const access = await findAuthorizedBot(req, id, true);
    if ('response' in access && access.response) return access.response;
    const result = await botUpdateConfigHandler(id, body.config as Record<string, number>, access.bot.user_id);
    const status = result.ok ? 200 : (result.error?.includes('not found') ? 404 : 400);
    return NextResponse.json(result, { status });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}
