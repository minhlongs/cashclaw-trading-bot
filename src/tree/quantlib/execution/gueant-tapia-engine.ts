import type { GueantTapiaParams, GueantTapiaResult, GueantTapiaStep, AssetStepExecution } from './gueant-tapia-types';

export function computeGueantTapiaExecution(p: GueantTapiaParams): GueantTapiaResult {
  const n = Math.max(1, Math.floor(p.numSteps)), t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const gamma = Math.max(1e-6, p.riskAversion), assets = p.assets;
  const remaining = new Map<string, number>(assets.map((a) => [a.symbol, Math.max(0, a.shares)]));
  const prices = new Map<string, number>(assets.map((a) => [a.symbol, a.price]));
  const totalNotional = new Map<string, number>(assets.map((a) => [a.symbol, 0]));
  const steps: GueantTapiaStep[] = [];
  let totalCost = 0;

  for (let s = 0; s < n; s++) {
    const timeLeft = Math.max(1e-4, t - s * dt);
    const assetExecs: AssetStepExecution[] = assets.map((a) => {
      const q = remaining.get(a.symbol) ?? 0, p0 = prices.get(a.symbol) ?? a.price;
      const sigma = Math.max(1e-5, a.volatility), eta = Math.max(1e-6, a.temporaryImpact);
      const omega = Math.sqrt((gamma * sigma * sigma) / eta);
      const cothTerm = 1 / Math.tanh(Math.max(1e-4, omega * timeLeft));
      const targetSize = s === n - 1 ? q : Math.min(q, Math.max(0, q * omega * cothTerm * dt));
      const impact = eta * (targetSize / dt), execPrice = Math.max(1e-4, p0 - impact), cost = targetSize * (p0 - execPrice);
      remaining.set(a.symbol, Math.max(0, q - targetSize));
      prices.set(a.symbol, execPrice);
      totalNotional.set(a.symbol, (totalNotional.get(a.symbol) ?? 0) + targetSize * execPrice);
      totalCost += cost;
      return { symbol: a.symbol, sharesExecuted: targetSize, sharesRemaining: remaining.get(a.symbol) ?? 0, executionPrice: execPrice, stepCost: cost };
    });
    steps.push({ step: s + 1, time: (s + 1) * dt, assetExecutions: assetExecs });
  }

  const assetVwaps: Record<string, number> = {}, terminalShares: Record<string, number> = {};
  for (const a of assets) {
    terminalShares[a.symbol] = remaining.get(a.symbol) ?? 0;
    assetVwaps[a.symbol] = a.shares > 0 ? (totalNotional.get(a.symbol) ?? 0) / a.shares : a.price;
  }
  return { steps, totalExecutionCost: totalCost, assetVwaps, terminalShares };
}
