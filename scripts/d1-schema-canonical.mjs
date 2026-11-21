/**
 * Canonical SQLite / D1 Schema Snapshot Extraction and Complete Structural Differencing.
 *
 * Captures tables (PRAGMA table_xinfo + canonical DDL), indexes (PRAGMA index_xinfo + sqlite_master.sql),
 * foreign keys (PRAGMA foreign_key_list with composite ordering and ON UPDATE/DELETE/MATCH),
 * triggers, and views. Excludes internal SQLite/D1 bookkeeping tables (sqlite_*, d1_migrations, _cf_METADATA)
 * from application schema comparison so real Wrangler D1 databases match canonical :memory: snapshots.
 */

import { createHash } from 'node:crypto';

export const INTERNAL_D1_TABLES = new Set(['d1_migrations', '_cf_METADATA']);

export function quoteIdent(id) {
  return `"${String(id).replace(/"/g, '""')}"`;
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function stripSqlLineCommentsOutsideQuotes(sql) {
  let out = '';
  let i = 0;
  const len = sql.length;
  while (i < len) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < len) {
        const next = sql[i];
        out += next;
        i += 1;
        if (next === quote) {
          if (i < len && sql[i] === quote) {
            out += sql[i];
            i += 1;
          } else {
            break;
          }
        }
      }
    } else if (ch === '-' && i + 1 < len && sql[i + 1] === '-') {
      i += 2;
      while (i < len && sql[i] !== '\n') i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/**
 * Normalizes benign SQL formatting whitespace only, preserving all semantic tokens:
 * identifiers, literals, CHECK/UNIQUE/DEFAULT constraints, partial-index WHERE predicates,
 * COLLATE rules, ASC/DESC sort order, expressions, trigger bodies, and FK actions.
 */
export function normalizeSqlForComparison(sql) {
  if (typeof sql !== 'string') return '';
  return stripSqlLineCommentsOutsideQuotes(sql.replace(/\r\n/g, '\n'))
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*,\s*/g, ', ')
    .replace(/;\s*$/, '')
    .trim();
}

