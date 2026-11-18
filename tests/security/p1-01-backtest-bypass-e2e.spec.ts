// P1-01 Real Browser & Live HTTP/Flight E2E Suite (Playwright Chromium against next dev)
import { test, expect } from '@playwright/test';

const BYPASS_PATHS = [
  '/public/backtests',
  '/favicon.ico/backtests',
  '/_next/staticX/backtests',
  '/faviconXico',
] as const;

test.describe('P1-01: Middleware Matcher, Locale Context & Server Action Bypass E2E', () => {
  test('rejects /public/backtests, /favicon.ico/backtests, /_next/staticX/backtests, and /faviconXico with HTTP 404 despite forged x-user-id', async ({
    page,
    request,
  }) => {
    for (const bypassPath of BYPASS_PATHS) {
      const httpRes = await request.get(bypassPath, {
        headers: {
          'x-user-id': 'victim_user_p1_01',
        },
      });
      expect(httpRes.status(), `Expected 404 on ${bypassPath}`).toBe(404);
      const body = await httpRes.text();
      expect(body).not.toContain('victim_user_p1_01');
    }

    const browserRes = await page.goto('/public/backtests');
    expect(browserRes?.status()).toBe(404);
  });

  test('strips forged x-user-id on /api/bots, /vi/backtests, and direct Next-Action POST probes', async ({
    request,
  }) => {
    const apiBotsUnauth = await request.get('/api/bots', {
      headers: {
        'x-user-id': 'victim_user_p1_01',
      },
    });
    expect(apiBotsUnauth.status()).toBe(401);
    const apiBotsBody = (await apiBotsUnauth.json()) as { ok: boolean; error: string };
    expect(apiBotsBody).toEqual({ ok: false, error: 'Authentication required' });

    const ssrUnauth = await request.get('/vi/backtests', {
      headers: {
        'x-user-id': 'victim_user_p1_01',
      },
    });
    expect(ssrUnauth.status()).toBe(200);
    expect(await ssrUnauth.text()).not.toContain('victim_user_p1_01');

    const flightHeaders = {
      Accept: 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': '407f8a7848262b0a29c552f1e4136ad04f0392180d',
      'x-user-id': 'victim_user_p1_01',
    };
    const flightPayload = JSON.stringify([
      {
        botId: 'bot_victim_777',
        exchange: 'binance',
        symbol: 'BTC/USDT',
        strategy: 'grid',
        startDate: '$D2024-01-01T00:00:00.000Z',
        endDate: '$D2024-01-02T00:00:00.000Z',
        interval: '1h',
        config: {
          strategy: 'grid',
          symbol: 'BTC/USDT',
          exchange: 'binance',
          mode: 'paper',
          capital: 1000,
          upperPrice: 70000,
          lowerPrice: 60000,
          gridLevels: 10,
          orderSizePct: 10,
        },
      },
      'victim_user_p1_01',
    ]);

    for (const targetPath of ['/public/backtests', '/en/backtests']) {
      const postRes = await request.post(targetPath, {
        headers: flightHeaders,
        data: flightPayload,
      });
      const postBody = await postRes.text();
      expect(postBody, `POST ${targetPath} must never succeed unauthenticated`).not.toContain(
        '"success":true',
      );
      expect(
        postRes.status() === 404 || postBody.includes('Authentication required'),
        `Expected 404 or Authentication required on POST ${targetPath}, got status=${postRes.status()}`,
      ).toBe(true);
    }
  });

  test('preserves /en locale context in client navigation links on /en/dashboard and /en/backtests', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'session_id',
        value: 'e2e_en_locale_session',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const dashRes = await page.goto('/en/dashboard');
    expect(dashRes?.status()).toBe(200);
    await expect(page.locator('a[href="/en/bots"]').first()).toBeAttached();
    await expect(page.locator('a[href="/vi/bots"]')).toHaveCount(0);

    const btRes = await page.goto('/en/backtests');
    expect(btRes?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
