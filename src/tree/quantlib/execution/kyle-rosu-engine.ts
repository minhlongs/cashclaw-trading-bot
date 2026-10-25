export function computeKyleRosuExecution(p: KyleRosuParams): KyleRosuResult {
  const n = Math.max(1, Math.floor(p.numSteps)), t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const s0 = Math.max(0, p.initialInventory ?? 1000), v = p.fundamentalValue, p0 = p.initialPrice;
  const eta = Math.max(1e-6, p.temporaryImpactCoeff), sigmaU = Math.max(1e-4, p.noiseTraderStd);
  const beta = Math.max(0.01, p.aggressivenessCoeff), lambda = p.volatility / sigmaU;
  const trajectory: KyleRosuStep[] = [];
  let remaining = s0, currentPrice = p0, totalCost = 0, totalNotional = 0;
  for (let i = 0; i < n; i++) {
    const time = (i + 1) * dt, alpha = v - currentPrice;
    const baseSpeed = beta * alpha, targetTrade = Math.min(remaining, Math.max(0, baseSpeed * dt));
    const tradeSize = i === n - 1 ? remaining : targetTrade;
    const speed = dt > 0 ? tradeSize / dt : 0;
    const priceImpact = lambda * tradeSize + eta * speed;
    const execPrice = currentPrice + (v >= currentPrice ? priceImpact : -priceImpact);
    currentPrice += lambda * (tradeSize * (v >= currentPrice ? 1 : -1));
    const stepCost = tradeSize * Math.abs(execPrice - currentPrice);
    totalCost += stepCost; totalNotional += tradeSize * execPrice; remaining = Math.max(0, remaining - tradeSize);
    const disc = v !== p0 ? Math.min(1, Math.max(0, (currentPrice - p0) / (v - p0))) : 1;
    trajectory.push({ step: i + 1, time, inventoryRemaining: remaining, tradeSpeed: speed, tradeSize, executionPrice: execPrice, priceDiscoveryIndex: disc, stepCost });
  }
  const vwapPrice = s0 > 0 ? totalNotional / s0 : p0;
  const discEfficiency = v !== p0 ? Math.min(1, Math.max(0, (currentPrice - p0) / (v - p0))) : 1;
  return { trajectory, totalCost, vwapPrice, terminalPrice: currentPrice, priceDiscoveryEfficiency: discEfficiency, terminalInventory: remaining };
}

export interface KyleRosuParams {
  readonly fundamentalValue: number;
  readonly initialPrice: number;
  readonly timeHorizon: number;
  readonly numSteps: number;
  readonly volatility: number;
  readonly noiseTraderStd: number;
  readonly aggressivenessCoeff: number;
  readonly temporaryImpactCoeff: number;
  readonly initialInventory?: number;
}

export interface KyleRosuStep {
  readonly step: number;
  readonly time: number;
  readonly inventoryRemaining: number;
  readonly tradeSpeed: number;
  readonly tradeSize: number;
  readonly executionPrice: number;
  readonly priceDiscoveryIndex: number;
  readonly stepCost: number;
}

export interface KyleRosuResult {
  readonly trajectory: readonly KyleRosuStep[];
  readonly totalCost: number;
  readonly vwapPrice: number;
  readonly terminalPrice: number;
  readonly priceDiscoveryEfficiency: number;
  readonly terminalInventory: number;
}
