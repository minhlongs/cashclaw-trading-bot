import { NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitHeaders } from '@/forest/api/rate-limiter';
import { createLogger } from '@/lib/logger';
import { SettingsSchema } from './schema';
import { getMaskedSettings, dispatchSettingsUpdate } from './handlers';

const logger = createLogger('api-settings');

export async function GET() {
  try {
    return NextResponse.json({ ok: true, data: await getMaskedSettings() });
  } catch (e) {
    logger.error('Failed to load settings', e instanceof Error ? e : new Error(String(e)), { action: 'get-settings' });
    return NextResponse.json({ ok: false, error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const rateLimit = checkRateLimit('settings:update');
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: 'Rate limit exceeded' }, { status: 429, headers: getRateLimitHeaders(rateLimit) });
  }
  try {
    const parsed = SettingsSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 });
    const result = await dispatchSettingsUpdate(parsed.data);
    return NextResponse.json(result, result.ok ? undefined : { status: 400 });
  } catch (e) {
    logger.error('Settings update failed', e instanceof Error ? e : new Error(String(e)), { action: 'update-settings' });
    return NextResponse.json({ ok: false, error: 'Settings update failed' }, { status: 500 });
  }
}
