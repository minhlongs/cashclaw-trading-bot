// Pure Survival Gate Checklist & Pillar Filter Model

export type GatePillar = 'STRUCTURAL' | 'ECONOMIC';

export interface SurvivalCheckItem {
  readonly gateId: string;
  readonly pillar: GatePillar;
  readonly criterion: string;
  readonly threshold: string;
  readonly observed: string;
  readonly passed: boolean;
}

export const GATE_PILLAR_FILTERS: readonly ('ALL' | GatePillar)[] = [
  'ALL',
  'STRUCTURAL',
  'ECONOMIC',
];

export const SURVIVAL_CHECKS: readonly SurvivalCheckItem[] = [
  { gateId: 'STR-01', pillar: 'STRUCTURAL', criterion: 'Causal Feature Alignment', threshold: '0 Lookahead Ops', observed: '0 Lookahead', passed: true },
  { gateId: 'STR-02', pillar: 'STRUCTURAL', criterion: 'OHLCV 9-Validator Fence', threshold: 'PASS (0 Outages)', observed: 'PASS (730 Bars)', passed: true },
  { gateId: 'STR-03', pillar: 'STRUCTURAL', criterion: 'Walk-Forward Window Floor', threshold: '>= 12 Windows', observed: '16 Windows', passed: true },
  { gateId: 'STR-04', pillar: 'STRUCTURAL', criterion: 'Deterministic FNV-1a32 Seed', threshold: 'Byte-Identical', observed: 'Verified', passed: true },
  { gateId: 'ECO-01', pillar: 'ECONOMIC', criterion: 'Out-of-Sample Net Sharpe', threshold: '>= 1.25', observed: '0.41', passed: false },
  { gateId: 'ECO-02', pillar: 'ECONOMIC', criterion: 'EXTREME (35 bps) Stress SR', threshold: '>= 0.75', observed: '-0.18', passed: false },
  { gateId: 'ECO-03', pillar: 'ECONOMIC', criterion: 'Max Stressed Drawdown Cap', threshold: '<= 15.0%', observed: '18.9%', passed: false },
  { gateId: 'ECO-04', pillar: 'ECONOMIC', criterion: 'Walk-Forward Positive Ratio', threshold: '>= 70.0%', observed: '43.8%', passed: false },
];

export function filterSurvivalChecks(
  pillarFilter: 'ALL' | GatePillar,
  checks: readonly SurvivalCheckItem[] = SURVIVAL_CHECKS,
): readonly SurvivalCheckItem[] {
  if (pillarFilter === 'ALL') return checks;
  return checks.filter((c) => c.pillar === pillarFilter);
}
