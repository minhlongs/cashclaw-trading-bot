// Pure domain model and step-up p-value evaluation for FdrMultipleTestingGate
// Extracted to keep UI components focused and <= 135 LOC.

export type GateMethod = 'BH_FDR' | 'HOLM_BONFERRONI';

export interface CandidateTrial {
  readonly hypothesisId: string;
  readonly family: string;
  readonly rawPValue: number;
  readonly observedSharpe: number;
}

export interface EvaluatedFdrRow extends CandidateTrial {
  readonly rank: number;
  readonly criticalP: number;
  readonly dsr: number;
  readonly verdict: 'SURVIVED' | 'REJECTED_FDR';
}

export const CANDIDATE_TRIALS: readonly CandidateTrial[] = [
  { hypothesisId: 'HYP-ZOO-001', family: 'CROSS_SECTIONAL_MOM', rawPValue: 0.004, observedSharpe: 2.18 },
  { hypothesisId: 'HYP-ZOO-004', family: 'VOL_ADJUSTED_DCA', rawPValue: 0.011, observedSharpe: 1.92 },
  { hypothesisId: 'HYP-ZOO-007', family: 'OFI_MICRO_REVERSION', rawPValue: 0.024, observedSharpe: 1.54 },
  { hypothesisId: 'HYP-ZOO-009', family: 'FUNDING_BASIS_CARRY', rawPValue: 0.048, observedSharpe: 1.21 },
  { hypothesisId: 'HYP-ZOO-012', family: 'ILLIQUIDITY_SHOCK', rawPValue: 0.089, observedSharpe: 0.84 },
];

export function evaluateFdrTrials(
  fdrAlpha: number,
  totalTrials: number,
  method: GateMethod,
): readonly EvaluatedFdrRow[] {
  const trialPenalty = Math.log(totalTrials / 10) * 0.22;
  return CANDIDATE_TRIALS.map((trial, index) => {
    const rank = index + 1;
    const criticalP =
      method === 'BH_FDR'
        ? (rank / totalTrials) * fdrAlpha
        : fdrAlpha / (totalTrials - rank + 1);
    const dsr = Number(Math.max(0, trial.observedSharpe - trialPenalty).toFixed(2));
    const survived = trial.rawPValue <= criticalP && dsr >= 1.25;
    return {
      ...trial,
      rank,
      criticalP,
      dsr,
      verdict: survived ? ('SURVIVED' as const) : ('REJECTED_FDR' as const),
    };
  });
}
