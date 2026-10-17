// Stress & Falsification Audit Test Suite for ADR-001 Paper-Only Invariant
// Verifies fail-closed paper trading invariants, secret stripping, and QuantLib boundary resilience.

import { describe, it, expect } from 'vitest';
import {
  createLocalToCloudSyncBundle,
  verifyAndImportCloudSyncBundle,
  type SyncStrategyConfig,
  type SignedCloudSyncBundle,
} from '../../ee/sync/local-to-cloud-sync';
import { volatilityDca, grid, meanReversion } from '../quantlib';

describe('ADR-001 Paper-Only Safety Invariant & Falsification Stress', () => {
  const baseConfig: SyncStrategyConfig = {
    botName: 'StressPaperBot',
    symbol: 'BTC/USDT',
    strategyId: 'volatilityDca',
    intervalMinutes: 5,
    feeBps: 10,
    slippageBps: 5,
    parameters: {
      gridLevels: 5,
      api_key_secret: 'LEAKED_PRIVATE_KEY_SHOULD_BE_STRIPPED',
      telegram_token: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    },
  };

  it('ADR-001: strictly strips API keys and secrets from strategy parameters', async () => {
    const exportResult = await createLocalToCloudSyncBundle(baseConfig);
    expect(exportResult.ok).toBe(true);

    if (exportResult.ok) {
      const bundle = exportResult.data;
      expect(bundle.safetyMode).toBe('PAPER_ONLY');
      expect(bundle.payload.parameters.gridLevels).toBe(5);
      expect(bundle.payload.parameters.api_key_secret).toBeUndefined();
      expect(bundle.payload.parameters.telegram_token).toBeUndefined();
    }
  });

  it('ADR-001: rejects any non-PAPER_ONLY safetyMode payload', async () => {
    const exportResult = await createLocalToCloudSyncBundle(baseConfig);
    expect(exportResult.ok).toBe(true);

    if (exportResult.ok) {
      const illegalLiveBundle = {
        ...exportResult.data,
        safetyMode: 'LIVE_TRADING',
      } as unknown as SignedCloudSyncBundle;

      const importResult = await verifyAndImportCloudSyncBundle(illegalLiveBundle);
      expect(importResult.ok).toBe(false);
      if (!importResult.ok) {
        expect(importResult.error).toContain('ADR_001_VIOLATION');
      }
    }
  });

  it('detects payload tampering and rejects with SYNC_CHECKSUM_MISMATCH', async () => {
    const exportResult = await createLocalToCloudSyncBundle(baseConfig);
    expect(exportResult.ok).toBe(true);

    if (exportResult.ok) {
      const tamperedBundle: SignedCloudSyncBundle = {
        ...exportResult.data,
        payload: {
          ...exportResult.data.payload,
          feeBps: 99, // Tampered fee parameter
        },
      };

      const importResult = await verifyAndImportCloudSyncBundle(tamperedBundle);
      expect(importResult.ok).toBe(false);
      if (!importResult.ok) {
        expect(importResult.error).toContain('SYNC_CHECKSUM_MISMATCH');
      }
    }
  });

  it('QuantLib Stress: volatilityDca, grid, and meanReversion survive extreme numerical bounds', () => {
    const extremeCases = [
      { symbol: 'ETH/USDT', balance: 0, lastPrice: 1 },
      { symbol: 'ETH/USDT', balance: 1e9, lastPrice: 1e6 },
      { symbol: 'BTC/USDT', balance: 500, lastPrice: 0.00000001 },
    ];

    for (const ctx of extremeCases) {
      const dcaRes = volatilityDca(ctx, { period: 10, devThreshold: 2 });
      expect(['buy', 'sell', 'hold']).toContain(dcaRes.signal);
      expect(dcaRes.confidence).toBeGreaterThanOrEqual(0);
      expect(dcaRes.confidence).toBeLessThanOrEqual(1);

      const gridRes = grid(ctx, { levels: 10, spacingPct: 0.01 });
      expect(['buy', 'sell', 'hold']).toContain(gridRes.signal);

      const mrRes = meanReversion(ctx, { period: 20, threshold: 1.5 });
      expect(['buy', 'sell', 'hold']).toContain(mrRes.signal);
    }
  });
});
