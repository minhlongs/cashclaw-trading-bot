import { describe, it, expect } from 'vitest';
import { initializeKalmanState, updateKalmanState } from './kalman-filter-hedge';
import { estimateOuParameters } from './ou-cointegration-estimator';
import { generateStatArbSignal } from './statarb-signal-generator';

describe('KalmanFilterHedge', () => {
  it('converges to true hedge ratio in linear relationship', () => {
    let state = initializeKalmanState(0.5, 1.0);
    const trueBeta = 1.5;
    const trueAlpha = 0.0;

    for (let i = 1; i <= 250; i++) {
      const x = 50 + i * 0.5;
      const y = trueAlpha + trueBeta * x + (Math.sin(i) * 0.05);
      const update = updateKalmanState(state, x, y);
      state = update.nextState;
    }

    expect(Math.abs(state.beta - trueBeta)).toBeLessThan(0.05);
    expect(state.alpha).toBeCloseTo(trueAlpha, 0);
  });
});

describe('OuCointegrationEstimator', () => {
  it('handles small series gracefully', () => {
    const res = estimateOuParameters([1.0, 2.0]);
    expect(res.halfLifeBars).toBe(Infinity);
    expect(res.theta).toBe(0);
  });

  it('correctly estimates mean-reverting series properties', () => {
    // Generate synthetic OU series: x_t = 0.8 * x_{t-1} + 0.2 * 10
    const series = [10.0];
    for (let i = 1; i < 200; i++) {
      const prev = series[i - 1];
      const next = 0.8 * prev + 2.0 + (Math.sin(i) * 0.5);
      series.push(next);
    }

    const metrics = estimateOuParameters(series);
    expect(metrics.theta).toBeGreaterThan(0);
    expect(metrics.halfLifeBars).toBeGreaterThan(0);
    expect(metrics.halfLifeBars).toBeLessThan(10);
    expect(metrics.mu).toBeCloseTo(10, 0);
  });
});

describe('StatArbSignalGenerator', () => {
  it('returns HOLD when volatility is zero', () => {
    const signal = generateStatArbSignal(10, 10, 0, 1.5);
    expect(signal.action).toBe('HOLD');
  });

  it('triggers ENTER_LONG_SPREAD when spread is under -2 sigma', () => {
    const signal = generateStatArbSignal(6.0, 10.0, 1.5, 1.2); // (6 - 10) / 1.5 = -2.67
    expect(signal.action).toBe('ENTER_LONG_SPREAD');
  });

  it('triggers ENTER_SHORT_SPREAD when spread is above +2 sigma', () => {
    const signal = generateStatArbSignal(14.0, 10.0, 1.5, 1.2); // (14 - 10) / 1.5 = +2.67
    expect(signal.action).toBe('ENTER_SHORT_SPREAD');
  });

  it('triggers EXIT_SPREAD when spread is near equilibrium', () => {
    const signal = generateStatArbSignal(10.2, 10.0, 1.5, 1.2); // (10.2 - 10) / 1.5 = 0.13
    expect(signal.action).toBe('EXIT_SPREAD');
  });

  it('triggers EXIT_SPREAD on extreme divergence stop loss', () => {
    const signal = generateStatArbSignal(20.0, 10.0, 1.5, 1.2); // (20 - 10) / 1.5 = 6.67
    expect(signal.action).toBe('EXIT_SPREAD');
    expect(signal.reason).toContain('stop-loss');
  });
});
