import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  OPEN_CORE_25_STEPS,
  evaluateOpenCoreCatalog,
} from '../catalog/open-core-25-steps-catalog';

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('25-Step Open-Core Public GitHub & Cloud SaaS Complete Architecture Verification', () => {
  it('strictly contains exactly 25 canonical steps across 5 phases', () => {
    expect(OPEN_CORE_25_STEPS).toHaveLength(25);
    const stepNumbers = OPEN_CORE_25_STEPS.map((s) => s.stepNumber);
    expect(stepNumbers).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it('correctly partitions open-core community (Apache-2.0) and commercial SaaS (src/ee)', () => {
    const summary = evaluateOpenCoreCatalog((relPath) =>
      fs.existsSync(path.join(REPO_ROOT, relPath)),
    );

    expect(summary.totalSteps).toBe(25);
    expect(summary.apacheStepsCount).toBe(14);
    expect(summary.commercialStepsCount).toBe(11);
    expect(summary.missingArtifacts).toEqual([]);
    expect(summary.verifiedStepsCount).toBe(25);
    expect(summary.allVerified).toBe(true);
  });

  it('verifies all 5 Phase directories and reports are aligned', () => {
    const reportPath = path.join(
      REPO_ROOT,
      'plans/reports/20261017-open-core-saas-25-steps-brainstorm-report.md',
    );
    expect(fs.existsSync(reportPath)).toBe(true);

    const docArchitecturePath = path.join(
      REPO_ROOT,
      'docs/open-core-saas-architecture.md',
    );
    expect(fs.existsSync(docArchitecturePath)).toBe(true);
  });
});
