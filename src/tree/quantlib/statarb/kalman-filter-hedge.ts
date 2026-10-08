// Recursive Online Kalman Filter for Dynamic Hedge Ratio Estimation (y = alpha + beta * x)
import type { KalmanState, KalmanFilterConfig } from './statarb-types';

export const DEFAULT_KALMAN_CONFIG: KalmanFilterConfig = {
  processNoiseVar: 1e-5,
  measurementNoiseVar: 1e-3,
};

export function initializeKalmanState(initialBeta = 1.0, initialVariance = 1.0): KalmanState {
  return {
    alpha: 0.0,
    beta: initialBeta,
    p00: initialVariance,
    p01: 0.0,
    p10: 0.0,
    p11: initialVariance,
  };
}

export function updateKalmanState(
  state: KalmanState,
  x: number, // Independent asset price (e.g. BTC)
  y: number, // Dependent asset price (e.g. ETH)
  config: KalmanFilterConfig = DEFAULT_KALMAN_CONFIG,
): { nextState: KalmanState; predictedY: number; residual: number } {
  // 1. Time Update (Predict prior covariance: P_prior = P + Q)
  const p00Prior = state.p00 + config.processNoiseVar;
  const p01Prior = state.p01;
  const p10Prior = state.p10;
  const p11Prior = state.p11 + config.processNoiseVar;

  // 2. Observation prediction: y_pred = alpha + beta * x
  const predictedY = state.alpha + state.beta * x;
  const residual = y - predictedY;

  // 3. Measurement prediction variance: S = H * P_prior * H' + R
  // H = [1, x] -> H * P_prior = [p00Prior + x * p10Prior, p01Prior + x * p11Prior]
  const hp0 = p00Prior + x * p10Prior;
  const hp1 = p01Prior + x * p11Prior;
  const s = hp0 + hp1 * x + config.measurementNoiseVar;

  // 4. Kalman Gain: K = P_prior * H' / S
  // P_prior * H' = [p00Prior + p01Prior * x, p10Prior + p11Prior * x]
  const k0 = (p00Prior + p01Prior * x) / s;
  const k1 = (p10Prior + p11Prior * x) / s;

  // 5. State Update
  const nextAlpha = state.alpha + k0 * residual;
  const nextBeta = state.beta + k1 * residual;

  // 6. Covariance Update: P_post = (I - K * H) * P_prior
  const nextP00 = p00Prior - k0 * hp0;
  const nextP01 = p01Prior - k0 * hp1;
  const nextP10 = p10Prior - k1 * hp0;
  const nextP11 = p11Prior - k1 * hp1;

  return {
    nextState: {
      alpha: nextAlpha,
      beta: nextBeta,
      p00: nextP00,
      p01: nextP01,
      p10: nextP10,
      p11: nextP11,
    },
    predictedY,
    residual,
  };
}
