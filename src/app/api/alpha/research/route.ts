// POST /api/alpha/research — Run an alpha research pipeline job (paper-only)
//
// Accepts a symbol + timeframe, fetches OHLCV candles from a public exchange,
// runs the full AlphaResearchPipeline, and returns the structured report as JSON.
//
// Auth: session-cookie, enforced by middleware (PROTECTED_API_PREFIXES includes
// /api/alpha). No auth logic lives in this handler — matches the /api/bots pattern.
//
// Paper-only by design: this route never touches order execution. It only reads
// public market data and runs deterministic research.
import { NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitHeaders } from '@/forest/api/rate-limiter';
import { ResearchRequestSchema, PIPELINE_TIMEOUT_MS } from './research-schema';
import { executeResearchRun } from './research-runner';

export async function POST(req: Request) {
  // Rate limit — pipeline runs are expensive (network + CPU), so a tight limit.
  const rateLimit = checkRateLimit('alpha:research', {
    windowMs: 60_000,
    maxRequests: 5,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  // Validate request body.
  const raw = await req.json().catch(() => ({}));
  const parsed = ResearchRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map(i => i.message).join(', ') },
      { status: 400 },
    );
  }

  const result = await executeResearchRun(parsed.data, PIPELINE_TIMEOUT_MS);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status ?? 500 },
    );
  }

  return NextResponse.json({ ok: true, report: result.report });
}
