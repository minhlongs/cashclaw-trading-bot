// Cloudflare Worker Environment Bindings definition
import type { D1Database } from '@/lib/db/types';

export interface WorkerEnv {
  DB: D1Database | unknown;
  ADMIN_TOKEN?: string;
  VERSION?: string;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  ALLOWED_ORIGINS?: string;
  MICRO_INGEST_ENABLED?: string;
  MICRO_INGEST_SYMBOLS?: string;
}

export type Env = WorkerEnv;
