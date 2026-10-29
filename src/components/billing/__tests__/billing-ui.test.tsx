// Test suite for Billing & Entitlements UI components
// Validates TierComparisonTable, QuotaUsageCard, NowpaymentsCheckoutModal, CliSyncBridgeCard

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('renders QuotaUsageCard with accurate resource allocations', () => {
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
  });

  it('renders CliSyncBridgeCard with correct sync command and workspace', () => {
    render(<CliSyncBridgeCard workspaceId="ws_alpha_team" />);

    expect(
      screen.getByText('npx cashclaw export-sync --workspace=ws_alpha_team --target=cloud'),
    ).toBeDefined();
    expect(screen.getByText('Copy Command')).toBeDefined();
  });

  it('renders NowpaymentsCheckoutModal with correct target tier details', () => {
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
    expect(screen.getByText('Create PREMIUM Order')).toBeDefined();
    expect(screen.getByText(/Payment provider checkout is not configured/)).toBeDefined();
  });

  it('records an order without falsely claiming invoice/payment success', async () => {
    const onSuccess = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, order: { orderId: 'cc-order-1' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<NowpaymentsCheckoutModal isOpen targetTier="PREMIUM" workspaceId="ws_a" onClose={() => {}} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByText('Create PREMIUM Order'));
    expect(await screen.findByText('Pending order recorded')).toBeDefined();
    expect(screen.getByText(/no invoice was created/i)).toBeDefined();
    expect(onSuccess).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('hydrates useWorkspaceBilling state from mocked fetch responses', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/ee/quotas')) {
        return new Response(
          JSON.stringify({ ok: true, tier: 'ENTERPRISE', entitlements: { monthlyLlmCredits: 50000 } }),
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
      const { currentTier, runningBots, consumedCredits, totalCredits } =
        useWorkspaceBilling('ws_test_hydrate');
      return (
        <div>
          <span>{`tier:${currentTier}`}</span>
          <span>{`bots:${runningBots}`}</span>
          <span>{`credits:${consumedCredits}/${totalCredits}`}</span>
        </div>
      );
    }

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByText('tier:ENTERPRISE')).toBeDefined();
      expect(screen.getByText('bots:2')).toBeDefined();
      expect(screen.getByText('credits:8000/50000')).toBeDefined();
    });

    vi.unstubAllGlobals();
  });
});
