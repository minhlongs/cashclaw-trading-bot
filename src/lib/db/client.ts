// D1 Database Client Factory
// In Workers: pass env.DB from wrangler.jsonc binding.
// In SSR/local: returns null (caller handles fallback).

import type { D1Database, Env } from './types';

export function createServerClient(env?: Env): D1Database | null {
  if (env?.DB) return env.DB;
  // Local dev SSR fallback — data lives in BotManager in-memory
  return null;
}

export type { D1Database } from './types';
