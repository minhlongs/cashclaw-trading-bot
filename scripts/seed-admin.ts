/**
 * Seed initial admin user for CashClaw.
 * Usage: npx wrangler d1 execute cashclaw-db --file=scripts/seed-admin.sql --remote
 *
 * Or create the SQL manually and apply via wrangler.
 */

// This file generates the SQL for seeding.
// Run: npx tsx scripts/seed-admin.ts
// Then apply the output SQL via wrangler.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeCrypto = require('crypto') as typeof import('crypto');

const userId = nodeCrypto.randomUUID();
const email = 'admin@cashclaw.app';
const passcode = 'cashclaw2026'; // Customer changes this on first login
const now = Math.floor(Date.now() / 1000);

// Hash passcode with SHA-256 + salt (email as salt) to match auth verification.
const salt = email.toLowerCase().trim();
const hash = nodeCrypto.createHash('sha256').update(`${salt}:${passcode}`).digest('hex') as string;
const passcodeHash = `${hash}:${salt}`;

const sql = `
-- Seed admin user for CashClaw (passcode is SHA-256 hashed)
INSERT OR IGNORE INTO users (id, email, display_name, locale, passcode_hash, created_at, updated_at)
VALUES (
  '${userId}',
  '${email}',
  'Admin',
  'vi',
  '${passcodeHash}',
  ${now},
  ${now}
);
`;

console.log('Generated SQL:');
console.log(sql);
console.log(`\nUser ID: ${userId}`);
console.log(`Email: ${email}`);
console.log(`Passcode: ${passcode}`);
console.log(`Passcode hash: ${passcodeHash}`);
console.log('\nApply with: npx wrangler d1 execute cashclaw-db --command="' + sql.replace(/\n/g, ' ') + '" --remote');
