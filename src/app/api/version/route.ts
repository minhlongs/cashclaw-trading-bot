// GET /api/version — returns deployment version and build info
// Used by monitoring and health checks to verify deployment state
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'CashClaw AI Trading Bot Platform',
    version: process.env.npm_package_version || '1.0.0',
    shortSha: process.env.GIT_COMMIT_SHA?.substring(0, 8) || 'dev',
    fullSha: process.env.GIT_COMMIT_SHA || 'dev',
    buildTime: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    region: process.env.CF_WORKER_REGION || 'unknown',
  });
}
