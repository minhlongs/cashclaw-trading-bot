// GET /api/health — returns system health status
// Used by monitoring dashboard and uptime checks
// Includes D1 connectivity check and uptime report
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';

const startTime = Date.now();

export async function GET() {
  const db = createServerClient();
  let dbOk = false;
  if (db) {
    try {
      await db.prepare('SELECT 1').first();
      dbOk = true;
    } catch {
      dbOk = false;
    }
  }

  return NextResponse.json({
    status: dbOk ? 'ok' : 'degraded',
    timestamp: Date.now(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {
      db: dbOk ? 'ok' : 'unavailable',
    },
  });
}