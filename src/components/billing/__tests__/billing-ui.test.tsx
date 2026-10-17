// Test suite for Billing & Entitlements UI components
// Validates TierComparisonTable, QuotaUsageCard, NowpaymentsCheckoutModal, CliSyncBridgeCard

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { TierComparisonTable } from '../tier-comparison-table';
import { QuotaUsageCard } from '../quota-usage-card';
import { CliSyncBridgeCard } from '../cli-sync-bridge-card';
import { NowpaymentsCheckoutModal } from '../nowpayments-checkout-modal';

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
    expect(screen.getByText('Pay $29 with USDT')).toBeDefined();
  });
});
