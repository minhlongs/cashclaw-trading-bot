// Cloudflare Workers entry point — CashClaw Trading Bot Platform
// Hono app serving API routes + CF Cron eval trigger.
// Deployed via: wrangler deploy (main: src/worker.ts)

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

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

type Env = {
  DB: unknown; // D1Database — typed at deploy time via wrangler
  ADMIN_TOKEN?: string; // Bearer token for auth guard
  VERSION?: string; // Git SHA injected at deploy time
  ASSETS: { fetch: (request: Request) => Promise<Response> }; // Static assets binding
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
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
  } catch {
    // Asset not found, fall through to API routes
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
  } catch {
    return c.json({ ok: true, data: { version: '0.0.0-dev', shortSha: '0000000' } }, 200);
  }
});

// ── Protected routes middleware — BEFORE route definitions ──────────────────────
app.use('/api/bots/*', authGuard());
app.use('/api/killswitch/*', authGuard());
app.use('/api/cron/*', authGuard());

// ── API routes ──────────────────────────────────────────────────
app.get('/api/bots', async (c) => {
  const result = await botListHandler();
  return c.json(result, result.ok ? 200 : 500);
});

app.get('/api/bots/:id', async (c) => {
  const id = c.req.param('id');
  const result = await botDetailHandler(id);
  return c.json(result, result.ok ? 200 : 404);
});

app.post('/api/bots/:id/:action', async (c) => {
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
