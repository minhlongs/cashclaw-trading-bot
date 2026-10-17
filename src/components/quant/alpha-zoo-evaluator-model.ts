// Pure domain model for AlphaZooEvaluator (Phase 3 Falsification Bridge seed entries)
// Extracted to keep UI components focused and <= 135 LOC.

export type ZooStatus = 'FALSIFIED' | 'NOT_EVALUABLE' | 'IMPORT_SKIPPED';

export interface ZooEntry {
  readonly alphaId: string;
  readonly formula: string;
  readonly category: string;
  readonly spearmanIc: number;
  readonly icIr: number;
  readonly bootstrapCi: string;
  readonly fnvSeed: string;
  readonly status: ZooStatus;
}

export const ZOO_ENTRIES: readonly ZooEntry[] = [
  {
    alphaId: 'vt_alpha_001',
    formula: 'rank(ts_delta(close, 5)) * -1',
    category: 'MEAN_REVERSION',
    spearmanIc: -0.014,
    icIr: -0.21,
    bootstrapCi: '[-0.048, +0.019]',
    fnvSeed: '0x811c9dc5',
    status: 'FALSIFIED',
  },
  {
    alphaId: 'vt_alpha_002',
    formula: 'ts_corr(rank(volume), rank(close), 10)',
    category: 'VOLUME_PRICE',
    spearmanIc: 0.008,
    icIr: 0.14,
    bootstrapCi: '[-0.029, +0.041]',
    fnvSeed: '0x29a4e10b',
    status: 'FALSIFIED',
  },
  {
    alphaId: 'vt_alpha_003',
    formula: 'rank(close - open) / (high - low + 1e-4)',
    category: 'INTRADAY_RANGE',
    spearmanIc: 0.0,
    icIr: 0.0,
    bootstrapCi: 'N/A (Const Signal)',
    fnvSeed: '0x7c3b09f2',
    status: 'NOT_EVALUABLE',
  },
  {
    alphaId: 'vt_alpha_005',
    formula: 'indneutralize(vwap - close, sector)',
    category: 'EQUITY_SECTOR',
    spearmanIc: 0.0,
    icIr: 0.0,
    bootstrapCi: 'N/A (Missing Field)',
    fnvSeed: '0x5f901a44',
    status: 'IMPORT_SKIPPED',
  },
];
