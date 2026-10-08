import { describe, it, expect } from 'vitest';
import { evaluateExecutionUrgency } from './microstructure-urgency-guard';

describe('microstructure-urgency-guard', () => {
  it('triggers PAUSED_COOLDOWN when VPIN exceeds toxicity threshold', () => {
    const res = evaluateExecutionUrgency({
      vpinToxicity: 0.75,
      ofiSignal: 0.1,
      intendedSide: 'buy',
    });
    expect(res.mode).toBe('PAUSED_COOLDOWN');
    expect(res.reason).toContain('High VPIN toxicity');
  });

  it('triggers PASSIVE_POST_ONLY when OFI shows adverse book pressure', () => {
    const buyAdverse = evaluateExecutionUrgency({
      vpinToxicity: 0.4,
      ofiSignal: -0.6,
      intendedSide: 'buy',
    });
    expect(buyAdverse.mode).toBe('PASSIVE_POST_ONLY');

    const sellAdverse = evaluateExecutionUrgency({
      vpinToxicity: 0.3,
      ofiSignal: 0.55,
      intendedSide: 'sell',
    });
    expect(sellAdverse.mode).toBe('PASSIVE_POST_ONLY');
  });

  it('returns AGGRESSIVE_TAKER when conditions are benign', () => {
    const normal = evaluateExecutionUrgency({
      vpinToxicity: 0.2,
      ofiSignal: 0.2,
      intendedSide: 'buy',
    });
    expect(normal.mode).toBe('AGGRESSIVE_TAKER');
  });
});
