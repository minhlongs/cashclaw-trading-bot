// ResearchSynthesis + RiskScenarioSet contract tests — fail-closed parsing,
// approval/sizing field rejection (synthesis cannot approve, advisor cannot
// size), malformed output, missing evidence.

import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_APPROVAL_FIELDS,
  parseResearchSynthesis,
} from './research-synthesis';
import {
  FORBIDDEN_SIZING_FIELDS,
  parseRiskScenarioSet,
  RISK_VIEWS,
} from './risk-scenario-set';

function makeSynthesis(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    thesis: 'Funding dislocation may indicate crowded short positioning',
    strongestEvidence: 'funding at -0.05% for 12 consecutive prints',
    strongestCounterEvidence: 'spot inflows remain positive',
    unresolvedUncertainty: 'whether liquidation cascade is bounded',
    falsifiableAssumptions: [
      { statement: 'cascade is bounded', howToFalsify: 'observe >2x avg liquidation volume' },
    ],
    proposedExperiments: [
      { hypothesisRef: 'delib-bull-abc', method: 'OOS backtest over 90d' },
    ],
    ...overrides,
  };
}

function makeScenario(view: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    view,
    expectedRegime: 'HIGH_VOLATILITY',
    keyRisks: ['gap risk'],
    failureConditions: ['funding flips positive'],
    maxAcceptableExposure: 0.2,
    liquidityConcern: 'thin order book at extremes',
    volatilityConcern: 'realized vol may double',
    correlationConcern: 'cross-asset correlation spike',
    ...overrides,
  };
}

function makeRiskSet(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    goalId: 'goal-1',
    proposalId: 'prop-1',
    scenarios: RISK_VIEWS.map((v) => makeScenario(v)),
    advisoryNote: 'advisory only; sizing decided by portfolio engine',
    ...overrides,
  };
}

describe('parseResearchSynthesis — happy path', () => {
  it('parses a valid synthesis', () => {
    const result = parseResearchSynthesis(makeSynthesis());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.falsifiableAssumptions).toHaveLength(1);
    expect(result.value.proposedExperiments).toHaveLength(1);
  });
});

describe('parseResearchSynthesis — approval forbidden (§C, §L)', () => {
  it.each(FORBIDDEN_APPROVAL_FIELDS.map((f) => [f]))('rejects approval field %s', (field) => {
    const result = parseResearchSynthesis(makeSynthesis({ [field]: true }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain(`approval field '${field}' is forbidden`);
  });
});

describe('parseResearchSynthesis — malformed output', () => {
  it('rejects non-object input', () => {
    expect(parseResearchSynthesis(null).ok).toBe(false);
    expect(parseResearchSynthesis('x').ok).toBe(false);
  });

  it('rejects empty falsifiableAssumptions', () => {
    const result = parseResearchSynthesis(makeSynthesis({ falsifiableAssumptions: [] }));
    expect(result.ok).toBe(false);
  });

  it('rejects empty proposedExperiments', () => {
    const result = parseResearchSynthesis(makeSynthesis({ proposedExperiments: [] }));
    expect(result.ok).toBe(false);
  });

  it('rejects empty thesis', () => {
    const result = parseResearchSynthesis(makeSynthesis({ thesis: '' }));
    expect(result.ok).toBe(false);
  });

  it('collects ALL issues', () => {
    const result = parseResearchSynthesis(
      makeSynthesis({ thesis: '', strongestEvidence: '', falsifiableAssumptions: [] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe('parseRiskScenarioSet — happy path', () => {
  it('parses a valid 3-view scenario set', () => {
    const result = parseRiskScenarioSet(makeRiskSet());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scenarios).toHaveLength(3);
  });
});

describe('parseRiskScenarioSet — sizing forbidden (§D, §L)', () => {
  it.each(FORBIDDEN_SIZING_FIELDS.map((f) => [f]))('rejects sizing field %s', (field) => {
    const result = parseRiskScenarioSet(makeRiskSet({ [field]: 1 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain(`sizing field '${field}' is forbidden`);
  });
});

describe('parseRiskScenarioSet — malformed output', () => {
  it('rejects non-object input', () => {
    expect(parseRiskScenarioSet(null).ok).toBe(false);
  });

  it('rejects empty scenarios', () => {
    const result = parseRiskScenarioSet(makeRiskSet({ scenarios: [] }));
    expect(result.ok).toBe(false);
  });

  it('rejects maxAcceptableExposure outside [0,1]', () => {
    const bad = makeRiskSet({ scenarios: [makeScenario('aggressive', { maxAcceptableExposure: 1.5 })] });
    expect(parseRiskScenarioSet(bad).ok).toBe(false);
    const neg = makeRiskSet({ scenarios: [makeScenario('aggressive', { maxAcceptableExposure: -0.1 })] });
    expect(parseRiskScenarioSet(neg).ok).toBe(false);
  });

  it('rejects empty keyRisks in a scenario', () => {
    const bad = makeRiskSet({ scenarios: [makeScenario('neutral', { keyRisks: [] })] });
    expect(parseRiskScenarioSet(bad).ok).toBe(false);
  });
});
