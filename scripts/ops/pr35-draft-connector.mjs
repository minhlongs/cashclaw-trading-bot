#!/usr/bin/env node
// Draft connector — loads agent/operator-prepared draft actions into the Operations work queue.
// This is the "approved execution" intake seam: anything an LLM or script prepares lands here as a
// DRAFT and waits for a human decision in the UI/API. It can never approve or execute anything.
//
// Usage:
//   PR35_OPS_SESSION="<session cookie value>" node scripts/ops/pr35-draft-connector.mjs \
//     --drafts <file.json> [--base-url http://localhost:3000]
//
// Draft file: a JSON array of items:
//   { "department": "sales", "title": "...", "description": "...",
//     "amountMinor": 0|null, "dueDate": "YYYY-MM-DD"|null,
//     "action": { "type": "outbound_message", "payload": { "channel": "EMAIL", "message": "..." } } | null }
//
// Exit codes: 0 all drafts queued; 1 usage/config error; 2 one or more drafts rejected (details printed).

import { readFileSync } from 'node:fs';

const DEPARTMENTS = new Set(['finance', 'operations', 'marketing', 'sales', 'support']);
const CHANNELS = new Set(['TELEGRAM', 'WEBHOOK', 'EMAIL']);

export function validateDraft(raw, index) {
  const label = `draft[${index}]`;
  if (!raw || typeof raw !== 'object') return { ok: false, error: `${label}: must be an object` };
  if (!DEPARTMENTS.has(raw.department)) return { ok: false, error: `${label}: bad department` };
  if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 160) return { ok: false, error: `${label}: bad title` };
  if (raw.description !== undefined && (typeof raw.description !== 'string' || raw.description.length > 2000)) return { ok: false, error: `${label}: bad description` };
  if (raw.amountMinor !== undefined && raw.amountMinor !== null && !Number.isSafeInteger(raw.amountMinor)) return { ok: false, error: `${label}: bad amountMinor` };
  if (raw.dueDate !== undefined && raw.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate)) return { ok: false, error: `${label}: bad dueDate` };
  if (raw.action !== undefined && raw.action !== null) {
    if (raw.action.type === 'outbound_message') {
      const payload = raw.action.payload ?? {};
      if (!CHANNELS.has(payload.channel)) return { ok: false, error: `${label}: outbound_message requires TELEGRAM, WEBHOOK or EMAIL channel` };
      if (typeof payload.message !== 'string' || !payload.message.trim() || payload.message.length > 4000) return { ok: false, error: `${label}: outbound_message requires message of 1-4000 characters` };
    } else if (raw.action.type !== 'record_only') {
      return { ok: false, error: `${label}: action.type must be outbound_message or record_only` };
    }
  }
  return { ok: true };
}

async function main(argv) {
  const baseIndex = argv.indexOf('--base-url');
  const draftsIndex = argv.indexOf('--drafts');
  if (draftsIndex < 0 || !argv[draftsIndex + 1]) {
    console.error('Usage: PR35_OPS_SESSION=<cookie> node scripts/ops/pr35-draft-connector.mjs --drafts <file.json> [--base-url http://localhost:3000]');
    return 1;
  }
  const baseUrl = (baseIndex >= 0 && argv[baseIndex + 1] ? argv[baseIndex + 1] : 'http://localhost:3000').replace(/\/$/, '');
  const session = process.env.PR35_OPS_SESSION?.trim();
  if (!session) {
    console.error('REFUSED: PR35_OPS_SESSION must hold an authenticated operator session cookie value.');
    return 1;
  }
  let drafts;
  try {
    drafts = JSON.parse(readFileSync(argv[draftsIndex + 1], 'utf8'));
    if (!Array.isArray(drafts) || drafts.length === 0) throw new Error('draft file must be a non-empty JSON array');
  } catch (error) {
    console.error(`REFUSED: cannot load drafts (${error instanceof Error ? error.message : error})`);
    return 1;
  }
  let worst = 0;
  for (let index = 0; index < drafts.length; index += 1) {
    const check = validateDraft(drafts[index], index);
    if (!check.ok) {
      console.log(`REJECT ${check.error}`);
      worst = 2;
      continue;
    }
    const response = await fetch(`${baseUrl}/api/ops/work-items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `session=${session}` },
      body: JSON.stringify({
        department: drafts[index].department,
        title: drafts[index].title,
        description: drafts[index].description ?? '',
        amountMinor: drafts[index].amountMinor ?? null,
        dueDate: drafts[index].dueDate ?? null,
        action: drafts[index].action ?? null,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 201 && body?.item?.approvalState === 'draft') {
      console.log(`QUEUED draft[${index}] ${body.item.id} (draft — awaiting human approval)`);
    } else if (response.status === 201 && !drafts[index].action) {
      console.log(`QUEUED draft[${index}] ${body.item.id} (plain work item)`);
    } else {
      console.log(`REJECT draft[${index}]: HTTP ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
      worst = 2;
    }
  }
  return worst;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
