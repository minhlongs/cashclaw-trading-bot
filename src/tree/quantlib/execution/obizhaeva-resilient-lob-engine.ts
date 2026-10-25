export class ObizhaevaResilientLobEngine {
  public static calculateTrajectory(config: ObizhaevaLobConfig): ObizhaevaTrajectoryResult {
    const { initialInventory: X0, horizon: T, resilienceRate: rho, impactFactor: lambda, steps: N } = config;
    if (T <= 0 || N <= 0 || rho < 0 || lambda <= 0) throw new Error('Invalid Obizhaeva LOB configuration parameters');
    const denom = 2 + rho * T;
    const x0 = X0 / denom, dotX = (rho * X0) / denom, xN = X0 / denom, dt = T / N;
    let currentInv = X0, impact = 0, totalCost = 0;
    const schedule: ObizhaevaStepResult[] = [];
    for (let k = 0; k <= N; k++) {
      const isBoundary = k === 0 || k === N;
      const tradeSize = isBoundary ? x0 : dotX * dt;
      impact = impact * Math.exp(-rho * (k === 0 ? 0 : dt)) + lambda * tradeSize;
      totalCost += tradeSize * impact;
      currentInv -= tradeSize;
      schedule.push({ step: k, time: k * dt, tradeSize, remainingInventory: Math.max(0, currentInv), transientImpact: impact });
    }
    return { initialJump: x0, continuousRate: dotX, terminalJump: xN, expectedCost: totalCost, schedule };
  }
}

/**
 * Obizhaeva & Wang (2013) Resilient LOB & Transient Impact Types
 * Reference: Anna A. Obizhaeva & Jiang Wang (2013), Journal of Financial Markets
 */

export interface ObizhaevaLobConfig {
  initialInventory: number;
  horizon: number;
  resilienceRate: number; // rho (exponential book refill rate)
  impactFactor: number; // kappa or lambda (transient impact slope)
  steps: number;
}

export interface ObizhaevaStepResult {
  step: number;
  time: number;
  tradeSize: number;
  remainingInventory: number;
  transientImpact: number;
}

export interface ObizhaevaTrajectoryResult {
  initialJump: number;
  continuousRate: number;
  terminalJump: number;
  expectedCost: number;
  schedule: ObizhaevaStepResult[];
}
