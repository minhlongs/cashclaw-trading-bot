#!/usr/bin/env node
/**
 * Deterministic Canonical D1 Schema Snapshot, Diff, and Fail-Closed Lineage Preflight Tool.
 *
 * Usage:
 *   node scripts/d1-schema-diff.mjs snapshot <migrations-dir>
 *   node scripts/d1-schema-diff.mjs manifest [migrations-dir]
 *   node scripts/d1-schema-diff.mjs diff <dirA> <dirB>
 *   node scripts/d1-schema-diff.mjs preflight <sqlite-db-path> [migrations-dir]
 *
 * Security Invariant:
 *   Unknown schema != safe schema. Only SAFE_SUPPORTED_LINEAGE returns
 *   `safeToApplyMainMigrations: true` and CLI exit code 0. Every other state
 *   fails closed with `safeToApplyMainMigrations: false` and CLI exit code 2.
 */

import { createRequire } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  extractSchemaSnapshot,
  diffSchemaSnapshots,
  normalizeSqlForComparison,
} from './d1-schema-canonical.mjs';
import {
  DEFAULT_MIGRATIONS_DIR,
  buildCanonicalMigrationManifest,
  extractNumericPrefix,
  getCachedCanonicalManifest,
} from './d1-migration-manifest.mjs';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

export {
  extractSchemaSnapshot,
  diffSchemaSnapshots,
  normalizeSqlForComparison,
  buildCanonicalMigrationManifest,
  DEFAULT_MIGRATIONS_DIR,
};

export const PREFLIGHT_STATUS = Object.freeze({
  SAFE_SUPPORTED_LINEAGE: 'SAFE_SUPPORTED_LINEAGE',
  BLOCK_UNKNOWN_MIGRATION: 'BLOCK_UNKNOWN_MIGRATION',
  BLOCK_MIGRATION_ORDER: 'BLOCK_MIGRATION_ORDER',
  BLOCK_SCHEMA_DRIFT: 'BLOCK_SCHEMA_DRIFT',
  BLOCK_DESTRUCTIVE_OBJECT_LOSS: 'BLOCK_DESTRUCTIVE_OBJECT_LOSS',
  BLOCK_LEGACY_LINEAGE_COLLISION: 'BLOCK_LEGACY_LINEAGE_COLLISION',
  BLOCK_UNVERIFIABLE_STATE: 'BLOCK_UNVERIFIABLE_STATE',
});

const PR35_MARKER_TABLES = new Set([
  'ops_action_attempts',
  'ops_approval_events',
  'saas_alert_dispatch_log',
  'saas_bot_create_reservations',
  'saas_bot_tick_leases',
  'saas_entitlement_recovery_audit',
  'saas_nowpayments_ipn_event_history',
  'saas_payment_orders',
  'saas_workspace_memberships',
  'saas_workspaces',
]);

const D1_HISTORY_LIMITATION_NOTE =
  'Wrangler d1_migrations records only (id, name, applied_at) and does NOT store executed SQL hashes. ' +
  'Lineage validation therefore combines exact canonical filename-prefix verification with complete live ' +
  'structural schema differencing against the reproduced canonical stage snapshot; backup provenance ' +
  'remains an independent operational requirement.';

export function buildSnapshotFromMigrationsDir(dir) {
  const manifest = buildCanonicalMigrationManifest(dir, { includeSnapshots: true });
  const finalSnap = manifest.stageSnapshots.get(manifest.totalMigrations);
  if (!finalSnap) {
    throw new Error(`Failed to reproduce final schema snapshot for migrations directory: ${dir}`);
  }
  return finalSnap;
}

