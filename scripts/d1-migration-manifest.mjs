/**
 * Canonical Main D1 Migration Manifest Builder and Stage Snapshot Reproducer.
 *
 * Builds an authoritative manifest directly from the repository's authorized `migrations/*.sql`
 * directory, recording each migration's ordinal position, numeric prefix, SQL SHA-256,
 * predecessor, destructive table-rebuild targets (e.g., 0012/0018 DROP TABLE bots),
 * and reproducible expected schema snapshot at every prefix stage 0..N.
 */

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSchemaSnapshot, sha256 } from './d1-schema-canonical.mjs';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MIGRATIONS_DIR = path.resolve(SCRIPT_DIR, '../migrations');

const DESTRUCTIVE_REBUILD_REGEX = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`[]?([a-zA-Z0-9_]+)["`\]]?/gi;

export function listSqlMigrations(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

export function extractNumericPrefix(filename) {
  const match = /^(\d{4})_/.exec(filename);
  return match ? match[1] : null;
}

function detectRebuiltTables(sql) {
  const tables = new Set();
  for (const match of sql.matchAll(DESTRUCTIVE_REBUILD_REGEX)) {
    const tbl = String(match[1]);
    if (!tbl.endsWith('_dg_tmp') && !tbl.endsWith('_tmp')) {
      tables.add(tbl);
    }
  }
  return [...tables].sort();
}

/**
 * Builds the canonical migration manifest for a migrations directory and optionally
 * reproduces the expected schema snapshot for each stage 0..N.
 */
export function buildCanonicalMigrationManifest(migrationsDir = DEFAULT_MIGRATIONS_DIR, opts = {}) {
  const includeSnapshots = opts.includeSnapshots ?? true;
  const files = listSqlMigrations(migrationsDir);
  const seenPrefixes = new Map();
  const duplicatePrefixes = [];
  const entries = [];
  const stageSnapshots = new Map();

  let db = null;
  if (includeSnapshots) {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    stageSnapshots.set(0, extractSchemaSnapshot(db, []));
  }

  try {
    const appliedMeta = [];
    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      const fullPath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(fullPath, 'utf8');
      const sqlSha256 = sha256(sql);
      const numericPrefix = extractNumericPrefix(filename);
      if (numericPrefix !== null) {
        if (seenPrefixes.has(numericPrefix)) {
          duplicatePrefixes.push({ prefix: numericPrefix, first: seenPrefixes.get(numericPrefix), duplicate: filename });
        } else {
          seenPrefixes.set(numericPrefix, filename);
        }
      }

      const rebuiltTables = detectRebuiltTables(sql);
      const compatibilityConstraints = [];
      if (rebuiltTables.length > 0) {
        compatibilityConstraints.push(
          `Destructive table rebuild on [${rebuiltTables.join(', ')}]: any extra columns, indexes, triggers, or FKs on these tables would be silently dropped.`,
        );
      }

      let expectedSchemaSha256 = null;
      let reproducible = true;
      let reproducibilityError = null;
      if (db) {
        try {
          db.exec(sql);
          appliedMeta.push({ filename, sha256: sqlSha256 });
          const snap = extractSchemaSnapshot(db, [...appliedMeta]);
          expectedSchemaSha256 = snap.schemaSha256;
          stageSnapshots.set(i + 1, snap);
        } catch (err) {
          reproducible = false;
          reproducibilityError = err instanceof Error ? err.message : String(err);
        }
      }

      entries.push({
        position: i + 1,
        filename,
        numericPrefix,
        sha256: sqlSha256,
        predecessor: i === 0 ? null : files[i - 1],
        rebuiltTables,
        compatibilityConstraints,
        reproducible,
        reproducibilityError,
        expectedSchemaSha256,
      });
    }
  } finally {
    if (db) db.close();
  }

  return {
    migrationsDir: path.resolve(migrationsDir),
    totalMigrations: entries.length,
    duplicatePrefixes,
    entries,
    stageSnapshots,
  };
}

const manifestCache = new Map();

export function getCachedCanonicalManifest(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const key = path.resolve(migrationsDir);
  if (!manifestCache.has(key)) {
    manifestCache.set(key, buildCanonicalMigrationManifest(key, { includeSnapshots: true }));
  }
  return manifestCache.get(key);
}
