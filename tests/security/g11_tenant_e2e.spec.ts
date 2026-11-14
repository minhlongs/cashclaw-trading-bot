// Gate G11 Real Browser & Live HTTP E2E Suite (Playwright Chromium against next dev on port 3107)
import { test, expect } from '@playwright/test';

async function hmacSha512Hex(canonicalJson: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(canonicalJson));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function canonicalizeSortedJson(payload: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(payload).sort()) {
    sorted[key] = payload[key];
  }
  return JSON.stringify(sorted);
}

test.describe('Gate G11: Real Browser Paper-Only Separation, Anti-IDOR, VN 451 Guard & IPN Probes', () => {
  test('renders /en/billing, /vi/billing, /en/dashboard, and /en/monitoring with visible Paper-Simulation & Non-Custodial SaaS badges', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'session_id',
        value: 'e2e_local_dev_session',
        domain: '127.0.0.1',
        path: '/',
      },
    ]);

    const simulationBadgePattern = /SIMULATED PAPER PnL — NOT REAL FUNDS|MÔ PHỎNG GIẤY — KHÔNG PHẢI TIỀN THẬT/;

    await page.goto('/en/billing');
    await expect(page.getByTestId('paper-simulation-badge').first()).toBeVisible();
    await expect(page.getByTestId('paper-simulation-badge').first()).toHaveText(
      simulationBadgePattern,
    );
    await expect(page.getByTestId('non-custodial-saas-badge')).toBeVisible();
    await expect(page.getByTestId('saas-tier-comparison-table')).toBeVisible();
    await expect(page.getByText('ADR-001 PAPER ONLY')).toBeVisible();

    await page.goto('/vi/billing');
    await expect(page.getByTestId('paper-simulation-badge').first()).toBeVisible();
    await expect(page.getByTestId('paper-simulation-badge').first()).toHaveText(
      'MÔ PHỎNG GIẤY — KHÔNG PHẢI TIỀN THẬT',
    );

    await page.goto('/en/dashboard');
    const dashboardBadges = page.getByTestId('paper-simulation-badge');
    await expect(dashboardBadges.first()).toBeVisible();
    await expect(dashboardBadges).toHaveCount(3);
    await expect(dashboardBadges.first()).toHaveText(simulationBadgePattern);

    await page.goto('/en/monitoring');
    await expect(
      page.getByRole('heading', { name: /System Health|Tình trạng hệ thống/ }),
    ).toBeVisible();
  });

  test('blocks VN crypto checkout with HTTP 451 in both live API and interactive Chromium modal', async ({
    page,
    context,
    request,
  }) => {
    const apiVnRes = await request.post('/api/ee/billing/checkout', {
      headers: {
        Cookie: 'session_id=e2e_local_dev_session',
        'Content-Type': 'application/json',
        'cf-ipcountry': 'VN',
      },
      data: {
        targetTier: 'PREMIUM',
        payCurrency: 'usdt',
      },
    });
    expect(apiVnRes.status()).toBe(451);
    const apiVnBody = (await apiVnRes.json()) as {
      ok: boolean;
      code: string;
      messageEn: string;
      messageVi: string;
    };
    expect(apiVnBody.ok).toBe(false);
    expect(apiVnBody.code).toBe('CRYPTO_CHECKOUT_BLOCKED_VN_JURISDICTION');
    expect(apiVnBody.messageEn).toContain('71/2025/QH15');
    expect(apiVnBody.messageVi).toContain('284/2026/NĐ-CP');

    await context.addCookies([
      {
        name: 'session_id',
        value: 'e2e_local_dev_session',
        domain: '127.0.0.1',
        path: '/',
      },
    ]);
    await page.setExtraHTTPHeaders({ 'cf-ipcountry': 'VN' });
    await page.goto('/vi/billing');
    await page.getByRole('button', { name: 'Nâng Cấp Gói' }).first().click();
    await page.getByRole('button', { name: 'Thanh toán $29 bằng USDT' }).click();
    await expect(page.getByTestId('vn-jurisdiction-notice')).toBeVisible();
  });

  test('enforces middleware x-user-id spoofing rejection (401) and cross-workspace anti-IDOR (403)', async ({
    request,
  }) => {
    const spoofedQuotas = await request.get('/api/ee/quotas?workspaceId=ws_victim', {
      headers: { 'x-user-id': 'usr_victim' },
    });
    expect(spoofedQuotas.status()).toBe(401);

    const spoofedCredits = await request.get('/api/ee/credits?workspaceId=ws_victim', {
      headers: { 'x-user-id': 'usr_victim' },
    });
    expect(spoofedCredits.status()).toBe(401);

    const spoofedBots = await request.get('/api/bots', {
      headers: { 'x-user-id': 'usr_victim' },
    });
    expect(spoofedBots.status()).toBe(401);

    // Even without any client x-user-id header, middleware binds session_id=e2e_local_dev_session
    // to dev_e2e_local_dev_session (personal workspace ws_dev_e2e_local_dev_session).
    // Attempting to spoof x-user-id: usr_victim_foreign while querying ws_usr_victim_foreign MUST still
    // return 403 WORKSPACE_FORBIDDEN, proving middleware stripped the forged x-user-id header!
    const spoofedHeaderCrossWs = await request.get('/api/ee/quotas?workspaceId=ws_usr_victim_foreign', {
      headers: {
        Cookie: 'session_id=e2e_local_dev_session',
        'x-user-id': 'usr_victim_foreign',
      },
    });
    expect(spoofedHeaderCrossWs.status()).toBe(403);
    const crossBody = (await spoofedHeaderCrossWs.json()) as { code: string };
    expect(crossBody.code).toBe('WORKSPACE_FORBIDDEN');

    const crossWsCredits = await request.get('/api/ee/credits?workspaceId=ws_victim_foreign', {
      headers: {
        Cookie: 'session_id=e2e_local_dev_session',
      },
    });
    expect(crossWsCredits.status()).toBe(403);

    // Calling without foreign workspaceId resolves cleanly to caller's own server-derived workspace
    const ownWsQuotas = await request.get('/api/ee/quotas', {
      headers: {
        Cookie: 'session_id=e2e_local_dev_session',
        'x-user-id': 'usr_victim_foreign',
      },
    });
    expect(ownWsQuotas.status()).toBe(200);
    const ownWsBody = (await ownWsQuotas.json()) as { workspaceId: string };
    expect(ownWsBody.workspaceId).toBe('ws_dev_e2e_local_dev_session');
  });

  test('defends /api/ee/billing/nowpayments-ipn against partially_paid and 10x parallel finished webhook probes', async ({
    request,
  }) => {
    const probeSecret = process.env.NOWPAYMENTS_IPN_SECRET?.trim() || 'e2e-probe-secret';
    const partialPayload = {
      payment_id: 'pay_e2e_partial_01',
      payment_status: 'partially_paid',
      order_id: 'ord_e2e_unbacked_01',
      pay_amount: 10,
      actually_paid: 10,
      pay_currency: 'usdt',
    };
    const partialSig = await hmacSha512Hex(canonicalizeSortedJson(partialPayload), probeSecret);
    const partialRes = await request.post('/api/ee/billing/nowpayments-ipn', {
      headers: {
        'Content-Type': 'application/json',
        'x-nowpayments-sig': partialSig,
        'x-nowpayments-timestamp': String(Math.floor(Date.now() / 1000)),
      },
      data: partialPayload,
    });
    expect([403, 409, 503]).toContain(partialRes.status());

    const replayPayload = {
      payment_id: 'pay_e2e_parallel_burst_10x',
      payment_status: 'finished',
      order_id: 'ord_e2e_unbacked_burst',
      pay_amount: 99,
      actually_paid: 99,
      pay_currency: 'usdt',
    };
    const replaySig = await hmacSha512Hex(canonicalizeSortedJson(replayPayload), probeSecret);
    const nowTs = String(Math.floor(Date.now() / 1000));

    const parallelResponses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request.post('/api/ee/billing/nowpayments-ipn', {
          headers: {
            'Content-Type': 'application/json',
            'x-nowpayments-sig': replaySig,
            'x-nowpayments-timestamp': nowTs,
          },
          data: replayPayload,
        }),
      ),
    );
    const parallelBodies = await Promise.all(
      parallelResponses.map((r) => r.json() as Promise<{ activated?: boolean }>),
    );
    const activations = parallelBodies.filter((b) => b.activated === true).length;
    expect(activations).toBe(0);

    // Foreign workspace check is strictly 403, while caller's own workspace remains BASIC (unactivated)
    const foreignQuotaCheck = await request.get('/api/ee/quotas?workspaceId=ws_e2e_target', {
      headers: { Cookie: 'session_id=e2e_local_dev_session' },
    });
    expect(foreignQuotaCheck.status()).toBe(403);

    const ownQuotaCheck = await request.get('/api/ee/quotas', {
      headers: { Cookie: 'session_id=e2e_local_dev_session' },
    });
    expect(ownQuotaCheck.status()).toBe(200);
    const quotaJson = (await ownQuotaCheck.json()) as { tier: string };
    expect(quotaJson.tier).toBe('BASIC');
  });
});
