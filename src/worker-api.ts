// Cloudflare Workers HTTP API router & handlers — CashClaw Trading Bot Platform
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { createLogger } from './lib/logger';
import type { WorkerEnv } from './worker-env';
import { registerPublicStatusRoutes, registerProtectedRoutes } from './worker-api-routes';

const logger = createLogger('worker');
export const app = new Hono<{ Bindings: WorkerEnv }>();
export type HonoApp = typeof app;

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

registerPublicStatusRoutes(app);
registerProtectedRoutes(app);

// Error & fallback handling
app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => c.json({ error: err.message ?? 'Internal error' }, 500));

export async function handleApiRequest(request: Request, env: WorkerEnv, ctx?: ExecutionContext): Promise<Response> {
  return app.fetch(request, env, ctx);
}