function readAppliedMigrations(db, hasD1MigrationsTable) {
  if (!hasD1MigrationsTable) {
    return { present: false, schemaValid: false, rows: [], names: [], error: null };
  }
  try {
    const colRows = db.prepare('PRAGMA table_info("d1_migrations")').all();
    const cols = colRows.map((c) => String(c.name));
    if (cols.length !== 3 || !cols.includes('id') || !cols.includes('name') || !cols.includes('applied_at')) {
      return {
        present: true,
        schemaValid: false,
        rows: [],
        names: [],
        error: `d1_migrations table does not match Wrangler canonical columns (id, name, applied_at); found: [${cols.join(', ')}]`,
      };
    }
    const rawRows = db.prepare('SELECT id, name FROM d1_migrations ORDER BY id ASC').all();
    const seenIds = new Set();
    const rows = [];
    for (const r of rawRows) {
      if (typeof r.id !== 'number' || !Number.isInteger(r.id)) {
        return {
          present: true,
          schemaValid: false,
          rows: [],
          names: [],
          error: `d1_migrations contains non-integer or NULL id value (${String(r.id)})`,
        };
      }
      if (seenIds.has(r.id)) {
        return {
          present: true,
          schemaValid: false,
          rows: [],
          names: [],
          error: `d1_migrations contains duplicate id value (${r.id})`,
        };
      }
      seenIds.add(r.id);
      rows.push({
        id: r.id,
        name: r.name === null || r.name === undefined ? '' : String(r.name),
      });
    }
    return { present: true, schemaValid: true, rows, names: rows.map((r) => r.name), error: null };
  } catch (err) {
    return {
      present: true,
      schemaValid: false,
      rows: [],
      names: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function validateAppliedMigrationPrefix(appliedNames, manifest) {
  const canonicalNames = manifest.entries.map((e) => e.filename);
  const canonicalNameSet = new Set(canonicalNames);
  const canonicalByPrefix = new Map();
  for (const e of manifest.entries) {
    if (e.numericPrefix) canonicalByPrefix.set(e.numericPrefix, e.filename);
  }

  const seen = new Set();
  const duplicates = [];
  const unknownMigrations = [];
  const collidingMigrations = [];

  for (const name of appliedNames) {
    if (!name || name.trim() === '') {
      unknownMigrations.push('<empty>');
      continue;
    }
    if (seen.has(name)) {
      duplicates.push(name);
    } else {
      seen.add(name);
    }
    if (!canonicalNameSet.has(name)) {
      const prefix = extractNumericPrefix(name);
      if (prefix && canonicalByPrefix.has(prefix)) {
        collidingMigrations.push({
          observed: name,
          canonicalWithSamePrefix: canonicalByPrefix.get(prefix),
          prefix,
        });
      } else {
        unknownMigrations.push(name);
      }
    }
  }

  if (collidingMigrations.length > 0) {
    return {
      ok: false,
      status: PREFLIGHT_STATUS.BLOCK_LEGACY_LINEAGE_COLLISION,
      stageIndex: null,
      duplicates,
      unknownMigrations,
      collidingMigrations,
      missingMigrations: [],
      reason:
        `Applied migration history contains numeric-prefix collision(s) with canonical main migrations: ` +
        collidingMigrations.map((c) => `${c.observed} collides with ${c.canonicalWithSamePrefix}`).join('; '),
    };
  }

  if (unknownMigrations.length > 0) {
    return {
      ok: false,
      status: PREFLIGHT_STATUS.BLOCK_UNKNOWN_MIGRATION,
      stageIndex: null,
      duplicates,
      unknownMigrations,
      collidingMigrations,
      missingMigrations: [],
      reason: `Applied migration history contains unrecognized migration(s): ${unknownMigrations.join(', ')}`,
    };
  }

  if (duplicates.length > 0) {
    return {
      ok: false,
      status: PREFLIGHT_STATUS.BLOCK_MIGRATION_ORDER,
      stageIndex: null,
      duplicates,
      unknownMigrations,
      collidingMigrations,
      missingMigrations: [],
      reason: `Applied migration history contains duplicate migration identity/identities: ${duplicates.join(', ')}`,
    };
  }

  if (appliedNames.length > canonicalNames.length) {
    return {
      ok: false,
      status: PREFLIGHT_STATUS.BLOCK_MIGRATION_ORDER,
      stageIndex: null,
      duplicates,
      unknownMigrations,
      collidingMigrations,
      missingMigrations: [],
      reason: `Applied migration count (${appliedNames.length}) exceeds canonical main lineage (${canonicalNames.length}).`,
    };
  }

  const missingMigrations = [];
  for (let i = 0; i < appliedNames.length; i++) {
    if (appliedNames[i] !== canonicalNames[i]) {
      const appliedSet = new Set(appliedNames);
      for (let j = 0; j < canonicalNames.length; j++) {
        const expected = canonicalNames[j];
        if (!appliedSet.has(expected) && j < Math.max(appliedNames.length, canonicalNames.indexOf(appliedNames[i]))) {
          missingMigrations.push(expected);
        }
      }
      return {
        ok: false,
        status: PREFLIGHT_STATUS.BLOCK_MIGRATION_ORDER,
        stageIndex: null,
        duplicates,
        unknownMigrations,
        collidingMigrations,
        missingMigrations,
        reason: `Applied migration history diverges from canonical prefix at position ${i + 1}: expected '${canonicalNames[i]}', observed '${appliedNames[i]}'.`,
      };
    }
  }

  return {
    ok: true,
    status: PREFLIGHT_STATUS.SAFE_SUPPORTED_LINEAGE,
    stageIndex: appliedNames.length,
    duplicates: [],
    unknownMigrations: [],
    collidingMigrations: [],
    missingMigrations: [],
    reason: null,
  };
}

function classifyDriftBlockStatus(diff, pendingEntries, hasBotsWorkspaceId, pr35TablesFound) {
  const rebuiltTablesByPending = new Map();
  for (const entry of pendingEntries) {
    for (const tbl of entry.rebuiltTables) {
      if (!rebuiltTablesByPending.has(tbl)) rebuiltTablesByPending.set(tbl, []);
      rebuiltTablesByPending.get(tbl).push(entry.filename);
    }
  }

  const destructiveMatches = [];
  for (const obj of diff.changedObjects) {
    if (obj.table && rebuiltTablesByPending.has(obj.table)) {
      destructiveMatches.push({
        object: obj,
        destructiveMigrations: rebuiltTablesByPending.get(obj.table),
      });
    }
  }

  if (pr35TablesFound.length > 0 || (hasBotsWorkspaceId && rebuiltTablesByPending.has('bots'))) {
    if (destructiveMatches.length > 0 && pr35TablesFound.length === 0) {
      return {
        status: PREFLIGHT_STATUS.BLOCK_DESTRUCTIVE_OBJECT_LOSS,
        relevantDestructiveMigrations: [...new Set(destructiveMatches.flatMap((m) => m.destructiveMigrations))],
        destructiveMatches,
      };
    }
    return {
      status: PREFLIGHT_STATUS.BLOCK_LEGACY_LINEAGE_COLLISION,
      relevantDestructiveMigrations: [...new Set(destructiveMatches.flatMap((m) => m.destructiveMigrations))],
      destructiveMatches,
    };
  }

  if (destructiveMatches.length > 0) {
    return {
      status: PREFLIGHT_STATUS.BLOCK_DESTRUCTIVE_OBJECT_LOSS,
      relevantDestructiveMigrations: [...new Set(destructiveMatches.flatMap((m) => m.destructiveMigrations))],
      destructiveMatches,
    };
  }

  return {
    status: PREFLIGHT_STATUS.BLOCK_SCHEMA_DRIFT,
    relevantDestructiveMigrations: [],
    destructiveMatches: [],
  };
}

function buildResult(fields) {
  const safe = fields.status === PREFLIGHT_STATUS.SAFE_SUPPORTED_LINEAGE;
  return {
    status: fields.status,
    safeToApplyMainMigrations: safe,
    observedStage: fields.observedStage,
    expectedStage: fields.expectedStage,
    hasBotsWorkspaceId: fields.hasBotsWorkspaceId,
    hasH3Maker: fields.hasH3Maker,
    pr35TablesFound: fields.pr35TablesFound,
    appliedMigrations: fields.appliedMigrations,
    pendingMigrations: fields.pendingMigrations,
    schemaSha256: fields.observedSchemaSha256,
    expectedSchemaSha256: fields.expectedSchemaSha256,
    blockers: fields.blockers,
    diagnostics: {
      missingMigrations: fields.missingMigrations ?? [],
      extraOrUnknownMigrations: fields.extraOrUnknownMigrations ?? [],
      collidingMigrations: fields.collidingMigrations ?? [],
      duplicateMigrations: fields.duplicateMigrations ?? [],
      changedObjects: fields.changedObjects ?? [],
      relevantDestructiveMigrations: fields.relevantDestructiveMigrations ?? [],
      historyEvidenceLimitation: D1_HISTORY_LIMITATION_NOTE,
      requiredNextHumanDecision: fields.requiredNextHumanDecision,
    },
  };
}

export function preflightDatabaseForMainMigrations(dbPath, migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  let manifest;
  try {
    manifest = getCachedCanonicalManifest(migrationsDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return buildResult({
      status: PREFLIGHT_STATUS.BLOCK_UNVERIFIABLE_STATE,
      observedStage: 'unverifiable',
      expectedStage: 'unverifiable',
      hasBotsWorkspaceId: false,
      hasH3Maker: false,
      pr35TablesFound: [],
      appliedMigrations: [],
      pendingMigrations: [],
      observedSchemaSha256: null,
      expectedSchemaSha256: null,
      blockers: [`Unable to load canonical migration manifest from "${migrationsDir}": ${msg}`],
      requiredNextHumanDecision: 'Verify canonical migrations directory path and readability before retrying preflight.',
    });
  }
  if (manifest.duplicatePrefixes.length > 0) {
    return buildResult({
      status: PREFLIGHT_STATUS.BLOCK_UNVERIFIABLE_STATE,
      observedStage: 'unverifiable',
      expectedStage: 'unverifiable',
      hasBotsWorkspaceId: false,
      hasH3Maker: false,
      pr35TablesFound: [],
      appliedMigrations: [],
      pendingMigrations: [],
      observedSchemaSha256: null,
      expectedSchemaSha256: null,
      blockers: [
        `Canonical migrations directory has intra-directory numeric prefix collision(s): ${JSON.stringify(manifest.duplicatePrefixes)}`,
      ],
      requiredNextHumanDecision: 'Resolve duplicate migration prefixes in repository migrations/ before running preflight.',
    });
  }

  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return buildResult({
      status: PREFLIGHT_STATUS.BLOCK_UNVERIFIABLE_STATE,
      observedStage: 'unverifiable',
      expectedStage: `stage_${manifest.totalMigrations}`,
      hasBotsWorkspaceId: false,
      hasH3Maker: false,
      pr35TablesFound: [],
      appliedMigrations: [],
      pendingMigrations: [],
      observedSchemaSha256: null,
      expectedSchemaSha256: null,
      blockers: [`Unable to open target SQLite database read-only (${dbPath}): ${msg}`],
      requiredNextHumanDecision: 'Verify target database path, file permissions, and SQLite integrity before retrying.',
    });
  }

  try {
    const snap = extractSchemaSnapshot(db);
    const hasBotsWorkspaceId = Boolean(snap.tables.bots?.columns.some((c) => c.name === 'workspace_id'));
    const hasH3Maker = Boolean(snap.tables.bots?.sql.toLowerCase().includes('h3_maker'));
    const pr35TablesFound = Object.keys(snap.tables).filter((t) => PR35_MARKER_TABLES.has(t));
    const userTableNames = Object.keys(snap.tables);
    const userObjectCount = userTableNames.length + snap.triggers.length + snap.views.length;
    const history = readAppliedMigrations(db, snap.hasD1MigrationsTable);
    const allMainNames = manifest.entries.map((e) => e.filename);

    // 0. Internal D1 table spoofing / tamper check (_cf_METADATA, d1_migrations)
    if (snap.internalTableViolations && snap.internalTableViolations.length > 0) {
      return buildResult({
        status: PREFLIGHT_STATUS.BLOCK_SCHEMA_DRIFT,
        observedStage: 'internal_table_drift',
        expectedStage: 'canonical_d1_internal_tables',
        hasBotsWorkspaceId,
        hasH3Maker,
        pr35TablesFound,
        appliedMigrations: history.names,
        pendingMigrations: [],
        observedSchemaSha256: snap.schemaSha256,
        expectedSchemaSha256: null,
        blockers: snap.internalTableViolations.map((v) => `BLOCK_SCHEMA_DRIFT: ${v}`),
        changedObjects: snap.internalTableViolations.map((v) => ({
          kind: 'internal_table_violation',
          object: 'internal_d1_table',
          detail: v,
        })),
        requiredNextHumanDecision:
          'Investigate non-canonical _cf_METADATA or d1_migrations table definitions before applying any migration.',
      });
    }

    // 1. Fresh pristine empty database (0 application tables/triggers/views and 0 applied migrations)
    if (userObjectCount === 0 && (!history.present || (history.schemaValid && history.names.length === 0))) {
      const freshSnap = manifest.stageSnapshots.get(0);
      return buildResult({
        status: PREFLIGHT_STATUS.SAFE_SUPPORTED_LINEAGE,
        observedStage: 'fresh',
        expectedStage: 'fresh',
        hasBotsWorkspaceId: false,
        hasH3Maker: false,
        pr35TablesFound: [],
        appliedMigrations: [],
        pendingMigrations: allMainNames,
        observedSchemaSha256: snap.schemaSha256,
        expectedSchemaSha256: freshSnap?.schemaSha256 ?? null,
        blockers: [],
        requiredNextHumanDecision: 'None — pristine empty database is eligible for canonical fresh-install migrations (0001..latest).',
      });
    }

    // 2. Populated database without valid d1_migrations history
    if (!history.present || !history.schemaValid) {
      const blockers = [];
      if (pr35TablesFound.length > 0 || hasBotsWorkspaceId) {
        if (hasBotsWorkspaceId) {
          blockers.push(
            'BLOCK_LEGACY_LINEAGE_COLLISION: Target database has bots.workspace_id without valid canonical d1_migrations history. Applying main 0018 would recreate bots via bots_dg_tmp and silently drop workspace_id.',
          );
        }
        if (pr35TablesFound.length > 0) {
          blockers.push(
            `BLOCK_LEGACY_LINEAGE_COLLISION: Target database contains PR #35-lineage tables (${pr35TablesFound.join(', ')}) without valid canonical d1_migrations history.`,
          );
        }
        return buildResult({
          status: PREFLIGHT_STATUS.BLOCK_LEGACY_LINEAGE_COLLISION,
          observedStage: 'missing_d1_migrations',
          expectedStage: 'canonical_prefix_with_d1_migrations',
          hasBotsWorkspaceId,
          hasH3Maker,
          pr35TablesFound,
          appliedMigrations: [],
          pendingMigrations: allMainNames,
          observedSchemaSha256: snap.schemaSha256,
          expectedSchemaSha256: null,
          blockers,
          requiredNextHumanDecision:
            'Do NOT apply main migrations. Take a verified backup and reconcile PR #35 lineage via an explicitly reviewed forward-only migration plan.',
        });
      }
      blockers.push(
        history.error
          ? `BLOCK_UNVERIFIABLE_STATE: Invalid d1_migrations table: ${history.error}`
          : `BLOCK_UNVERIFIABLE_STATE: Database has ${userObjectCount} application schema object(s) (${userTableNames.slice(0, 5).join(', ')}${userTableNames.length > 5 ? ', ...' : ''}) but no d1_migrations history table.`,
      );
      return buildResult({
        status: PREFLIGHT_STATUS.BLOCK_UNVERIFIABLE_STATE,
        observedStage: 'missing_d1_migrations',
        expectedStage: 'canonical_prefix_with_d1_migrations',
        hasBotsWorkspaceId,
        hasH3Maker,
        pr35TablesFound,
        appliedMigrations: [],
        pendingMigrations: allMainNames,
        observedSchemaSha256: snap.schemaSha256,
        expectedSchemaSha256: null,
        blockers,
        requiredNextHumanDecision:
          'Refuse automatic migration. Independently verify database provenance and establish a validated bootstrap/import record before applying migrations.',
      });
    }

    // 3. Validate d1_migrations forms an exact ordered prefix of canonical main migrations
    const prefixCheck = validateAppliedMigrationPrefix(history.names, manifest);
    if (!prefixCheck.ok) {
      return buildResult({
        status: prefixCheck.status,
        observedStage: `unrecognized_history(${history.names.length})`,
        expectedStage: `canonical_prefix(0..${manifest.totalMigrations})`,
        hasBotsWorkspaceId,
        hasH3Maker,
        pr35TablesFound,
        appliedMigrations: history.names,
        pendingMigrations: [],
        observedSchemaSha256: snap.schemaSha256,
        expectedSchemaSha256: null,
        blockers: [`${prefixCheck.status}: ${prefixCheck.reason}`],
        missingMigrations: prefixCheck.missingMigrations,
        extraOrUnknownMigrations: prefixCheck.unknownMigrations,
        collidingMigrations: prefixCheck.collidingMigrations,
        duplicateMigrations: prefixCheck.duplicates,
        requiredNextHumanDecision:
          'Do NOT apply main migrations. Audit d1_migrations history against canonical migrations/ and reconcile lineage under Founder approval.',
      });
    }

    // 4. Verify canonical stage snapshot was reliably reproduced
    const stageIndex = prefixCheck.stageIndex;
    const stageLabel = stageIndex === 0 ? 'fresh' : `post_${manifest.entries[stageIndex - 1].numericPrefix ?? stageIndex}`;
    const expectedSnap = manifest.stageSnapshots.get(stageIndex);
    const stageEntry = stageIndex > 0 ? manifest.entries[stageIndex - 1] : null;
    if (!expectedSnap || (stageEntry && !stageEntry.reproducible)) {
      return buildResult({
        status: PREFLIGHT_STATUS.BLOCK_UNVERIFIABLE_STATE,
        observedStage: stageLabel,
        expectedStage: stageLabel,
        hasBotsWorkspaceId,
        hasH3Maker,
        pr35TablesFound,
        appliedMigrations: history.names,
        pendingMigrations: allMainNames.slice(stageIndex),
        observedSchemaSha256: snap.schemaSha256,
        expectedSchemaSha256: null,
        blockers: [
          `BLOCK_UNVERIFIABLE_STATE: Expected canonical schema snapshot for stage '${stageLabel}' could not be reproduced cleanly (${stageEntry?.reproducibilityError ?? 'missing snapshot'}).`,
        ],
        requiredNextHumanDecision: 'Investigate non-reproducible migration stage before allowing automated preflight.',
      });
    }

    // 5. Complete structural diff between expected canonical stage snapshot and observed live database
    const diff = diffSchemaSnapshots(expectedSnap, snap);
    const pendingEntries = manifest.entries.slice(stageIndex);
    const pendingNames = pendingEntries.map((e) => e.filename);

    if (diff.hasStructuralDrift || expectedSnap.schemaSha256 !== snap.schemaSha256) {
      const classification = classifyDriftBlockStatus(diff, pendingEntries, hasBotsWorkspaceId, pr35TablesFound);
      const blockers = [];

      if (classification.status === PREFLIGHT_STATUS.BLOCK_DESTRUCTIVE_OBJECT_LOSS) {
        const affectedNames = classification.destructiveMatches.map((m) => `${m.object.name} (${m.object.reason})`).join(', ');
        blockers.push(
          `BLOCK_DESTRUCTIVE_OBJECT_LOSS: Pending destructive migration(s) [${classification.relevantDestructiveMigrations.join(', ')}] would erase or corrupt drifted schema object(s): ${affectedNames}.`,
        );
      } else if (classification.status === PREFLIGHT_STATUS.BLOCK_LEGACY_LINEAGE_COLLISION) {
        blockers.push(
          `BLOCK_LEGACY_LINEAGE_COLLISION: Live schema diverges from canonical stage '${stageLabel}' with PR #35 lineage artifacts (bots.workspace_id=${hasBotsWorkspaceId}, tables=[${pr35TablesFound.join(', ')}], totalChangedObjects=${diff.changedObjects.length}).`,
        );
      } else {
        const summary = diff.changedObjects
          .slice(0, 10)
          .map((o) => `${o.objectType}:${o.name}(${o.reason})`)
          .join(', ');
        blockers.push(
          `BLOCK_SCHEMA_DRIFT: Live schema at stage '${stageLabel}' diverges from canonical snapshot (${diff.changedObjects.length} changed object(s): ${summary}${diff.changedObjects.length > 10 ? ', ...' : ''}).`,
        );
      }

      return buildResult({
        status: classification.status,
        observedStage: stageLabel,
        expectedStage: stageLabel,
        hasBotsWorkspaceId,
        hasH3Maker,
        pr35TablesFound,
        appliedMigrations: history.names,
        pendingMigrations: pendingNames,
        observedSchemaSha256: snap.schemaSha256,
        expectedSchemaSha256: expectedSnap.schemaSha256,
        blockers,
        changedObjects: diff.changedObjects,
        relevantDestructiveMigrations: classification.relevantDestructiveMigrations,
        requiredNextHumanDecision:
          classification.status === PREFLIGHT_STATUS.BLOCK_DESTRUCTIVE_OBJECT_LOSS
            ? `Do NOT run [${classification.relevantDestructiveMigrations.join(', ')}]. Inspect drifted objects on the rebuilt table, take a verified backup, and author a preserving migration.`
            : 'Do NOT apply main migrations. Inspect changedObjects against canonical stage schema and resolve drift under Founder approval.',
      });
    }

    // 6. Exact canonical prefix + zero structural drift -> SAFE_SUPPORTED_LINEAGE
    return buildResult({
      status: PREFLIGHT_STATUS.SAFE_SUPPORTED_LINEAGE,
      observedStage: stageLabel,
      expectedStage: stageLabel,
      hasBotsWorkspaceId,
      hasH3Maker,
      pr35TablesFound,
      appliedMigrations: history.names,
      pendingMigrations: pendingNames,
      observedSchemaSha256: snap.schemaSha256,
      expectedSchemaSha256: expectedSnap.schemaSha256,
      blockers: [],
      requiredNextHumanDecision:
        pendingNames.length === 0
          ? 'None — database matches canonical latest stage with zero structural drift.'
          : `Eligible for Founder-authorized apply of ${pendingNames.length} pending canonical migration(s): [${pendingNames.join(', ')}].`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return buildResult({
      status: PREFLIGHT_STATUS.BLOCK_UNVERIFIABLE_STATE,
      observedStage: 'unverifiable',
      expectedStage: `stage_${manifest.totalMigrations}`,
      hasBotsWorkspaceId: false,
      hasH3Maker: false,
      pr35TablesFound: [],
      appliedMigrations: [],
      pendingMigrations: [],
      observedSchemaSha256: null,
      expectedSchemaSha256: null,
      blockers: [`BLOCK_UNVERIFIABLE_STATE: Failed to inspect target SQLite database (${dbPath}): ${msg}`],
      requiredNextHumanDecision:
        'Target file is corrupted, unreadable, or not a valid SQLite database. Verify backup integrity before retrying.',
    });
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , cmd, arg1, arg2] = process.argv;
  if (cmd === 'snapshot' && arg1) {
    process.stdout.write(`${JSON.stringify(buildSnapshotFromMigrationsDir(arg1), null, 2)}\n`);
  } else if (cmd === 'manifest') {
    const manifest = buildCanonicalMigrationManifest(arg1 || DEFAULT_MIGRATIONS_DIR, { includeSnapshots: true });
    process.stdout.write(
      `${JSON.stringify({ migrationsDir: manifest.migrationsDir, totalMigrations: manifest.totalMigrations, duplicatePrefixes: manifest.duplicatePrefixes, entries: manifest.entries }, null, 2)}\n`,
    );
  } else if (cmd === 'diff' && arg1 && arg2) {
    const snapA = buildSnapshotFromMigrationsDir(arg1);
    const snapB = buildSnapshotFromMigrationsDir(arg2);
    process.stdout.write(`${JSON.stringify(diffSchemaSnapshots(snapA, snapB), null, 2)}\n`);
  } else if (cmd === 'preflight' && arg1) {
    const res = preflightDatabaseForMainMigrations(arg1, arg2 || DEFAULT_MIGRATIONS_DIR);
    process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
    process.exit(res.safeToApplyMainMigrations ? 0 : 2);
  } else {
    process.stderr.write(
      'Usage: node scripts/d1-schema-diff.mjs <snapshot|manifest|diff|preflight> [arg1] [arg2]\n',
    );
    process.exit(1);
  }
}
