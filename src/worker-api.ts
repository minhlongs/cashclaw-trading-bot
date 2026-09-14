// Cloudflare Workers HTTP API router & handlers — CashClaw Trading Bot Platform
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { createLogger } from './lib/logger';
import {
  botListHandler, botDetailHandler, botControlHandler,
  killswitchHaltHandler, killswitchResumeHandler,
  eventsHandler, dailyStatsHandler,
} from './forest/api/routes';
import { authGuard } from './forest/api/auth-guard';
import { BotQueryService } from './forest/bot/d1-adapter';
import { BotScheduler } from './forest/bot/scheduler';
import type { WorkerEnv } from './worker-env';
import type { D1Database } from './lib/db/types';

const logger = createLogger('worker');
export const app = new Hono<{ Bindings: WorkerEnv }>();

app.use('*', honoLogger());
app.use('*', cors({
  origin: (origin, c) => {
    const allowed = (c.env as WorkerEnv).ALLOWED_ORIGINS;
    if (!allowed) return origin || '*';
    const list = allowed.split(',').map((s) => s.trim());
    return origin && list.includes(origin) ? origin : list[0] || '*';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use('*', prettyJSON());

// Static file serving from Next.js export via ASSETS binding
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (path.startsWith('/api/') || path.startsWith('/_next/') || path === '/favicon.ico') return next();
  try {
    const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
    if (assetResponse.ok) return assetResponse;
  } catch (error) {
    logger.warn('Asset fetch failed, falling through', {
      action: 'static-assets',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return next();
});

// Health check
app.get('/api/health', async (c) => {
  const bots = await new BotQueryService().listBots();
  return c.json({
    status: 'ok',
    bots: bots.length,
    running: bots.filter((bot) => bot.status === 'running').length,
    timestamp: Date.now(),
  });
});

// Version check
app.get('/api/version', (c) => {
  try {
    const v = c.env.VERSION ?? process.env.VERSION;
    if (v) return c.json({ ok: true, data: { version: v, shortSha: v.slice(0, 7) } });
    return c.json({ ok: true, data: { version: '0.0.0-dev', shortSha: '0000000' } }, 200);
  } catch (e) {
    logger.error('Failed to read version', e instanceof Error ? e : new Error(String(e)), { action: 'get-version' });
    return c.json({ ok: true, data: { version: '0.0.0-dev', shortSha: '0000000' } }, 200);
  }
});

// Killswitch safety status
const defaultKillswitch = {
  enabled: true, halted: false, haltReason: null, haltedAt: null,
  dailyPnl: 0, consecutiveLosses: 0, currentDrawdown: 0,
};
app.get('/api/killswitch-status', async (c) => {
  try {
    if (c.env.DB) {
      const { findSettingsByUser } = await import('./lib/db/repositories');
      const s = await findSettingsByUser(c.env.DB as D1Database, null);
      if (s) {
        const enabled = s.killswitch_enabled === 1;
        return c.json({
          ...defaultKillswitch, enabled, halted: !enabled,
          haltReason: s.killswitch_reason ?? null, haltedAt: s.killswitch_triggered_at ?? null, timestamp: Date.now(),
        });
      }
    }
  } catch { /* fallback */ }
  return c.json({ ...defaultKillswitch, timestamp: Date.now() });
});

// Protected routes middleware (Bearer token)
app.use('/internal/api/bots/*', authGuard());
app.use('/api/killswitch/*', authGuard());
app.use('/api/cron/*', authGuard());

// Operator bot management (internal)
app.get('/internal/api/bots', async (c) => {
  const r = await botListHandler();
  return c.json(r, r.ok ? 200 : 500);
});
app.get('/internal/api/bots/:id', async (c) => {
  const r = await botDetailHandler(c.req.param('id'));
  return c.json(r, r.ok ? 200 : 404);
});
app.post('/internal/api/bots/:id/:action', async (c) => {
  const action = c.req.param('action');
  if (!['start', 'stop', 'pause', 'resume'].includes(action ?? '')) {
    return c.json({ ok: false, error: 'Invalid action' }, 400);
  }
  const r = await botControlHandler(c.req.param('id'), action as 'start' | 'stop' | 'pause' | 'resume');
  return c.json(r, r.ok ? 200 : 500);
});

// Emergency killswitch
app.post('/api/killswitch/halt', async (c) => {
  const body = await c.req.parseBody();
  const r = await killswitchHaltHandler(typeof body.reason === 'string' ? body.reason : '');
  return c.json(r, r.ok ? 200 : 400);
});
app.post('/api/killswitch/resume', async (c) => {
  const r = await killswitchResumeHandler();
  return c.json(r, r.ok ? 200 : 500);
});

// Telemetry & stats
app.get('/api/events', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const r = await eventsHandler(c.req.query('botId') ?? undefined, limit);
  return c.json(r, r.ok ? 200 : 500);
});
app.get('/api/stats/daily', async (c) => {
  const r = await dailyStatsHandler();
  return c.json(r, r.ok ? 200 : 500);
});

// CF Cron trigger eval
app.post('/api/cron/eval', async (c) => c.json(await new BotScheduler().tick()));

// Error & fallback handling
app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => c.json({ error: err.message ?? 'Internal error' }, 500));

export async function handleApiRequest(request: Request, env: WorkerEnv, ctx?: ExecutionContext): Promise<Response> {
  return app.fetch(request, env, ctx);
}
