// D1 persistence helpers for the circuit breaker.
// Safe on non-Cloudflare runtimes where createServerClient() returns null.

import type { CircuitState } from './circuit-breaker';
import type { D1Database } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('circuit-persistence');

export async function saveState(
  db: D1Database | null,
  id: string,
  provider: string,
  state: CircuitState,
  failureCount: number,
  cooldownUntil?: number,
): Promise<void> {
  if (!db) {
    log.warn('D1 unavailable — circuit state not persisted', { id, provider, state });
    return;
  }

  try {
    const sql = `
      INSERT INTO circuit_breaker_state (id, provider, state, failure_count, cooldown_until, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        state = excluded.state,
        failure_count = excluded.failure_count,
        cooldown_until = excluded.cooldown_until,
        updated_at = excluded.updated_at
    `;

    await db.prepare(sql).bind(id, provider, state, failureCount, cooldownUntil ?? null, Date.now()).run();
  } catch (error) {
    log.error('Failed to persist circuit state', error instanceof Error ? error : undefined, { id, provider, state });
  }
}

export interface LoadedCircuitState {
  state: CircuitState;
  failureCount: number;
  cooldownUntil: number | null;
}

export async function loadState(db: D1Database | null, id: string): Promise<LoadedCircuitState | null> {
  if (!db) {
    log.warn('D1 unavailable — circuit state restore skipped', { id });
    return null;
  }

  try {
    const row = await db.prepare('SELECT state, failure_count, cooldown_until FROM circuit_breaker_state WHERE id = ?').bind(id).first<{
      state: string;
      failure_count: number;
      cooldown_until: number | null;
    }>();

    if (!row) return null;

    return {
      state: row.state as CircuitState,
      failureCount: row.failure_count,
      cooldownUntil: row.cooldown_until,
    };
  } catch (error) {
    log.error('Failed to load circuit state', error instanceof Error ? error : undefined, { id });
    return null;
  }
}