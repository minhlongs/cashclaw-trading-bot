// GET /api/events?botId=X&limit=50
import { NextResponse } from 'next/server';
import { eventsHandler } from '@/forest/api/routes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const botId = url.searchParams.get('botId') ?? undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  const result = await eventsHandler(botId, limit);
  return NextResponse.json(result);
}
