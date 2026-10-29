import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

assert.ok(process.argv.includes('--reset'), 'Pass --reset to recreate only the isolated PR35 migration-evaluation D1.');
const database = 'pr35-migration-eval';
const databaseId = '00000000-0000-4000-8000-000000000036';
const configFile = '.wrangler/pr35-migration.jsonc';
const persist = '.wrangler/verification/pr35-migration-d1';
const pre16Dir = '.wrangler/verification/migrations-pre16';
const seedFile = '.wrangler/verification/pr35-migration-legacy-seed.sql';
const artifactDir = 'docs/verification/artifacts';

rmSync(persist, { recursive: true, force: true });
rmSync(pre16Dir, { recursive: true, force: true });
mkdirSync(pre16Dir, { recursive: true });
mkdirSync('.wrangler/verification', { recursive: true });
mkdirSync(artifactDir, { recursive: true });

for (const file of readdirSync('migrations').filter((name) => /^00(?:0[1-9]|1[0-5])_.*\.sql$/.test(name))) {
  copyFileSync(`migrations/${file}`, `${pre16Dir}/${file}`);
}
copyFileSync('scripts/verification/pr35-migration-0016-legacy-seed.sql', seedFile);

function config(migrationsDir) {
  writeFileSync(configFile, JSON.stringify({
    name: 'pr35-migration-eval-local-only',
    compatibility_date: '2026-08-12',
    d1_databases: [{ binding: 'DB', database_name: database, database_id: databaseId, migrations_dir: migrationsDir }],
  }, null, 2));
}
function wrangler(args, { json = false } = {}) {
  const result = spawnSync('npx', ['wrangler', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`wrangler ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  if (!json) process.stdout.write(result.stdout);
  return json ? JSON.parse(result.stdout) : result.stdout;
}
function applyMigrations(migrationsDir) {
  config(migrationsDir);
  wrangler(['d1', 'migrations', 'apply', database, '--config', configFile, '--local', '--persist-to', persist]);
}
function query(sql) {
  return wrangler(['d1', 'execute', database, '--config', configFile, '--local', '--persist-to', persist, '--command', sql, '--json'], { json: true });
}

applyMigrations('verification/migrations-pre16');
wrangler(['d1', 'execute', database, '--config', configFile, '--local', '--persist-to', persist, '--file', seedFile]);
const before = query(`
SELECT workspace_id,owner_user_id,tier,updated_at_ms FROM saas_workspace_entitlements ORDER BY workspace_id;
SELECT payment_status,signature_verified,COUNT(*) AS row_count,MIN(processed_at_ms) AS earliest_processed_at_ms FROM saas_nowpayments_ipn_events GROUP BY payment_status,signature_verified ORDER BY payment_status;
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('saas_workspace_memberships','saas_payment_orders','saas_nowpayments_ipn_event_history');
PRAGMA table_info('saas_workspace_entitlements');
`);
writeFileSync(`${artifactDir}/pr35-migration-before.json`, `${JSON.stringify(before, null, 2)}\n`);

applyMigrations('../migrations');
const after = query(`
SELECT workspace_id,owner_user_id,tier,updated_at_ms,expires_at_ms,revoked_at_ms,current_payment_id FROM saas_workspace_entitlements ORDER BY workspace_id;
SELECT workspace_id,owner_user_id,status,created_at_ms FROM saas_workspaces ORDER BY workspace_id;
SELECT workspace_id,user_id,role,status FROM saas_workspace_memberships ORDER BY workspace_id,user_id;
SELECT COUNT(*) AS legacy_event_rows FROM saas_nowpayments_ipn_events;
SELECT COUNT(*) AS new_event_history_rows FROM saas_nowpayments_ipn_event_history;
SELECT COUNT(*) AS payment_order_rows FROM saas_payment_orders;
SELECT bot.id,bot.user_id,bot.workspace_id,bot.status FROM bots bot ORDER BY bot.id;
SELECT COUNT(*) AS owner_memberships_without_user FROM saas_workspace_memberships m LEFT JOIN users u ON u.id=m.user_id WHERE m.role='OWNER' AND u.id IS NULL;
`);
writeFileSync(`${artifactDir}/pr35-migration-after.json`, `${JSON.stringify(after, null, 2)}\n`);

const entitlements = after[0]?.results ?? [];
const workspaces = after[1]?.results ?? [];
const memberships = after[2]?.results ?? [];
const legacyEvents = after[3]?.results?.[0]?.legacy_event_rows;
const eventHistory = after[4]?.results?.[0]?.new_event_history_rows;
const orders = after[5]?.results?.[0]?.payment_order_rows;
const bots = after[6]?.results ?? [];
const orphanOwnerMemberships = after[7]?.results?.[0]?.owner_memberships_without_user;
assert.equal(entitlements.length, 9);
assert.equal(entitlements.filter((row) => row.tier !== 'BASIC' && row.revoked_at_ms !== null).length, 6);
assert.equal(workspaces.length, 8);
assert.equal(memberships.length, 8);
assert.equal(legacyEvents, 4);
assert.equal(eventHistory, 0);
assert.equal(orders, 0);
assert.equal(bots.length, 2);
assert.ok(bots.every((bot) => bot.workspace_id === `personal:${bot.user_id}`));
assert.equal(orphanOwnerMemberships, 6);
console.log('PASS migration 0016 synthetic before/after: all 6 non-BASIC rows revoked; legacy events retained; 2 bots preserved/assigned; 6 legacy owner memberships have no matching users row; no new orders/history inferred.');
console.log(`Artifacts: ${artifactDir}/pr35-migration-{before,after}.json`);