function extractTableForeignKeys(db, qName) {
  const rows = db.prepare(`PRAGMA foreign_key_list(${qName})`).all();
  const grouped = new Map();
  for (const r of rows) {
    const id = Number(r.id);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push({
      seq: Number(r.seq),
      table: String(r.table),
      from: String(r.from),
      to: r.to === null || r.to === undefined ? null : String(r.to),
      onUpdate: String(r.on_update ?? 'NO ACTION'),
      onDelete: String(r.on_delete ?? 'NO ACTION'),
      match: String(r.match ?? 'NONE'),
    });
  }

  return [...grouped.values()]
    .map((group) => {
      group.sort((a, b) => a.seq - b.seq);
      return {
        table: group[0].table,
        from: group.map((g) => g.from),
        to: group.map((g) => g.to),
        onUpdate: group[0].onUpdate,
        onDelete: group[0].onDelete,
        match: group[0].match,
      };
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function extractTableIndexes(db, qName, indexSqlByName) {
  return db
    .prepare(`PRAGMA index_list(${qName})`)
    .all()
    .map((idx) => {
      const idxName = String(idx.name);
      const xinfo = db
        .prepare(`PRAGMA index_xinfo(${quoteIdent(idxName)})`)
        .all()
        .sort((a, b) => Number(a.seqno) - Number(b.seqno))
        .map((ic) => ({
          seqno: Number(ic.seqno),
          cid: Number(ic.cid),
          name: ic.name === null || ic.name === undefined ? null : String(ic.name),
          desc: Number(ic.desc) === 1,
          coll: String(ic.coll ?? 'BINARY'),
          key: Number(ic.key) === 1,
        }));
      const rawSql = indexSqlByName.get(idxName) ?? null;
      return {
        name: idxName,
        unique: Number(idx.unique) === 1,
        origin: String(idx.origin),
        partial: Number(idx.partial) === 1,
        columns: xinfo.filter((c) => c.key).map((c) => c.name ?? `<expr:${c.seqno}>`),
        columnSpecs: xinfo,
        sql: rawSql,
        canonicalSql: rawSql ? normalizeSqlForComparison(rawSql) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function validateInternalTableSchema(db, name, indexSqlByName) {
  const qName = quoteIdent(name);
  const violations = [];
  const fks = extractTableForeignKeys(db, qName);
  if (fks.length > 0) {
    violations.push(`Internal table "${name}" has unexpected foreign key(s): ${JSON.stringify(fks)}`);
  }
  const unexpectedIndexes = extractTableIndexes(db, qName, indexSqlByName).filter((idx) =>
    name === '_cf_METADATA' ? idx.origin === 'c' || idx.origin === 'u' : idx.origin === 'c',
  );
  if (unexpectedIndexes.length > 0) {
    violations.push(
      `Internal table "${name}" has unexpected index/constraint(s): [${unexpectedIndexes.map((i) => i.name).join(', ')}]`,
    );
  }
  if (name === '_cf_METADATA') {
    const cols = db
      .prepare(`PRAGMA table_xinfo(${qName})`)
      .all()
      .map((c) => ({
        name: String(c.name).toLowerCase(),
        type: String(c.type).toUpperCase(),
        pk: Number(c.pk),
      }));
    const valid =
      cols.length === 2 &&
      cols[0].name === 'key' &&
      cols[0].type === 'INTEGER' &&
      cols[0].pk === 1 &&
      cols[1].name === 'value' &&
      cols[1].type === 'BLOB' &&
      cols[1].pk === 0;
    if (!valid) {
      violations.push(
        `Internal table "_cf_METADATA" does not match Wrangler canonical schema (key INTEGER PRIMARY KEY, value BLOB); found: ${JSON.stringify(cols)}`,
      );
    }
  }
  return violations;
}

export function extractSchemaSnapshot(db, migrationMeta = []) {
  const allTables = db
    .prepare(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name ASC`,
    )
    .all();

  const indexSqlByName = new Map(
    db
      .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL`)
      .all()
      .map((r) => [String(r.name), String(r.sql)]),
  );

  const internalTables = [];
  const internalTableViolations = [];
  const tableDetails = {};
  for (const t of allTables) {
    const name = String(t.name);
    if (INTERNAL_D1_TABLES.has(name)) {
      internalTables.push(name);
      internalTableViolations.push(...validateInternalTableSchema(db, name, indexSqlByName));
      continue;
    }
    const qName = quoteIdent(name);
    const columns = db
      .prepare(`PRAGMA table_xinfo(${qName})`)
      .all()
      .map((c) => ({
        cid: Number(c.cid),
        name: String(c.name),
        type: String(c.type),
        notnull: Number(c.notnull) === 1,
        defaultValue: c.dflt_value === null ? null : String(c.dflt_value),
        pk: Number(c.pk),
        hidden: Number(c.hidden ?? 0),
      }));

    const rawSql = String(t.sql ?? '');
    tableDetails[name] = {
      sql: rawSql,
      canonicalSql: normalizeSqlForComparison(rawSql),
      columns,
      foreignKeys: extractTableForeignKeys(db, qName),
      indexes: extractTableIndexes(db, qName, indexSqlByName),
    };
  }

  const triggers = db
    .prepare(
      `SELECT name, tbl_name, sql FROM sqlite_master
       WHERE type = 'trigger' ORDER BY name ASC`,
    )
    .all()
    .map((r) => {
      const rawSql = String(r.sql ?? '');
      return {
        name: String(r.name),
        table: String(r.tbl_name),
        sql: rawSql,
        canonicalSql: normalizeSqlForComparison(rawSql),
      };
    });

  const views = db
    .prepare(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'view' ORDER BY name ASC`,
    )
    .all()
    .map((r) => {
      const rawSql = String(r.sql ?? '');
      return {
        name: String(r.name),
        sql: rawSql,
        canonicalSql: normalizeSqlForComparison(rawSql),
      };
    });

  // Structural fingerprint excludes migrationMeta & raw whitespace so real Wrangler D1
  // matches canonical :memory: snapshots byte-for-byte when schema is identical.
  const structuralCore = {
    tables: Object.fromEntries(
      Object.entries(tableDetails).map(([name, info]) => [
        name,
        {
          canonicalSql: info.canonicalSql,
          columns: info.columns,
          foreignKeys: info.foreignKeys,
          indexes: info.indexes.map((idx) => ({
            name: idx.name,
            unique: idx.unique,
            origin: idx.origin,
            partial: idx.partial,
            columnSpecs: idx.columnSpecs,
            canonicalSql: idx.canonicalSql,
          })),
        },
      ]),
    ),
    triggers: triggers.map((tr) => ({ name: tr.name, table: tr.table, canonicalSql: tr.canonicalSql })),
    views: views.map((v) => ({ name: v.name, canonicalSql: v.canonicalSql })),
  };

  return {
    migrations: migrationMeta,
    hasD1MigrationsTable: internalTables.includes('d1_migrations'),
    internalTables: internalTables.sort(),
    internalTableViolations,
    tables: tableDetails,
    triggers,
    views,
    schemaSha256: sha256(JSON.stringify(structuralCore)),
  };
}

function diffSharedTable(tableName, a, b, changedObjects) {
  const colsA = new Map(a.columns.map((c) => [c.name, c]));
  const colsB = new Map(b.columns.map((c) => [c.name, c]));
  const colsOnlyInA = [...colsA.keys()].filter((c) => !colsB.has(c)).sort();
  const colsOnlyInB = [...colsB.keys()].filter((c) => !colsA.has(c)).sort();
  const columnChanges = [];

  for (const colName of [...colsA.keys()].filter((c) => colsB.has(c)).sort()) {
    const ca = colsA.get(colName);
    const cb = colsB.get(colName);
    if (JSON.stringify(ca) !== JSON.stringify(cb)) {
      columnChanges.push({ name: colName, expected: ca, observed: cb });
      changedObjects.push({
        objectType: 'column',
        table: tableName,
        name: `${tableName}.${colName}`,
        reason: 'column_definition_changed',
        highRisk: false,
      });
    }
  }
  for (const colName of colsOnlyInA) {
    changedObjects.push({ objectType: 'column', table: tableName, name: `${tableName}.${colName}`, reason: 'missing_column', highRisk: true });
  }
  for (const colName of colsOnlyInB) {
    changedObjects.push({ objectType: 'column', table: tableName, name: `${tableName}.${colName}`, reason: 'extra_column', highRisk: true });
  }

  const idxA = new Map(a.indexes.map((i) => [i.name, i]));
  const idxB = new Map(b.indexes.map((i) => [i.name, i]));
  const idxOnlyInA = [...idxA.keys()].filter((i) => !idxB.has(i)).sort();
  const idxOnlyInB = [...idxB.keys()].filter((i) => !idxA.has(i)).sort();
  const indexChanges = [];

  for (const idxName of [...idxA.keys()].filter((i) => idxB.has(i)).sort()) {
    const ia = idxA.get(idxName);
    const ib = idxB.get(idxName);
    const sigA = JSON.stringify({
      unique: ia.unique,
      origin: ia.origin,
      partial: ia.partial,
      columnSpecs: ia.columnSpecs,
      canonicalSql: ia.canonicalSql,
    });
    const sigB = JSON.stringify({
      unique: ib.unique,
      origin: ib.origin,
      partial: ib.partial,
      columnSpecs: ib.columnSpecs,
      canonicalSql: ib.canonicalSql,
    });
    if (sigA !== sigB) {
      indexChanges.push({ name: idxName, expected: ia, observed: ib });
      changedObjects.push({
        objectType: 'index',
        table: tableName,
        name: idxName,
        reason: 'index_definition_changed',
        highRisk: true,
      });
    }
  }
  for (const idxName of idxOnlyInA) {
    changedObjects.push({ objectType: 'index', table: tableName, name: idxName, reason: 'missing_index', highRisk: false });
  }
  for (const idxName of idxOnlyInB) {
    changedObjects.push({ objectType: 'index', table: tableName, name: idxName, reason: 'extra_index', highRisk: true });
  }

  const fkSetA = new Map(a.foreignKeys.map((fk) => [JSON.stringify(fk), fk]));
  const fkSetB = new Map(b.foreignKeys.map((fk) => [JSON.stringify(fk), fk]));
  const fksOnlyInA = [...fkSetA.entries()].filter(([k]) => !fkSetB.has(k)).map(([, v]) => v);
  const fksOnlyInB = [...fkSetB.entries()].filter(([k]) => !fkSetA.has(k)).map(([, v]) => v);
  if (fksOnlyInA.length > 0 || fksOnlyInB.length > 0) {
    changedObjects.push({
      objectType: 'foreign_key',
      table: tableName,
      name: `${tableName}.foreign_keys`,
      reason: 'foreign_key_definition_changed',
      highRisk: true,
    });
  }

  const ddlChanged = a.canonicalSql !== b.canonicalSql;
  if (ddlChanged) {
    changedObjects.push({
      objectType: 'table_ddl',
      table: tableName,
      name: tableName,
      reason: 'table_ddl_changed',
      highRisk: true,
    });
  }

  const hasDiff =
    colsOnlyInA.length > 0 ||
    colsOnlyInB.length > 0 ||
    columnChanges.length > 0 ||
    idxOnlyInA.length > 0 ||
    idxOnlyInB.length > 0 ||
    indexChanges.length > 0 ||
    fksOnlyInA.length > 0 ||
    fksOnlyInB.length > 0 ||
    ddlChanged;

  if (!hasDiff) return null;

  return {
    columnsOnlyInA: colsOnlyInA,
    columnsOnlyInB: colsOnlyInB,
    columnChanges,
    indexesOnlyInA: idxOnlyInA,
    indexesOnlyInB: idxOnlyInB,
    indexChanges,
    foreignKeysOnlyInA: fksOnlyInA,
    foreignKeysOnlyInB: fksOnlyInB,
    ddlChanged,
  };
}

export function diffSchemaSnapshots(snapA, snapB) {
  const tablesA = new Set(Object.keys(snapA.tables));
  const tablesB = new Set(Object.keys(snapB.tables));

  const onlyInA = [...tablesA].filter((t) => !tablesB.has(t)).sort();
  const onlyInB = [...tablesB].filter((t) => !tablesA.has(t)).sort();
  const shared = [...tablesA].filter((t) => tablesB.has(t)).sort();

  const changedObjects = [];
  for (const t of onlyInA) {
    changedObjects.push({ objectType: 'table', table: t, name: t, reason: 'missing_table', highRisk: true });
  }
  for (const t of onlyInB) {
    changedObjects.push({ objectType: 'table', table: t, name: t, reason: 'extra_table', highRisk: true });
  }

  const tableDiffs = {};
  for (const t of shared) {
    const diff = diffSharedTable(t, snapA.tables[t], snapB.tables[t], changedObjects);
    if (diff) tableDiffs[t] = diff;
  }

  // Triggers diff
  const trigA = new Map((snapA.triggers ?? []).map((tr) => [tr.name, tr]));
  const trigB = new Map((snapB.triggers ?? []).map((tr) => [tr.name, tr]));
  const triggersOnlyInA = [...trigA.keys()].filter((k) => !trigB.has(k)).sort();
  const triggersOnlyInB = [...trigB.keys()].filter((k) => !trigA.has(k)).sort();
  const triggerChanges = [];
  for (const name of [...trigA.keys()].filter((k) => trigB.has(k)).sort()) {
    const ta = trigA.get(name);
    const tb = trigB.get(name);
    if (ta.table !== tb.table || ta.canonicalSql !== tb.canonicalSql) {
      triggerChanges.push({ name, expected: ta, observed: tb });
      changedObjects.push({ objectType: 'trigger', table: tb.table, name, reason: 'trigger_definition_changed', highRisk: true });
    }
  }
  for (const name of triggersOnlyInA) {
    changedObjects.push({ objectType: 'trigger', table: trigA.get(name).table, name, reason: 'missing_trigger', highRisk: false });
  }
  for (const name of triggersOnlyInB) {
    changedObjects.push({ objectType: 'trigger', table: trigB.get(name).table, name, reason: 'extra_trigger', highRisk: true });
  }

  // Views diff
  const viewA = new Map((snapA.views ?? []).map((v) => [v.name, v]));
  const viewB = new Map((snapB.views ?? []).map((v) => [v.name, v]));
  const viewsOnlyInA = [...viewA.keys()].filter((k) => !viewB.has(k)).sort();
  const viewsOnlyInB = [...viewB.keys()].filter((k) => !viewA.has(k)).sort();
  const viewChanges = [];
  for (const name of [...viewA.keys()].filter((k) => viewB.has(k)).sort()) {
    const va = viewA.get(name);
    const vb = viewB.get(name);
    if (va.canonicalSql !== vb.canonicalSql) {
      viewChanges.push({ name, expected: va, observed: vb });
      changedObjects.push({ objectType: 'view', name, reason: 'view_definition_changed', highRisk: true });
    }
  }
  for (const name of viewsOnlyInA) {
    changedObjects.push({ objectType: 'view', name, reason: 'missing_view', highRisk: false });
  }
  for (const name of viewsOnlyInB) {
    changedObjects.push({ objectType: 'view', name, reason: 'extra_view', highRisk: true });
  }

  // Migration prefix collision detection
  const intraDirCollisions = { lineageA: [], lineageB: [] };
  const indexMigrations = (list, target) => {
    const map = new Map();
    for (const m of list ?? []) {
      const prefix = m.filename.slice(0, 4);
      if (map.has(prefix)) target.push({ prefix, first: map.get(prefix), duplicate: m });
      else map.set(prefix, m);
    }
    return map;
  };
  const migA = indexMigrations(snapA.migrations, intraDirCollisions.lineageA);
  const migB = indexMigrations(snapB.migrations, intraDirCollisions.lineageB);
  const numericCollisions = [];
  for (const [prefix, mA] of migA.entries()) {
    const mB = migB.get(prefix);
    if (mB && (mA.filename !== mB.filename || mA.sha256 !== mB.sha256)) {
      numericCollisions.push({ prefix, lineageA: mA, lineageB: mB });
    }
  }

  const hasStructuralDrift =
    onlyInA.length > 0 ||
    onlyInB.length > 0 ||
    Object.keys(tableDiffs).length > 0 ||
    triggersOnlyInA.length > 0 ||
    triggersOnlyInB.length > 0 ||
    triggerChanges.length > 0 ||
    viewsOnlyInA.length > 0 ||
    viewsOnlyInB.length > 0 ||
    viewChanges.length > 0;

  return {
    schemaSha256A: snapA.schemaSha256,
    schemaSha256B: snapB.schemaSha256,
    hasStructuralDrift,
    changedObjects,
    numericCollisions,
    intraDirCollisions,
    tablesOnlyInA: onlyInA,
    tablesOnlyInB: onlyInB,
    sharedTableDiffs: tableDiffs,
    triggersOnlyInA,
    triggersOnlyInB,
    triggerChanges,
    viewsOnlyInA,
    viewsOnlyInB,
    viewChanges,
    criticalHighlights: {
      botsWorkspaceIdInA: Boolean(snapA.tables.bots?.columns.some((c) => c.name === 'workspace_id')),
      botsWorkspaceIdInB: Boolean(snapB.tables.bots?.columns.some((c) => c.name === 'workspace_id')),
      h3MakerInA: Boolean(snapA.tables.bots?.sql.toLowerCase().includes('h3_maker')),
      h3MakerInB: Boolean(snapB.tables.bots?.sql.toLowerCase().includes('h3_maker')),
      paperLedgerPositionsInA: Boolean(snapA.tables.paper_ledger_positions),
      paperLedgerPositionsInB: Boolean(snapB.tables.paper_ledger_positions),
    },
  };
}
