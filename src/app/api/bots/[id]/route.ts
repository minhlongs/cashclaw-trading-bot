// GET /api/bots/[id] — bot detail
import { NextResponse } from 'next/server';
import { botDetailHandler } from '@/forest/api/routes';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await botDetailHandler(id);
  return NextResponse.json(result, result.ok ? undefined : { status: 404 });
}
