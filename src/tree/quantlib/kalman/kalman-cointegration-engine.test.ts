import { describe, it, expect } from 'vitest';
import { KalmanCointegrationEngine } from './kalman-cointegration-engine';

describe('KalmanCointegrationEngine', () => {
  it('converges to true hedge ratio beta for synthetic cointegrated series', () => {
    const engine = new KalmanCointegrationEngine({ delta: 1e-4, rVariance: 1e-3 });
    const trueBeta = 1.75;
    const trueAlpha = 10.0;

    let finalState = engine.update({ priceX: 100, priceY: 100 * trueBeta + trueAlpha });

    for (let i = 1; i <= 200; i++) {
      const priceX = 100 + Math.sin(i * 0.1) * 20;
      const noise = ((i % 5) - 2) * 0.05;
      const priceY = priceX * trueBeta + trueAlpha + noise;
      finalState = engine.update({ priceX, priceY });
    }

    expect(Math.abs(finalState.beta - trueBeta)).toBeLessThan(0.1);
  });

  it('estimates mean-reverting Ornstein-Uhlenbeck half-life', () => {
    const engine = new KalmanCointegrationEngine();
    let state = engine.update({ priceX: 100, priceY: 100 });

    for (let i = 0; i < 20; i++) {
      const noise = (i % 2 === 0 ? 1 : -1) * 0.5;
      state = engine.update({ priceX: 100, priceY: 100 + noise });
    }

    expect(state.halfLifeBars).toBeGreaterThan(0);
  });
});
