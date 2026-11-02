// Browser E2E for the approved-execution approval queue (real Chromium -> UI hydrate -> real
// session -> OpenNext Worker -> local D1 binding -> controllable fake HTTP receiver).
// These tests cover the NEW approval/action surface only; the operations regression suite stays
// in pr35-operations.spec.ts. Action drafts are created through the real intake contract
// (POST /api/ops/work-items with an action — the draft-connector path), never by bypassing state.
//
// Sessions are shared across tests (login once per account in beforeAll) because the app enforces
// a login rate limit (5 attempts/minute/email); each test still acts on its own uniquely-titled
// items, so isolation of the assertions is preserved.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

type ApprovalState = { runId: string };
const runId = process.env.PR35_E2E_RUN_ID ?? `run-${Date.now()}`;
const screenshots = process.env.PR35_SCREENSHOTS_DIR ?? '.wrangler/verification/pr35-playwright-raw/screenshots';
const approvalStatePath = process.env.PR35_APPROVAL_STATE ?? '.wrangler/verification/pr35-approval-state.json';
const receiverUrl = process.env.PR35_RECEIVER_URL ?? 'http://127.0.0.1:8791';
const accountA = { email: 'pr35-a@example.test', passcode: process.env.PR35_USER_A_PASSCODE ?? 'Temporary-A-Only-2026' };
const accountB = { email: 'pr35-b@example.test', passcode: process.env.PR35_USER_B_PASSCODE ?? 'Temporary-B-Only-2026' };

// The app rate-limits login attempts (5/minute/email). The regression suite already spends most
// of that budget for account A, so logins back off one window on 429. All logins happen in
// beforeAll (hook budget) — tests themselves never log in and keep the 60s test timeout.
async function login(page: Page, locale: 'vi' | 'en', account: typeof accountA) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`/${locale}/login`);
    await page.getByLabel('Email / Email').fill(account.email);
    await page.getByLabel('Mật khẩu / Passcode').fill(account.passcode);
    const [loginResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/api/auth/login'), { timeout: 10_000 }),
      page.getByRole('button', { name: 'Đăng nhập / Login' }).click(),
    ]);
    if (loginResponse.ok()) {
      await page.waitForURL(`**/${locale}/dashboard`, { timeout: 10_000 });
      return;
    }
    if (loginResponse.status() === 429 && attempt < 2) {
      await page.waitForTimeout(61_000);
      continue;
    }
    throw new Error(`Synthetic ${locale} login returned ${loginResponse.status()}: ${(await loginResponse.text()).slice(0, 300)}`);
  }
}

function saveScreenshot(name: string) {
  mkdirSync(screenshots, { recursive: true });
  return join(screenshots, name);
}

async function receiverState(): Promise<{ mode: string; totalRequests: number; requests: Array<{ eventId: string | null; bodyPreview: string }> }> {
  const response = await fetch(`${receiverUrl}/__state`);
  return response.json() as Promise<{ mode: string; totalRequests: number; requests: Array<{ eventId: string | null; bodyPreview: string }> }>;
}
async function setReceiverMode(mode: 'ok' | 'fail500' | 'hang' | 'drop') {
  await fetch(`${receiverUrl}/__mode`, { method: 'POST', body: JSON.stringify({ mode }) });
}
async function resetReceiver() {
  await fetch(`${receiverUrl}/__reset`, { method: 'POST' });
}

async function createActionItem(request: APIRequestContext, body: Record<string, unknown>): Promise<{ id: string; version: number }> {
  const response = await request.post('/api/ops/work-items', { data: body });
  expect(response.status()).toBe(201);
  const created = await response.json() as { item: { id: string; version: number } };
  return created.item;
}
async function approvalAction(request: APIRequestContext, action: string, itemId: string, reason?: string) {
  const response = await request.post('/api/ops/work-items/approvals', { data: { action, itemId, ...(reason ? { reason } : {}) } });
  expect(response.status()).toBe(200);
  const body = await response.json() as { results: Array<Record<string, unknown>> };
  return body.results[0];
}

function runD1(sql: string) {
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'pr35-isolated-local', '--config', '.wrangler/pr35-local.jsonc', '--local', '--persist-to', '.wrangler/verification/pr35-d1-worker', '--command', sql], { encoding: 'utf8' });
  expect(result.status, `d1 execute failed: ${result.stderr?.slice(-800)}`).toBe(0);
}

let sessionA: BrowserContext;
let pageA: Page;
let sessionA2: BrowserContext;
let pageA2: Page;
let sessionB: BrowserContext;
let pageB: Page;

