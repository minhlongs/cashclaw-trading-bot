import { describe, it, expect } from 'vitest';
import {
  QUANTLIB_OSS_VERSION,
  QUANTLIB_LICENSE,
  CorwinSchultzEngine,
  GarmanKlassVolatilityEngine,
  LesmondLotEngine,
  volatilityDca,
  runHamiltonMarkovFilter,
  computeHrpRecursiveBisection,
  computeAlmgrenChrissTrajectory,
  HayashiYoshidaEngine,
  computeHawkesIntensity,
  computeOrderBookImbalance,
  GatheralRoughVolatilityEngine,
  runBipowerJumpEstimation,
  computeDupireMartingaleSurface,
  computeRoughPathLevySignature,
} from '../../quantlib/public-sdk';
import {
  ALPHA_ZOO_OSS_VERSION,
  ALPHA_ZOO_LICENSE,
  SUPPORTED_OPERATORS,
  normalizeFormula,
} from '../../research/alpha/zoo/public-sdk';
import { resolveEditionConfig } from '../../../lib/edition/edition-mode';
import { generateCliPaperReport } from '../paper-cli-report';
import { QUICKSTART_DEMO_FIXTURES } from '../quickstart-fixture';

describe('Phase 2 (Steps 6-10): Modular Package Extraction & CLI Experience', () => {
  it('Step 6: @cashclaw/quantlib public SDK exports flagship engines under Apache-2.0', () => {
    expect(QUANTLIB_LICENSE).toBe('Apache-2.0');
    expect(QUANTLIB_OSS_VERSION).toContain('open-core');
    expect(typeof CorwinSchultzEngine.calculate).toBe('function');
    expect(typeof GarmanKlassVolatilityEngine.calculate).toBe('function');
    expect(typeof LesmondLotEngine.calculate).toBe('function');
    expect(typeof volatilityDca).toBe('function');
    expect(typeof runHamiltonMarkovFilter).toBe('function');
    expect(typeof computeHrpRecursiveBisection).toBe('function');
    expect(typeof computeAlmgrenChrissTrajectory).toBe('function');
    expect(typeof HayashiYoshidaEngine).toBe('function');
    expect(typeof computeHawkesIntensity).toBe('function');
    expect(typeof computeOrderBookImbalance).toBe('function');
    expect(typeof GatheralRoughVolatilityEngine).toBe('function');
    expect(typeof runBipowerJumpEstimation).toBe('function');
    expect(typeof computeDupireMartingaleSurface).toBe('function');
    expect(typeof computeRoughPathLevySignature).toBe('function');
  });

  it('Step 7: @cashclaw/alpha-zoo public SDK exports causal operator vocabulary', () => {
    expect(ALPHA_ZOO_LICENSE).toBe('Apache-2.0');
    expect(ALPHA_ZOO_OSS_VERSION).toContain('open-core');
    expect(SUPPORTED_OPERATORS.length).toBeGreaterThanOrEqual(17);
    const norm = normalizeFormula('rank(close)');
    expect(norm.ok).toBe(true);
  });

  it('Step 8: Edition mode defaults to OSS_LOCAL and switches to CLOUD_SAAS when configured', () => {
    const oss = resolveEditionConfig({});
    expect(oss.mode).toBe('OSS_LOCAL');
    expect(oss.license).toBe('Apache-2.0');
    expect(oss.singleUserLocal).toBe(true);
    expect(oss.billingEnabled).toBe(false);

    const cloud = resolveEditionConfig({
      CASHCLAW_EDITION: 'CLOUD_SAAS',
      CASHCLAW_CLOUD_URL: 'https://app.cashclaw.io/pro',
    });
    expect(cloud.mode).toBe('CLOUD_SAAS');
    expect(cloud.license).toBe('CashClaw-Commercial');
    expect(cloud.singleUserLocal).toBe(false);
    expect(cloud.billingEnabled).toBe(true);
    expect(cloud.cloudUpgradeUrl).toBe('https://app.cashclaw.io/pro');
  });

  it('Steps 9 & 10: Quickstart fixture and CLI report produce deterministic paper metrics + Cloud CTA', () => {
    expect(QUICKSTART_DEMO_FIXTURES).toHaveLength(3);
    const report = generateCliPaperReport();

    expect(report.edition).toBe('OSS_LOCAL');
    expect(report.license).toBe('Apache-2.0');
    expect(report.metrics).toHaveLength(3);
    expect(report.metrics[0].safetyMode).toBe('PAPER_ONLY');
    expect(report.metrics[0].feeAndSlippageBps).toBeGreaterThan(0);
    expect(typeof report.metrics[0].roughPathLevyArea12).toBe('number');
    expect(report.formattedOutput).toContain('Sync in 1 click: https://cloud.cashclaw.io/sync?source=oss-cli');
  });
});
