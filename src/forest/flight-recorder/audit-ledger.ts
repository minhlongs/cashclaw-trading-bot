// Hash-chained audit ledger for flight-recorder.
// Appends audit entries with prev_hash -> hash chain in D1 via existing trade_events table.
// Vibe-Trading pattern: append-only + fsync (represented here as await insert).

import { createServerClient } from '@/lib/db/client';

export interface AuditEntry {
  readonly action: string;
  readonly userId?: string;
  readonly botId?: string;
  readonly detailJson?: string;
}

export interface LedgerTail {
  readonly hash: string;
  readonly prevHash: string | null;
  readonly createdAt: string;
}

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS audit_ledger (
  id TEXT PRIMARY KEY,
  prev_hash TEXT,
  hash TEXT NOT NULL,
  action TEXT NOT NULL,
  user_id TEXT,
  bot_id TEXT,
  detail_json TEXT,
  created_at INTEGER NOT NULL
)
`;

const CREATE_INDEX = `CREATE INDEX IF NOT EXISTS idx_audit_ledger_hash ON audit_ledger(hash)`;

function buildAuditSqlVarNames(): string {
  return `
${CREATE_TABLE};
${CREATE_INDEX};
`;
}

export async function ensureAuditLedgerSchema(db: ReturnType<typeof createServerClient>): Promise<void> {
  if (!db) return;
  await db.batch(buildAuditSqlVarNames().split(';').filter(Boolean).map((sql) => db.prepare(sql.trim())));
}

async function computeHash(prevHash: string | null, payload: string): Promise<string> {
  const data = `${prevHash ?? ''}\n${payload}`;
  const encoded = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function appendAudit(entry: AuditEntry): Promise<LedgerTail> {
  const db = createServerClient();
  if (!db) {
    return { hash: '', prevHash: null, createdAt: '' };
  }

  const prev = await db
    .prepare('SELECT hash, created_at FROM audit_ledger ORDER BY created_at DESC LIMIT 1')
    .first<{ hash: string; created_at: string }>();

  const prevHash = prev?.hash ?? null;
  const payload = `${entry.action}\n${entry.userId ?? ''}\n${entry.botId ?? ''}\n${entry.detailJson ?? ''}`;
  const hash = await computeHash(prevHash, payload);
  const createdAt = new Date().toISOString();
  const id = `audit_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  await db.prepare(
    `INSERT INTO audit_ledger (id, prev_hash, hash, action, user_id, bot_id, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, prevHash, hash, entry.action, entry.userId ?? null, entry.botId ?? null, entry.detailJson ?? null, createdAt);

  return { hash, prevHash, createdAt };
}