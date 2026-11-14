// Test suite for Billing & Entitlements UI components
// Validates TierComparisonTable, QuotaUsageCard, NowpaymentsCheckoutModal, CliSyncBridgeCard
// including Paper-Simulation separation badges and VN 451 compliance notice.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import enMessages from '@/messages/en.json';
import viMessages from '@/messages/vi.json';
import { TierComparisonTable } from '../tier-comparison-table';
import { QuotaUsageCard } from '../quota-usage-card';
import { CliSyncBridgeCard } from '../cli-sync-bridge-card';
import { NowpaymentsCheckoutModal } from '../nowpayments-checkout-modal';
import { useWorkspaceBilling } from '../use-workspace-billing';

describe('Billing & Entitlements UI Components', () => {
  it('renders TierComparisonTable with all 4 tiers and correct pricing', () => {
    render(<TierComparisonTable currentTier="BASIC" />);

    expect(screen.getByText('BASIC')).toBeDefined();
    expect(screen.getByText('PREMIUM')).toBeDefined();
    expect(screen.getByText('ENTERPRISE')).toBeDefined();
    expect(screen.getByText('MASTER')).toBeDefined();

    expect(screen.getByText('$0')).toBeDefined();
    expect(screen.getByText('$29')).toBeDefined();
    expect(screen.getByText('$99')).toBeDefined();
    expect(screen.getByText('$299')).toBeDefined();
  });

  it('renders QuotaUsageCard with accurate resource allocations and simulation separation badges', () => {
    render(
      <QuotaUsageCard
        currentTier="PREMIUM"
        runningBots={3}
        consumedCredits={4500}
        totalCredits={10000}
      />,
    );

    expect(screen.getByText('PREMIUM Plan')).toBeDefined();
    expect(screen.getByText('3 / 5')).toBeDefined();
    expect(screen.getByText('Every 5 min')).toBeDefined();
    expect(screen.getByText('4,500 / 10,000')).toBeDefined();
    expect(screen.getByTestId('paper-simulation-badge').textContent).toBe(
      'SIMULATED PAPER PnL — NOT REAL FUNDS',
    );
    expect(screen.getByTestId('non-custodial-saas-badge').textContent).toContain(
      'NON-CUSTODIAL CLOUD SAAS',
    );
    expect(viMessages.billing.paperSimulationBadge).toBe('MÔ PHỎNG GIẤY — KHÔNG PHẢI TIỀN THẬT');
    expect(enMessages.billing.paperSimulationBadge).toBe('SIMULATED PAPER PnL — NOT REAL FUNDS');
  });

  it('renders CliSyncBridgeCard with correct sync command and workspace', () => {
    render(<CliSyncBridgeCard workspaceId="ws_alpha_team" />);

    expect(
      screen.getByText('npx cashclaw export-sync --workspace=ws_alpha_team --target=cloud'),
    ).toBeDefined();
    expect(screen.getByText('Copy Command')).toBeDefined();
  });

  it('renders NowpaymentsCheckoutModal and displays VN 451 compliance notice when blocked', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          code: 'CRYPTO_CHECKOUT_BLOCKED_VN_JURISDICTION',
          error: 'Blocked in VN',
        }),
        { status: 451 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <NowpaymentsCheckoutModal
        isOpen={true}
        targetTier="PREMIUM"
        workspaceId="ws_alpha_team"
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('Upgrade to PREMIUM')).toBeDefined();
    expect(screen.getByText('$29 / month')).toBeDefined();
    const payBtn = screen.getByText('Pay $29 with USDT');
    expect(payBtn).toBeDefined();

    fireEvent.click(payBtn);
    await waitFor(() => {
      expect(screen.getByTestId('vn-jurisdiction-notice')).toBeDefined();
    });

    vi.unstubAllGlobals();
  });

  it('hydrates useWorkspaceBilling state from mocked fetch responses', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/ee/quotas')) {
        return new Response(
          JSON.stringify({
            ok: true,
            workspaceId: 'ws_test_hydrate',
            tier: 'ENTERPRISE',
            entitlements: { monthlyLlmCredits: 50000 },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/ee/credits')) {
        return new Response(
          JSON.stringify({ ok: true, account: { balanceCredits: 42000, consumedCredits: 8000 } }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          data: [{ status: 'running' }, { status: 'running' }, { status: 'stopped' }],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    function Harness() {
      const { currentTier, runningBots, consumedCredits, totalCredits, workspaceId } =
        useWorkspaceBilling();
      return (
        <div>
          <span>{`tier:${currentTier}`}</span>
          <span>{`bots:${runningBots}`}</span>
          <span>{`credits:${consumedCredits}/${totalCredits}`}</span>
          <span>{`workspace:${workspaceId ?? 'none'}`}</span>
        </div>
      );
    }

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByText('tier:ENTERPRISE')).toBeDefined();
      expect(screen.getByText('bots:2')).toBeDefined();
      expect(screen.getByText('credits:8000/50000')).toBeDefined();
      expect(screen.getByText('workspace:ws_test_hydrate')).toBeDefined();
    });

    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls).toContain('/api/ee/quotas');
    expect(calledUrls).toContain('/api/ee/credits?workspaceId=ws_test_hydrate');

    vi.unstubAllGlobals();
  });
});
