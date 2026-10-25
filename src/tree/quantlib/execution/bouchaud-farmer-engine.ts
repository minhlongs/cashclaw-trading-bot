export function computeBouchaudFarmerExecution(p: BouchaudFarmerParams): BouchaudFarmerResult {
  const n = Math.max(1, Math.floor(p.numTrades)), s0 = Math.max(0, p.initialShares), p0 = p.initialPrice;
  const gamma = Math.min(0.99, Math.max(0.01, p.memoryDecayExponent));
  const g0 = Math.max(1e-6, p.bareImpactMagnitude), sign = p.tradeSign ?? 1;
  const hurstExponent = 1 - gamma / 2;
  const trajectory: BouchaudFarmerStep[] = [];
  let remaining = s0, totalNotional = 0, dressedImpact = 0;

  for (let i = 0; i < n; i++) {
    const left = n - i;
    const size = left === 1 ? remaining : remaining / left;
    const lag = i + 1;
    const autocorr = Math.pow(lag, -gamma);
    const bareStep = g0 * Math.sqrt(size) * autocorr;
    dressedImpact += bareStep;
    const execPrice = p0 - sign * dressedImpact;
    const stepCost = size * dressedImpact;
    totalNotional += size * execPrice;
    remaining = Math.max(0, remaining - size);
    trajectory.push({ tradeIndex: lag, sharesExecuted: size, sharesRemaining: remaining, autocorrelation: autocorr, dressedImpact, executionPrice: execPrice, stepCost });
  }

  const totalExecutionCost = Math.max(0, sign === 1 ? s0 * p0 - totalNotional : totalNotional - s0 * p0);
  const vwapPrice = s0 > 0 ? totalNotional / s0 : p0;
  return { trajectory, totalExecutionCost, vwapPrice, terminalImpact: dressedImpact, hurstExponent };
}

export interface BouchaudFarmerParams {
  readonly initialShares: number;
  readonly initialPrice: number;
  readonly numTrades: number;
  readonly memoryDecayExponent: number; // gamma in C(l) ~ l^(-gamma), typically 0.5
  readonly bareImpactMagnitude: number;
  readonly tradeSign?: 1 | -1;
}

export interface BouchaudFarmerStep {
  readonly tradeIndex: number;
  readonly sharesExecuted: number;
  readonly sharesRemaining: number;
  readonly autocorrelation: number;
  readonly dressedImpact: number;
  readonly executionPrice: number;
  readonly stepCost: number;
}

export interface BouchaudFarmerResult {
  readonly trajectory: readonly BouchaudFarmerStep[];
  readonly totalExecutionCost: number;
  readonly vwapPrice: number;
  readonly terminalImpact: number;
  readonly hurstExponent: number;
}
