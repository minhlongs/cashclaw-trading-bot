import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const rootConfig = 'wrangler.jsonc';
const localConfig = '.wrangler/pr35-local.jsonc';
const localDb = '.wrangler/verification/pr35-d1-worker';
const localDbName = 'pr35-isolated-local';
const localDbId = '00000000-0000-4000-8000-000000000035';
const secretFile = '.wrangler/verification/pr35-worker.dev.vars';
const seedFile = '.wrangler/verification/pr35-seed-users.sql';
const reset = process.argv.includes('--reset');

assert.ok(readFileSync(rootConfig, 'utf8').includes('cashclaw-db'), 'Run from the repository root');
mkdirSync('.wrangler/verification', { recursive: true });
if (reset) rmSync(localDb, { recursive: true, force: true });

const secret = randomBytes(32).toString('hex');
let config = readFileSync(rootConfig, 'utf8');
config = config.replace('"main": ".open-next/worker.js"', '"main": "../.open-next/worker.js"');
config = config.replace('"directory": ".open-next/assets"', '"directory": "../.open-next/assets"');
config = config.replace('"binding": "DB",', '"binding": "DB",\n\t\t\t"migrations_dir": "../migrations",');
config = config.replace(/"database_name":\s*"[^"]+"/, `"database_name": "${localDbName}"`);
config = config.replace(/"database_id":\s*"[^"]+"/, `"database_id": "${localDbId}"`);
config = config.replace('"vars": {', `"vars": {\n\t\t"NOWPAYMENTS_IPN_SECRET": "${secret}",`);
assert.ok(config.includes(`"database_name": "${localDbName}"`), 'Could not isolate the Wrangler D1 database name');
assert.ok(config.includes(`"database_id": "${localDbId}"`), 'Could not replace the Wrangler D1 database ID');
writeFileSync(localConfig, config, { mode: 0o600 });
chmodSync(localConfig, 0o600);
writeFileSync(secretFile, `NOWPAYMENTS_IPN_SECRET=${secret}\nNODE_ENV=development\n`, { mode: 0o600 });
chmodSync(secretFile, 0o600);

const accounts = [
  { id: 'pr35-user-a', email: 'pr35-a@example.test', name: 'PR35 Synthetic A', locale: 'vi', passcode: 'Temporary-A-Only-2026' },
  { id: 'pr35-user-b', email: 'pr35-b@example.test', name: 'PR35 Synthetic B', locale: 'en', passcode: 'Temporary-B-Only-2026' },
];
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const rows = accounts.map(({ id, email, name, locale, passcode }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const hash = createHash('sha256').update(`${normalizedEmail}:${passcode}`).digest('hex');
  return `INSERT OR REPLACE INTO users (id,email,display_name,locale,created_at,updated_at,passcode_hash) VALUES (${[id, normalizedEmail, name, locale, 1730000000, 1730000000, `${hash}:${normalizedEmail}`].map(sqlString).join(',')});`;
});
writeFileSync(seedFile, `${rows.join('\n')}\n`, { mode: 0o600 });

function wrangler(args) {
  const result = spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
wrangler(['d1', 'migrations', 'apply', localDbName, '--config', localConfig, '--local', '--persist-to', localDb]);
wrangler(['d1', 'execute', localDbName, '--config', localConfig, '--local', '--persist-to', localDb, '--file', seedFile]);
console.log(`Prepared isolated local D1 '${localDbName}' at ${localDb}.`);
console.log(`Local callback secret stored in ${secretFile}; its value is intentionally not printed.`);
console.log(`Synthetic users: ${accounts.map((account) => account.email).join(', ')} (test-only passcodes are defined in the regression scripts).`);
if (!reset) console.log('Existing isolated D1 data was preserved; pass --reset to rebuild only this named local D1 directory.');
