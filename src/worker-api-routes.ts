// Cloudflare Workers HTTP API — Route Registration Helpers
// Public status endpoints and protected handlers for bot management,
// killswitch, telemetry, and cron.

import type { Hono } from 'hono';
import { authGuard } from './forest/api/auth-guard';
import {
  botListHandler, botDetailHandler, botControlHandler,
  killswitchHaltHandler, killswitchResumeHandler,
  eventsHandler, dailyStatsHandler,
} from './forest/api/routes';
import { BotQueryService } from './forest/bot/d1-adapter';
import { BotScheduler } from './forest/bot/scheduler';
import { createLogger } from './lib/logger';
import type { WorkerEnv } from './worker-env';
import type { D1Database } from './lib/db/types';

const logger = createLogger('worker');

const defaultKillswitch = {
  enabled: true, halted: false, haltReason: null, haltedAt: null,
  dailyPnl: 0, consecutiveLosses: 0, currentDrawdown: 0,
};

type AppType = Hono<{ Bindings: WorkerEnv }>;

export function registerPublicStatusRoutes(app: AppType): void {
  app.get('/api/health', async (c) => {
    const bots = await new BotQueryService().listBots();
    return c.json({
      status: 'ok',
      bots: bots.length,
      running: bots.filter((bot) => bot.status === 'running').length,
      timestamp: Date.now(),
    });
  });

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
}

export function registerProtectedRoutes(app: AppType): void {
  app.use('/internal/api/bots/*', authGuard());
  app.use('/api/killswitch/*', authGuard());
  app.use('/api/cron/*', authGuard());

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

  app.post('/api/killswitch/halt', async (c) => {
    const body = await c.req.parseBody();
    const r = await killswitchHaltHandler(typeof body.reason === 'string' ? body.reason : '');
    return c.json(r, r.ok ? 200 : 400);
  });
  app.post('/api/killswitch/resume', async (c) => {
    const r = await killswitchResumeHandler();
    return c.json(r, r.ok ? 200 : 500);
  });

  app.get('/api/events', async (c) => {
    const limit = parseInt(c.req.query('limit') ?? '50', 10);
    const r = await eventsHandler(c.req.query('botId') ?? undefined, limit);
    return c.json(r, r.ok ? 200 : 500);
  });
  app.get('/api/stats/daily', async (c) => {
    const r = await dailyStatsHandler();
    return c.json(r, r.ok ? 200 : 500);
  });

  app.post('/api/cron/eval', async (c) => {
    return c.json(await new BotScheduler().tick());
  });
}
