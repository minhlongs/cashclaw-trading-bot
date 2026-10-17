export interface WalkForwardWindow {
  windowIndex: number;
  label: string;
  inSampleIc: number;
  outOfSampleSharpe: number;
  maxDrawdown: number;
  survivalGate: 'PASS' | 'KILLED';
}

export const MOCK_WALK_FORWARD_WINDOWS: ReadonlyArray<WalkForwardWindow> = [
  { windowIndex: 1, label: 'W01: 2025-Q1', inSampleIc: 0.084, outOfSampleSharpe: 2.14, maxDrawdown: -0.042, survivalGate: 'PASS' },
  { windowIndex: 2, label: 'W02: 2025-Q2', inSampleIc: 0.076, outOfSampleSharpe: 1.95, maxDrawdown: -0.051, survivalGate: 'PASS' },
  { windowIndex: 3, label: 'W03: 2025-Q3', inSampleIc: 0.062, outOfSampleSharpe: 1.78, maxDrawdown: -0.064, survivalGate: 'PASS' },
  { windowIndex: 4, label: 'W04: 2025-Q4', inSampleIc: 0.089, outOfSampleSharpe: 2.22, maxDrawdown: -0.038, survivalGate: 'PASS' },
  { windowIndex: 5, label: 'W05: 2026-Q1', inSampleIc: 0.071, outOfSampleSharpe: 1.84, maxDrawdown: -0.058, survivalGate: 'PASS' },
  { windowIndex: 6, label: 'W06: 2026-Q2', inSampleIc: 0.068, outOfSampleSharpe: 1.69, maxDrawdown: -0.061, survivalGate: 'PASS' },
  { windowIndex: 7, label: 'W07: 2026-Q3', inSampleIc: 0.081, outOfSampleSharpe: 2.05, maxDrawdown: -0.047, survivalGate: 'PASS' },
  { windowIndex: 8, label: 'W08: 2026-Q4', inSampleIc: 0.075, outOfSampleSharpe: 1.92, maxDrawdown: -0.054, survivalGate: 'PASS' },
];