test.beforeAll(async ({ browser }: { browser: Browser }, testInfo) => {
  // Hook budget: logins may need one 61s backoff window on the auth rate limiter.
  testInfo.setTimeout(240_000);
  sessionA = await browser.newContext();
  pageA = await sessionA.newPage();
  await login(pageA, 'vi', accountA);
  // The second A session for the two-session conflict test is prepared here so the test itself
  // never waits on the login rate-limit window.
  sessionA2 = await browser.newContext();
  pageA2 = await sessionA2.newPage();
  await login(pageA2, 'en', accountA);
  sessionB = await browser.newContext();
  pageB = await sessionB.newPage();
  await login(pageB, 'en', accountB);
});

test.afterAll(async () => {
  await sessionA?.close();
  await sessionA2?.close();
  await sessionB?.close();
});

test('approval lifecycle: draft persists, submit/approve/execute record_only, attempts visible, keyboard/mobile/locale', async () => {
  await pageA.goto('/vi/operations');
  const draft = await createActionItem(pageA.request, {
    department: 'operations',
    title: `PR35 approval draft ${runId}`,
    description: 'approved-execution lifecycle check',
    action: { type: 'record_only' , policy: { maxAttempts: 2, requestTimeoutMs: 2000, backoffBaseMs: 100, backoffMaxMs: 1000, approvalTtlMs: 3600000 } },
  });
  await pageA.reload();
  const item = pageA.locator('.ops-item').filter({ hasText: `PR35 approval draft ${runId}` });
  await expect(item).toHaveCount(1);
  await expect(item.getByText(/Bản nháp — chờ gửi duyệt/)).toBeVisible();

  // Submit + approve through the UI panel (the human decision path).
  await item.getByRole('button', { name: 'Gửi duyệt' }).click();
  await expect(item.getByText(/Chờ phê duyệt/)).toBeVisible();
  await item.getByRole('button', { name: 'Phê duyệt' }).click();
  await expect(item.getByText(/Đã phê duyệt/)).toBeVisible();

  // Keyboard reachability of the new panel controls.
  await item.getByRole('button', { name: 'Thực thi' }).focus();
  await expect(item.getByRole('button', { name: 'Thực thi' })).toBeFocused();

  await item.getByRole('button', { name: 'Thực thi' }).click();
  await expect(item.getByText(/Đã thực thi/)).toBeVisible();

  // Approval audit + execution attempts are visible in the expanded history.
  await item.getByRole('button', { name: 'Xem lịch sử' }).click();
  await expect(item.getByText(/pending_approval → approved/)).toBeVisible();
  await expect(item.getByText(/Các lần thực thi/)).toBeVisible();
  await expect(item.getByText(/provider_accepted/)).toBeVisible();

  // Mobile viewport on the new panel: no horizontal overflow.
  await pageA.setViewportSize({ width: 390, height: 844 });
  const dimensions = await pageA.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  await pageA.screenshot({ path: saveScreenshot('approval-mobile.png'), fullPage: true });
  await pageA.setViewportSize({ width: 1365, height: 900 });

  // English locale labels for the same panel (same session, second tab — locale is URL-based).
  const english = await sessionA.newPage();
  await english.goto('/en/operations');
  const englishItem = english.locator('.ops-item').filter({ hasText: `PR35 approval draft ${runId}` });
  await expect(englishItem.getByText(/Approved/)).toBeVisible();
  const axe = await new AxeBuilder({ page: english }).include('.ops-page')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations, JSON.stringify(axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
  await english.close();
});

test('outbound_message hits the fake receiver; retries stay inside the approved budget', async () => {
  await pageA.goto('/vi/operations');
  await resetReceiver();
  await setReceiverMode('ok');
  const outbound = await createActionItem(pageA.request, {
    department: 'support',
    title: `PR35 outbound ${runId}`,
    description: 'receiver delivery check',
    action: { type: 'outbound_message', payload: { channel: 'WEBHOOK', message: `hello ${runId}` } , policy: { maxAttempts: 2, requestTimeoutMs: 3000, backoffBaseMs: 100, backoffMaxMs: 500, approvalTtlMs: 3600000 } },
  });
  expect(await approvalAction(pageA.request, 'submit', outbound.id)).toMatchObject({ ok: true, state: 'pending_approval' });
  expect(await approvalAction(pageA.request, 'approve', outbound.id)).toMatchObject({ ok: true, state: 'approved' });
  const executed = await approvalAction(pageA.request, 'execute', outbound.id);
  expect(executed).toMatchObject({ ok: true, outcome: 'provider_accepted', executionState: 'executed' });
  expect((await receiverState()).totalRequests).toBe(1);

  // Bounded retries: provider failure is retried only within maxAttempts=2, then exhausted.
  const flaky = await createActionItem(pageA.request, {
    department: 'support',
    title: `PR35 flaky ${runId}`,
    description: 'bounded retry check',
    action: { type: 'outbound_message', payload: { channel: 'WEBHOOK', message: `flaky ${runId}` } , policy: { maxAttempts: 2, requestTimeoutMs: 1500, backoffBaseMs: 100, backoffMaxMs: 200, approvalTtlMs: 3600000 } },
  });
  await approvalAction(pageA.request, 'submit', flaky.id);
  await approvalAction(pageA.request, 'approve', flaky.id);
  await setReceiverMode('fail500');
  const first = await approvalAction(pageA.request, 'execute', flaky.id);
  expect(first).toMatchObject({ ok: false, outcome: 'failed_retryable', executionState: 'failed' });
  const second = await approvalAction(pageA.request, 'execute', flaky.id);
  expect(second).toMatchObject({ ok: false, outcome: 'failed_retryable' });
  const third = await approvalAction(pageA.request, 'execute', flaky.id);
  expect(third).toMatchObject({ ok: false, code: 'exhausted' });

  // UI shows the failed outcome and attempts history.
  await pageA.reload();
  const flakyItem = pageA.locator('.ops-item').filter({ hasText: `PR35 flaky ${runId}` });
  await expect(flakyItem.getByText(/Đã phê duyệt/)).toBeVisible();
  await flakyItem.getByRole('button', { name: 'Xem lịch sử' }).click();
  await expect(flakyItem.getByText(/failed_retryable/).first()).toBeVisible();
  const state = await receiverState();
  expect(state.totalRequests).toBe(3); // 1 success + 2 failed attempts actually reached the receiver
});

test('post-approval edits require re-approval; revoke and expiry block all sends', async () => {
  await pageA.goto('/vi/operations');
  await resetReceiver();
  await setReceiverMode('ok');

  // 1) Payload edited after approval -> snapshot mismatch -> re-approval required.
  const tamper = await createActionItem(pageA.request, {
    department: 'sales',
    title: `PR35 tamper ${runId}`,
    description: 'immutable snapshot check',
    action: { type: 'outbound_message', payload: { channel: 'WEBHOOK', message: `original ${runId}` } , policy: { maxAttempts: 3, requestTimeoutMs: 2000, backoffBaseMs: 100, backoffMaxMs: 300, approvalTtlMs: 3600000 } },
  });
  await approvalAction(pageA.request, 'submit', tamper.id);
  await approvalAction(pageA.request, 'approve', tamper.id);
  runD1(`UPDATE ops_work_items SET action_payload_json = '{"channel":"WEBHOOK","message":"TAMPERED ${runId}"}' WHERE id = '${tamper.id}';`);
  const blocked = await approvalAction(pageA.request, 'execute', tamper.id);
  expect(blocked).toMatchObject({ ok: false, code: 'snapshot-mismatch' });
  expect(String(blocked.error)).toContain('re-approval required');
  expect((await receiverState()).totalRequests).toBe(0);

  // 2) Revocation blocks sends for good (UI revoke button on the action item).
  const revoke = await createActionItem(pageA.request, {
    department: 'sales',
    title: `PR35 revoke ${runId}`,
    description: 'revocation check',
    action: { type: 'outbound_message', payload: { channel: 'WEBHOOK', message: `revoked ${runId}` } , policy: { maxAttempts: 3, requestTimeoutMs: 2000, backoffBaseMs: 100, backoffMaxMs: 300, approvalTtlMs: 3600000 } },
  });
  await approvalAction(pageA.request, 'submit', revoke.id);
  await approvalAction(pageA.request, 'approve', revoke.id);
  await pageA.reload();
  const revokeItem = pageA.locator('.ops-item').filter({ hasText: `PR35 revoke ${runId}` });
  await revokeItem.getByRole('button', { name: 'Thu hồi phê duyệt' }).click();
  await expect(revokeItem.getByText(/Đã thu hồi/)).toBeVisible();
  const afterRevoke = await approvalAction(pageA.request, 'execute', revoke.id);
  expect(afterRevoke).toMatchObject({ ok: false, code: /not-approved|revoked/ });
  expect((await receiverState()).totalRequests).toBe(0);

  // 3) Expiry blocks sends (approval TTL already elapsed).
  const expired = await createActionItem(pageA.request, {
    department: 'sales',
    title: `PR35 expired ${runId}`,
    description: 'expiry check',
    action: { type: 'outbound_message', payload: { channel: 'WEBHOOK', message: `expired ${runId}` } , policy: { maxAttempts: 3, requestTimeoutMs: 2000, backoffBaseMs: 100, backoffMaxMs: 300, approvalTtlMs: 60000 } },
  });
  await approvalAction(pageA.request, 'submit', expired.id);
  await approvalAction(pageA.request, 'approve', expired.id);
  runD1(`UPDATE ops_work_items SET approval_expires_at_ms = 1 WHERE id = '${expired.id}';`);
  const expiredResult = await approvalAction(pageA.request, 'execute', expired.id);
  expect(expiredResult).toMatchObject({ ok: false, code: 'expired' });
  expect((await receiverState()).totalRequests).toBe(0);

  await pageA.screenshot({ path: saveScreenshot('approval-blocked-outcomes.png'), fullPage: true });
});

test('two sessions conflict on approval transitions and users cannot touch foreign items', async () => {
  const foreign = await createActionItem(pageA.request, {
    department: 'finance',
    title: `PR35 isolation ${runId}`,
    description: 'cross-user check',
    action: { type: 'record_only' },
  });
  // A second, independent session of the SAME user (prepared in beforeAll) races the transition.
  const [first, second] = await Promise.all([
    approvalAction(pageA.request, 'submit', foreign.id),
    approvalAction(pageA2.request, 'submit', foreign.id),
  ]);
  const winners = [first, second].filter((result) => result.ok === true);
  expect(winners).toHaveLength(1);
  const loser = [first, second].find((result) => result.ok === false);
  // Depending on interleaving the loser is refused by the state machine or by the DB CAS guard.
  expect(['invalid-state-transition', 'concurrent-change']).toContain(loser?.code);

  // User B (different account) must not see or touch A's items at all.
  const denied = await pageB.request.post('/api/ops/work-items/approvals', { data: { action: 'approve', itemId: foreign.id } });
  expect(denied.status()).toBe(200);
  const deniedBody = await denied.json() as { results: Array<{ ok: boolean; code?: string }> };
  expect(deniedBody.results[0]).toMatchObject({ ok: false, code: 'not-found' });
  const list = await (await pageB.request.get('/api/ops/work-items')).json() as { items: Array<{ id: string }> };
  expect(list.items.some((entry) => entry.id === foreign.id)).toBe(false);
});

test('ambiguous timeout outcome is recorded as unknown and duplicates are accepted within budget', async () => {
  await pageA.goto('/vi/operations');
  await resetReceiver();
  await setReceiverMode('hang');
  const ambiguous = await createActionItem(pageA.request, {
    department: 'support',
    title: `PR35 ambiguous ${runId}`,
    description: 'unknown outcome check',
    action: { type: 'outbound_message', payload: { channel: 'WEBHOOK', message: `ambiguous ${runId}` } , policy: { maxAttempts: 2, requestTimeoutMs: 700, backoffBaseMs: 100, backoffMaxMs: 200, approvalTtlMs: 3600000 } },
  });
  await approvalAction(pageA.request, 'submit', ambiguous.id);
  await approvalAction(pageA.request, 'approve', ambiguous.id);
  const first = await approvalAction(pageA.request, 'execute', ambiguous.id);
  // Timeout after the request reached the receiver => 'unknown', never a claimed success.
  expect(first).toMatchObject({ ok: false, outcome: 'unknown', executionState: 'failed' });
  await setReceiverMode('ok');
  const retry = await approvalAction(pageA.request, 'execute', ambiguous.id);
  expect(retry).toMatchObject({ ok: true, outcome: 'provider_accepted', executionState: 'executed' });
  const state = await receiverState();
  // Owner accepted at-least-once delivery: both sends reached the receiver (duplicates allowed).
  expect(state.totalRequests).toBe(2);
  await pageA.reload();
  const item = pageA.locator('.ops-item').filter({ hasText: `PR35 ambiguous ${runId}` });
  await item.getByRole('button', { name: 'Xem lịch sử' }).click();
  await expect(item.getByText(/unknown/).first()).toBeVisible();
  await expect(item.getByText(/provider_accepted/).first()).toBeVisible();
  writeFileSync(approvalStatePath, JSON.stringify({ runId } satisfies ApprovalState));
});

test('approved items, attempts and queues survive a worker restart @restart', async ({ page }) => {
  const state = JSON.parse(readFileSync(approvalStatePath, 'utf8')) as ApprovalState;
  await login(page, 'vi', accountA);
  await page.goto('/vi/operations');
  const item = page.locator('.ops-item').filter({ hasText: `PR35 ambiguous ${state.runId}` });
  await expect(item).toHaveCount(1);
  await item.getByRole('button', { name: 'Xem lịch sử' }).click();
  await expect(item.getByText(/unknown/).first()).toBeVisible();
  await expect(item.getByText(/provider_accepted/).first()).toBeVisible();
  await expect(item.getByText(/Đã thực thi/)).toBeVisible();
  await page.screenshot({ path: saveScreenshot('approval-after-restart.png'), fullPage: true });
});
