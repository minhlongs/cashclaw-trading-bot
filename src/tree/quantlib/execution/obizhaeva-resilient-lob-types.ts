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
