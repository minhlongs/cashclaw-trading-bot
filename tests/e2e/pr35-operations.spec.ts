import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type SavedState = { readonly itemId: string; readonly title: string; readonly runId: string };
const runId = process.env.PR35_E2E_RUN_ID ?? `run-${Date.now()}`;
const screenshots = process.env.PR35_SCREENSHOTS_DIR ?? '.wrangler/verification/pr35-playwright-raw/screenshots';
const statePath = process.env.PR35_BROWSER_STATE ?? '.wrangler/verification/pr35-browser-state.json';
const accountA = { email: 'pr35-a@example.test', passcode: process.env.PR35_USER_A_PASSCODE ?? 'Temporary-A-Only-2026' };
const accountB = { email: 'pr35-b@example.test', passcode: process.env.PR35_USER_B_PASSCODE ?? 'Temporary-B-Only-2026' };

async function login(page: Page, locale: 'vi' | 'en', account: typeof accountA) {
  await page.goto(`/${locale}/login`);
  await page.getByLabel('Email / Email').fill(account.email);
  await page.getByLabel('Mật khẩu / Passcode').fill(account.passcode);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/auth/login'), { timeout: 10_000 }),
    page.getByRole('button', { name: 'Đăng nhập / Login' }).click(),
  ]);
  if (!loginResponse.ok()) {
    throw new Error(`Synthetic ${locale} login returned ${loginResponse.status()}: ${(await loginResponse.text()).slice(0, 500)}`);
  }
  await page.waitForURL(`**/${locale}/dashboard`, { timeout: 10_000 });
}

async function expectAccessibleOperations(page: Page) {
  const result = await new AxeBuilder({ page }).include('.ops-page')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(result.violations, JSON.stringify(result.violations.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.map((node) => node.target) })), null, 2)).toEqual([]);
}

function saveScreenshot(name: string) {
  mkdirSync(screenshots, { recursive: true });
  return join(screenshots, name);
}

