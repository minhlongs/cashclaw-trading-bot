// GET /api/bots — list all bots (user-facing, session-cookie auth via middleware)
// POST /api/bots — create a new bot (user-facing, session-cookie auth via middleware)
//
// This is the canonical /api/bots for end users.
// Operator/CLI access via Bearer token lives in src/worker.ts → /internal/api/bots.
import { NextResponse } from 'next/server';
import { botListHandler, botCreateHandler, type CreateBotPayload } from '@/forest/api/routes';


export async function GET() {
  const result = await botListHandler();
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CreateBotPayload;
  const result = await botCreateHandler(body);
  return NextResponse.json(result, result.ok ? undefined : { status: 400 });
}
