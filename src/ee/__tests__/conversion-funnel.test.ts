import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type FunnelEvent,
  recordOptInFunnelEvent,
  summarizeConversionFunnel,
  recommendUpgradeTierForQuotaHit,
} from '../telemetry/conversion-funnel';

describe('Phase 5 (Steps 21-25): Open-Source Growth Engine, CI Governance & Funnel Telemetry', () => {
  it('Step 21 & 22: Ships GitHub Actions Open-Core CI workflow and PR/Issue templates', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const ciYaml = fs.readFileSync(
      path.join(repoRoot, '.github/workflows/open-core-ci.yml'),
      'utf8',
    );
    expect(ciYaml).toContain('open-core-boundary.test.ts');
    expect(ciYaml).toContain('.claude/');

    const prTemplate = fs.readFileSync(
      path.join(repoRoot, '.github/PULL_REQUEST_TEMPLATE.md'),
      'utf8',
    );
    expect(prTemplate).toContain('ADR-001 Paper-Only Guarantee');

    const issueTemplate = fs.readFileSync(
      path.join(repoRoot, '.github/ISSUE_TEMPLATE/alpha-hypothesis.md'),
      'utf8',
    );
    expect(issueTemplate).toContain('causal: true');
  });

  it('Step 23: Documents Open-Core Apache-2.0 vs Cloud SaaS EE architecture', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const archDoc = fs.readFileSync(
      path.join(repoRoot, 'docs/open-core-saas-architecture.md'),
      'utf8',
    );
    expect(archDoc).toContain('Apache-2.0');
    expect(archDoc).toContain('NOWPayments');
    expect(archDoc).toContain('PAPER_ONLY');
  });

  it('Step 24: Respects opt-in privacy flag and computes OSS-to-SaaS conversion rates', () => {
    const sink: FunnelEvent[] = [];

    const ignored = recordOptInFunnelEvent(
      false,
      {
        anonymousInstallId: 'inst_oss_001',
        stage: 'OSS_CLI_QUICKSTART_RUN',
        timestampMs: 1_760_000_000_000,
      },
      sink,
    );
    expect(ignored.ok).toBe(true);
    expect(sink).toHaveLength(0);

    const sampleEvents: FunnelEvent[] = [
      {
        anonymousInstallId: 'inst_001',
        stage: 'OSS_CLI_QUICKSTART_RUN',
        timestampMs: 1_760_000_001_000,
      },
      {
        anonymousInstallId: 'inst_002',
        stage: 'OSS_CLI_QUICKSTART_RUN',
        timestampMs: 1_760_000_002_000,
      },
      {
        anonymousInstallId: 'inst_001',
        stage: 'SYNC_BUNDLE_EXPORTED',
        timestampMs: 1_760_000_003_000,
        strategyId: 'volatilityDca',
      },
      {
        anonymousInstallId: 'inst_001',
        stage: 'CLOUD_BUNDLE_IMPORTED',
        timestampMs: 1_760_000_004_000,
      },
      {
        anonymousInstallId: 'inst_001',
        stage: 'NOWPAYMENTS_TIER_UPGRADED',
        timestampMs: 1_760_000_005_000,
        targetTier: 'PREMIUM',
      },
    ];

    for (const ev of sampleEvents) {
      const res = recordOptInFunnelEvent(true, ev, sink);
      expect(res.ok).toBe(true);
    }

    const summary = summarizeConversionFunnel(sink);
    expect(summary.totalInstalls).toBe(2);
    expect(summary.exportedSyncBundles).toBe(1);
    expect(summary.importedToCloud).toBe(1);
    expect(summary.upgradedPaidWorkspaces).toBe(1);
    expect(summary.cliToCloudRate).toBe(0.5);
    expect(summary.cloudToPaidRate).toBe(1);

    expect(recommendUpgradeTierForQuotaHit('BASIC')).toBe('PREMIUM');
    expect(recommendUpgradeTierForQuotaHit('PREMIUM')).toBe('ENTERPRISE');
    expect(recommendUpgradeTierForQuotaHit('ENTERPRISE')).toBe('MASTER');
  });
});
