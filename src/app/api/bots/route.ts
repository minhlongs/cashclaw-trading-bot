// GET /api/bots — list all bots
// POST /api/bots — create a new bot
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