test('Vietnamese user A creates, updates, reloads and reads versioned Operations history', async ({ page }) => {
  await login(page, 'vi', accountA);
  await page.goto('/vi/operations');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.getByRole('heading', { name: 'Vận hành OPC' })).toBeVisible();
  await expect(page.getByText('Chưa có công việc được lưu.')).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  const title = `PR35 E2E Vietnamese ${runId}`;
  await page.getByLabel('Tiêu đề').fill(title);
  await page.getByLabel('Ghi chú').fill('Synthetic browser persistence check');
  const [createResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/ops/work-items') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Lưu công việc' }).click(),
  ]);
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json() as { item: { id: string; version: number } };
  expect(created.item.version).toBe(0);
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText(/Phiên bản 0/)).toBeVisible();

  await page.getByRole('button', { name: 'Bắt đầu xử lý' }).click();
  await expect(page.getByText(/Đang xử lý/)).toBeVisible();
  await expect(page.getByText(/Phiên bản 1/)).toBeVisible();
  await page.getByRole('button', { name: 'Hoàn tất' }).click();
  await expect(page.getByText(/Hoàn tất/)).toBeVisible();
  await expect(page.getByText(/Phiên bản 2/)).toBeVisible();

  const [historyResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/api/ops/work-items/${created.item.id}`) && response.request().method() === 'GET'),
    page.getByRole('button', { name: 'Xem lịch sử' }).click(),
  ]);
  expect(historyResponse.status()).toBe(200);
  const history = await historyResponse.json() as { events: Array<{ version: number | null }> };
  expect(history.events.map((event) => event.version)).toEqual([0, 1, 2]);
  await expect(page.getByText('Đã tạo: Mở')).toBeVisible();
  await expect(page.getByText('Đã đổi trạng thái: Đang xử lý')).toBeVisible();
  await expect(page.getByText('Đã đổi trạng thái: Hoàn tất')).toBeVisible();
  await expect(page.locator('.ops-history-event').filter({ hasText: 'Phiên bản 0' })).toBeVisible();
  await expect(page.locator('.ops-history-event').filter({ hasText: 'Phiên bản 1' })).toBeVisible();
  await expect(page.locator('.ops-history-event').filter({ hasText: 'Phiên bản 2' })).toBeVisible();
  await expectAccessibleOperations(page);

  await page.reload();
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText(/Hoàn tất/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xem lịch sử' })).toBeVisible();
  await page.getByRole('button', { name: 'Xem lịch sử' }).click();
  await expect(page.getByText('Đã đổi trạng thái: Hoàn tất')).toBeVisible();
  await page.screenshot({ path: saveScreenshot('operations-vi-persisted.png'), fullPage: true });
  writeFileSync(statePath, JSON.stringify({ itemId: created.item.id, title, runId } satisfies SavedState));
});

test('two Vietnamese A tabs surface a real concurrent status conflict', async ({ browser }) => {
  const first = await browser.newPage();
  const second = await browser.newPage();
  await login(first, 'vi', accountA);
  await first.goto('/vi/operations');
  const title = `PR35 E2E conflict ${runId}`;
  await first.getByLabel('Tiêu đề').fill(title);
  const [createdResponse] = await Promise.all([
    first.waitForResponse((response) => response.url().endsWith('/api/ops/work-items') && response.request().method() === 'POST'),
    first.getByRole('button', { name: 'Lưu công việc' }).click(),
  ]);
  expect(createdResponse.status()).toBe(201);
  const id = (await createdResponse.json() as { item: { id: string } }).item.id;
  await login(second, 'vi', accountA);
  await second.goto('/vi/operations');
  await expect(first.getByText(title)).toBeVisible();
  await expect(second.getByText(title)).toBeVisible();

  const [firstResponse, secondResponse] = await Promise.all([
    (async () => {
      const responsePromise = first.waitForResponse((response) => response.url().endsWith(`/api/ops/work-items/${id}`) && response.request().method() === 'PATCH');
      await first.getByRole('button', { name: 'Hoàn tất' }).click();
      return responsePromise;
    })(),
    (async () => {
      const responsePromise = second.waitForResponse((response) => response.url().endsWith(`/api/ops/work-items/${id}`) && response.request().method() === 'PATCH');
      await second.getByRole('button', { name: 'Hủy' }).click();
      return responsePromise;
    })(),
  ]);
  expect([firstResponse.status(), secondResponse.status()].sort()).toEqual([200, 409]);
  const conflictPage = firstResponse.status() === 409 ? first : second;
  await expect(conflictPage.locator('.ops-error')).toContainText('đã được thay đổi ở nơi khác');
  await first.close();
  await second.close();
});

test('English user B sees isolation, loading/empty states, validation/error handling and usable mobile layout', async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await mobileContext.newPage();
  await login(ownerPage, 'vi', accountA);
  await ownerPage.goto('/vi/operations');
  const ownerTitle = `PR35 E2E isolation ${runId}`;
  await ownerPage.getByLabel('Tiêu đề').fill(ownerTitle);
  const [ownerCreateResponse] = await Promise.all([
    ownerPage.waitForResponse((response) => response.url().endsWith('/api/ops/work-items') && response.request().method() === 'POST'),
    ownerPage.getByRole('button', { name: 'Lưu công việc' }).click(),
  ]);
  expect(ownerCreateResponse.status()).toBe(201);
  const ownerItem = (await ownerCreateResponse.json() as { item: { id: string; title: string } }).item;
  await ownerContext.close();
  await login(page, 'en', accountB);
  let releaseList!: () => void;
  let signalListRequest!: () => void;
  const listRequestSeen = new Promise<void>((resolve) => { signalListRequest = resolve; });
  const listGate = new Promise<void>((resolve) => { releaseList = resolve; });
  await page.route('**/api/ops/work-items', async (route) => {
    if (route.request().method() === 'GET') { signalListRequest(); await listGate; }
    await route.continue();
  });
  await page.goto('/en/operations');
  await listRequestSeen;
  await expect(page.getByText('Loading records…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save record' })).toBeDisabled();
  releaseList();
  await expect(page.getByText('No saved work items yet.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'OPC Operations' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const ownItems = await page.evaluate(async () => (await fetch('/api/ops/work-items')).json() as Promise<{ items: Array<{ id: string; title: string }> }>);
  expect(ownItems.items.some((item) => item.id === ownerItem.id || item.title === ownerItem.title)).toBe(false);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await expectAccessibleOperations(page);

  const departmentSelect = page.locator('.ops-form select');
  await expect(departmentSelect).toHaveCount(1);
  await expect(departmentSelect).toBeVisible();
  // Implicit-label exact text can never match: Playwright's label text includes the nested <option> labels.
  // The accessible name itself starts with the exact English label, asserted by pattern.
  await expect(departmentSelect).toHaveAccessibleName(/^Department/);
  await departmentSelect.selectOption('finance');
  await page.getByLabel('Title', { exact: true }).fill('Invalid amount test');
  await page.getByLabel('Amount (minor currency units, optional)').fill('-2');
  await page.getByRole('button', { name: 'Save record' }).click();
  await expect(page.locator('.ops-error')).toHaveText('Check the title, amount, and due date, then try again.');
  await expect(page.getByText('Invalid amount test')).toHaveCount(0);

  await page.unroute('**/api/ops/work-items');
  await page.route('**/api/ops/work-items', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Synthetic injected failure' }) });
    } else await route.continue();
  });
  await page.getByLabel('Amount (minor currency units, optional)').fill('0');
  await page.getByRole('button', { name: 'Save record' }).click();
  await expect(page.locator('.ops-error')).toHaveText('Could not complete request. Check sign-in and database status.');
  await expect(page.getByRole('status')).toContainText('BLOCKED');

  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  await page.screenshot({ path: saveScreenshot('operations-en-mobile-error.png'), fullPage: true });
  await mobileContext.close();
});

test('Worker restart retains A’s Operations record, version and history @restart', async ({ page }) => {
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as SavedState;
  await login(page, 'vi', accountA);
  await page.goto('/vi/operations');
  await expect(page.getByText(state.title)).toBeVisible();
  await expect(page.getByText(/Hoàn tất/)).toBeVisible();
  await expect(page.getByText(/Phiên bản 2/)).toBeVisible();
  await page.getByRole('button', { name: 'Xem lịch sử' }).click();
  await expect(page.getByText('Đã tạo: Mở')).toBeVisible();
  await expect(page.getByText('Đã đổi trạng thái: Đang xử lý')).toBeVisible();
  await expect(page.getByText('Đã đổi trạng thái: Hoàn tất')).toBeVisible();
  await expectAccessibleOperations(page);
  await page.screenshot({ path: saveScreenshot('operations-vi-after-worker-restart.png'), fullPage: true });
});
