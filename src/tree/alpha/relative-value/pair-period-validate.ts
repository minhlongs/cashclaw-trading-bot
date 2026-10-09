import type { PairPanel, PairSimConfig } from './types';

export function assertPositiveCloses(panel: PairPanel, prefix: string): void {
  const n = panel.timestamps.length;
  for (let i = 0; i < n; i++) {
    const a = panel.closesA[i]!, b = panel.closesB[i]!;
    if (!Number.isFinite(a) || a <= 0) throw new Error(`${prefix}: legA close must be positive finite at index ${i}`);
    if (!Number.isFinite(b) || b <= 0) throw new Error(`${prefix}: legB close must be positive finite at index ${i}`);
  }
}

export function validateStructure(panel: PairPanel, config: PairSimConfig): void {
  if (panel.timestamps.length === 0) throw new Error('runPairSpreadSim: panel must be non-empty');
  const n = panel.timestamps.length;
  if (n !== panel.closesA.length || n !== panel.closesB.length) {
    throw new Error('runPairSpreadSim: panel array lengths differ');
  }
  if (!Number.isInteger(config.minObservations) || config.minObservations < 1) {
    throw new Error('runPairSpreadSim: minObservations must be a positive integer');
  }
  if (n < config.minObservations) {
    throw new Error(`runPairSpreadSim: ${n} observations below minObservations ${config.minObservations}`);
  }
  if (!Number.isInteger(config.revalidateEvery) || config.revalidateEvery <= 0) {
    throw new Error('runPairSpreadSim: revalidateEvery must be a positive integer');
  }
  assertPositiveCloses(panel, 'runPairSpreadSim');
  for (let i = 1; i < n; i++) {
    if (panel.timestamps[i]! <= panel.timestamps[i - 1]!) {
      throw new Error('runPairSpreadSim: timestamps must be strictly increasing');
    }
  }
}
