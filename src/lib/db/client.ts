// D1 Database Client Factory
// Uses OpenNext Cloudflare context to access env.DB binding.
// Returns null in local dev SSR (caller handles fallback).

import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database } from './types';

export function createServerClient(): D1Database | null {
  try {
    const { env } = getCloudflareContext();
    return (env as unknown as { DB?: D1Database })?.DB ?? null;
  } catch {
    // Local dev or outside Workers context — fallback to null
    return null;
  }
}

export type { D1Database } from './types';
