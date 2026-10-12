import { ObizhaevaLobConfig, ObizhaevaStepResult, ObizhaevaTrajectoryResult } from './obizhaeva-resilient-lob-types';

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
