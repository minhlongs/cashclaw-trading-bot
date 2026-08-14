// Cloudflare Workers entry point — CashClaw Trading Bot Platform
// Hono app serving system/infrastructure API routes + CF Cron eval trigger.
// Deployed via: wrangler deploy (main: src/worker.ts)
//
// ── API surface split ──────────────────────────────────────────
// This worker handles routes that run OUTSIDE Next.js middleware:
//   - /internal/api/bots/*    — operator-only bot management (Bearer token)
//   - /api/killswitch/*       — emergency halt / resume
//   - /api/events             — system event telemetry
//   - /api/stats/daily        — daily P&L / trade stats
//   - /api/cron/eval          — CF Cron trigger for eval loop
//   - /api/health, /api/version — infra probes
//
// User-facing APIs live in src/app/api/ (Next.js App Router):
//   - /api/bots/*             — user-facing bot CRUD (session cookie auth)
//   - /api/auth/*             — login, logout, session check
//   - /api/settings           — exchange creds, risk limits
//
// The /api/bots path is served by Next.js (has session-cookie auth guards).
// Hono uses /internal/api/bots to avoid route collision.
// ────────────────────────────────────────────────────────────────

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { createLogger } from './lib/logger';

import {
  botListHandler,
  botDetailHandler,
  botControlHandler,
  killswitchHaltHandler,
  killswitchResumeHandler,
  eventsHandler,
  dailyStatsHandler,
} from './forest/api/routes';

import { authGuard } from './forest/api/auth-guard';
import { getBotManager } from './tree/bot';
import { BotScheduler } from './forest/bot/scheduler';

const logger = createLogger('worker');

type Env = {
  DB: unknown; // D1Database — typed at deploy time via wrangler
  ADMIN_TOKEN?: string; // Bearer token for auth guard
  VERSION?: string; // Git SHA injected at deploy time
  ASSETS: { fetch: (request: Request) => Promise<Response> }; // Static assets binding
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', honoLogger());
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use('*', prettyJSON());

// Static file serving from Next.js export (out/ directory)
app.use('*', async (c, next) => {
  const path = c.req.path;

  // Skip API routes and internal paths
  if (path.startsWith('/api/') || path.startsWith('/_next/') || path === '/favicon.ico') {
    return next();
  }

  try {
    // Use CF Workers ASSETS binding to serve static files
    const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
    if (assetResponse.ok) {
      return assetResponse;
    }
  } catch (error) {
    // Asset not found, fall through to API routes
    logger.warn('Asset fetch failed, falling through', { action: 'static-assets', error: error instanceof Error ? error.message : String(error) });
  }

  return next();
});

// Health check
app.get('/api/health', (c) => {
  const manager = getBotManager();
  return c.json({
    status: 'ok',
    bots: manager.getAllBots().length,
    running: manager.getRunningBots().length,
    timestamp: Date.now(),
  });
});

// ── Version ──────────────────────────────────────────────────────
app.get('/api/version', (c) => {
  try {
    const version = c.env.VERSION ?? process.env.VERSION;
    if (version) {
      const shortSha = version.slice(0, 7);
      return c.json({ ok: true, data: { version, shortSha } });
    }
    return c.json(
      { ok: true, data: { version: '0.0.0-dev', shortSha: '0000000' } },
      200,
    );
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error('Failed to read version', err, { action: 'get-version' });
    return c.json({ ok: true, data: { version: '0.0.0-dev', shortSha: '0000000' } }, 200);
  }
});

// ── Protected routes middleware — BEFORE route definitions ──────────────────────
// NOTE: /api/bots/* is intentionally NOT here — it is served by Next.js App Router
// (src/app/api/bots/) with session-cookie auth guards via src/middleware.ts.
// Hono uses /internal/api/bots/* for operator/CLI access with Bearer token auth.
app.use('/internal/api/bots/*', authGuard());
app.use('/api/killswitch/*', authGuard());
app.use('/api/cron/*', authGuard());

// ── Operator bot management (internal) ──────────────────────────
// These duplicate /api/bots handlers for direct Worker/CLI access.
// User-facing /api/bots lives in src/app/api/bots/ (Next.js, session auth).
app.get('/internal/api/bots', async (c) => {
  const result = await botListHandler();
  return c.json(result, result.ok ? 200 : 500);
});

app.get('/internal/api/bots/:id', async (c) => {
  const id = c.req.param('id');
  const result = await botDetailHandler(id);
  return c.json(result, result.ok ? 200 : 404);
});

app.post('/internal/api/bots/:id/:action', async (c) => {
  const id = c.req.param('id');
  const action = c.req.param('action');
  if (!['start', 'stop', 'pause', 'resume'].includes(action ?? '')) {
    return c.json({ ok: false, error: 'Invalid action' }, 400);
  }
  const result = await botControlHandler(id, action as 'start' | 'stop' | 'pause' | 'resume');
  return c.json(result, result.ok ? 200 : 500);
});

app.post('/api/killswitch/halt', async (c) => {
  const body = await c.req.parseBody();
  const reason = typeof body.reason === 'string' ? body.reason : '';
  const result = await killswitchHaltHandler(reason);
  return c.json(result, result.ok ? 200 : 400);
});

app.post('/api/killswitch/resume', async (c) => {
  const result = await killswitchResumeHandler();
  return c.json(result, result.ok ? 200 : 500);
});


app.get('/api/events', async (c) => {
  const botId = c.req.query('botId') ?? undefined;
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const result = await eventsHandler(botId, limit);
  return c.json(result, result.ok ? 200 : 500);
});

app.get('/api/stats/daily', async (c) => {
  const result = await dailyStatsHandler();
  return c.json(result, result.ok ? 200 : 500);
});

// ── CF Cron: bot eval loop ──────────────────────────────────────
app.post('/api/cron/eval', async (c) => {
  const scheduler = new BotScheduler();
  const report = await scheduler.tick();
  return c.json(report);
});

// ── 404 ─────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// ── Error handler ───────────────────────────────────────────────
app.onError((err, c) => {
  return c.json({ error: err.message ?? 'Internal error' }, 500);
});

export default app;
