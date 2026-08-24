import { describe, it, expect } from 'vitest';
import { runPairSpreadSim } from './simulator';
import { divergePanel, ouPanel, simConfig } from './simulator-fixtures';

// Determinism acceptance gate: identical inputs → deeply equal outputs.
// The simulator is pure (no Math.random/Date.now), so two runs on freshly
// built panels must match field-for-field, warnings and trail included.

describe('runPairSpreadSim — determinism', () => {
  it('repeats the divergent-leg scenario identically across runs', () => {
    const config = simConfig({ hedgeWindow: 10, entryZ: 2.2 });
    const first = runPairSpreadSim(divergePanel(), config);
    const second = runPairSpreadSim(divergePanel(), config);
    expect(second).toEqual(first);
  });

  it('repeats the hand-computed OU fixture identically across runs', () => {
    const first = runPairSpreadSim(ouPanel(), simConfig());
    const second = runPairSpreadSim(ouPanel(), simConfig());
    expect(second).toEqual(first);
  });
});
