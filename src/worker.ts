// Cloudflare Workers entry point — CashClaw Trading Bot Platform
// Facade re-exporting Hono app, handleApiRequest, scheduled cron, and environment types.
import { app, handleApiRequest } from './worker-api';
import { scheduled } from './worker-cron';
import type { WorkerEnv, Env } from './worker-env';
import type { ScheduledEvent, ExportedHandler } from './worker-types';

export type { WorkerEnv, Env, ScheduledEvent, ExportedHandler };
export { scheduled, handleApiRequest };

// Attach scheduled to Hono instance for runtime environments reading default.scheduled
(app as unknown as { scheduled: typeof scheduled }).scheduled = scheduled;

export default app;
