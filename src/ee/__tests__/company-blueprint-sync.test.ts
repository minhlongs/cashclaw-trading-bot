// Test suite ensuring 100% synchronization between Company Blueprint, Manifest, and 25-step Code Catalog
// Strictly < 200 LOC, zero :any, pure TypeScript

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OPEN_CORE_25_STEPS, evaluateOpenCoreCatalog } from '@/ee/catalog/open-core-25-steps-catalog';
import { SAAS_TIER_ENTITLEMENTS } from '@/ee/billing/tier-entitlements';
import type { SaasTier } from '@/ee/tenancy/tenant-policy';

describe('CashClaw Company Blueprint & Tasks Ledger Synchronization', () => {
  const repoRoot = path.resolve(__dirname, '../../../');
  const blueprintTasksPath = path.join(repoRoot, 'plans/company-blueprint/tasks.md');
  const blueprintPlanPath = path.join(repoRoot, 'plans/company-blueprint/plan.md');
  const companyJsonPath = path.join(repoRoot, '.mekong/company.json');

  it('validates .mekong/company.json matches catalog governance numbers and tiers', () => {
    expect(fs.existsSync(companyJsonPath)).toBe(true);
    const content = fs.readFileSync(companyJsonPath, 'utf8');
    const company = JSON.parse(content);

    expect(company.slug).toBe('cashclaw');
    expect(company.model).toBe('OPEN_CORE_DUAL_LICENSE');
    expect(company.targetArrUsd).toBe(1_000_000);
    expect(company.governance.totalSteps).toBe(25);
    expect(company.governance.apacheSteps).toBe(14);
    expect(company.governance.commercialSteps).toBe(11);
    expect(company.governance.adr001SafetyMode).toBe('PAPER_BACKTEST_ONLY');
    expect(company.tiers.length).toBe(4);

    for (const tierObj of company.tiers) {
      const tierKey = tierObj.id as SaasTier;
      const entitlement = SAAS_TIER_ENTITLEMENTS[tierKey];
      expect(entitlement).toBeDefined();
      expect(tierObj.priceUsd).toBe(entitlement.priceUsdMonthly);
      expect(tierObj.maxBots).toBe(entitlement.maxRunningPaperBots);
    }
  });

  it('validates plans/company-blueprint/plan.md exists and contains dual-license blueprint', () => {
    expect(fs.existsSync(blueprintPlanPath)).toBe(true);
    const planText = fs.readFileSync(blueprintPlanPath, 'utf8');

    expect(planText).toContain('Apache-2.0 Community Core');
    expect(planText).toContain('ADR-001');
    expect(planText).toContain('$1M ARR');
    expect(planText).toContain('Phase 1');
    expect(planText).toContain('Phase 5');
    expect(planText.split('\n').length).toBeLessThanOrEqual(200);
  });

  it('validates plans/company-blueprint/tasks.md contains all 25 checked [x] steps and matches catalog', () => {
    expect(fs.existsSync(blueprintTasksPath)).toBe(true);
    const tasksText = fs.readFileSync(blueprintTasksPath, 'utf8');

    expect(tasksText.split('\n').length).toBeLessThanOrEqual(200);

    const checkedStepMatches = tasksText.match(/- \[x\] \*\*Step (\d+):/g) || [];
    expect(checkedStepMatches.length).toBe(25);

    for (let i = 1; i <= 25; i++) {
      expect(tasksText).toContain(`- [x] **Step ${i}:`);
      const catalogStep = OPEN_CORE_25_STEPS.find((s) => s.stepNumber === i);
      expect(catalogStep).toBeDefined();
      if (catalogStep) {
        expect(tasksText).toContain(catalogStep.title);
        expect(tasksText).toContain(catalogStep.artifactPath);
      }
    }
  });

  it('verifies all 25 catalog artifacts are present on disk without any missing file', () => {
    const summary = evaluateOpenCoreCatalog((relPath) =>
      fs.existsSync(path.join(repoRoot, relPath)),
    );

    expect(summary.totalSteps).toBe(25);
    expect(summary.apacheStepsCount).toBe(14);
    expect(summary.commercialStepsCount).toBe(11);
    expect(summary.missingArtifacts).toEqual([]);
    expect(summary.verifiedStepsCount).toBe(25);
    expect(summary.allVerified).toBe(true);
  });
});
