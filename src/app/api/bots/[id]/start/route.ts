// POST /api/bots/[id]/start
import { NextResponse } from 'next/server';
import { botControlHandler } from '@/forest/api/routes';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await botControlHandler(id, 'start');
  return NextResponse.json(result);
}
