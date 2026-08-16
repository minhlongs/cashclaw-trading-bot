// GET /api/health — system health status with operational probes
// Used by monitoring dashboard and uptime checks
// Checks: DB, CircuitBreaker (via D1 query), RateLimiter (module probe)
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';
import { checkRateLimit } from '@/forest/api/rate-limiter';

const startTime = Date.now();

type CircuitBreakerStatus = 'ok' | 'degraded' | 'unavailable';
type RateLimiterStatus = 'ok' | 'unavailable';
type OverallStatus = 'ok' | 'degraded';

interface HealthResponse {
  status: OverallStatus;
  timestamp: number;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    db: 'ok' | 'unavailable';
    circuitBreaker: CircuitBreakerStatus;
    rateLimiter: RateLimiterStatus;
  };
}

async function probeDb(db: ReturnType<typeof createServerClient>): Promise<boolean> {
  if (!db) return false;
  try {
    await db.prepare('SELECT 1').first();
    return true;
  } catch {
    return false;
  }
}

async function probeCircuitBreaker(db: ReturnType<typeof createServerClient>): Promise<{ ok: boolean; error?: string }> {
  if (!db) return { ok: false, error: 'DB client unavailable' };
  try {
    const row = await db
      .prepare("SELECT state FROM circuit_breaker_state WHERE state != 'closed' LIMIT 1")
      .first<{ state: string }>();
    return { ok: !row };
  } catch {
    // Table may not exist or query failure — not a critical error
    return { ok: false, error: 'circuit_breaker_state unavailable' };
  }
}

function probeRateLimiter(): { ok: boolean; error?: string } {
  try {
    const result = checkRateLimit('health-probe');
    return { ok: result !== null && typeof result.allowed === 'boolean' };
  } catch {
    return { ok: false, error: 'rate limiter module unavailable' };
  }
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const db = createServerClient();

  const dbOk = await probeDb(db);
  const cbResult = await probeCircuitBreaker(db);
  const rlResult = probeRateLimiter();

  const circuitBreaker: CircuitBreakerStatus = cbResult.ok
    ? 'ok'
    : !db
      ? 'unavailable'
      : 'degraded';

  const rateLimiter: RateLimiterStatus = rlResult.ok ? 'ok' : 'unavailable';

  const overallStatus: OverallStatus = dbOk && circuitBreaker === 'ok' ? 'ok' : 'degraded';

  return NextResponse.json({
    status: overallStatus,
    timestamp: Date.now(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {
      db: dbOk ? 'ok' : 'unavailable',
      circuitBreaker,
      rateLimiter,
    },
  });
}
