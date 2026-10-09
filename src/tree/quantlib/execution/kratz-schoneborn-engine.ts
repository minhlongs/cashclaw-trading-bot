import type { KratzSchonebornParams, KratzSchonebornResult, KratzSchonebornStep } from './kratz-schoneborn-types';

export function computeKratzSchonebornExecution(p: KratzSchonebornParams): KratzSchonebornResult {
  const n = Math.max(1, Math.floor(p.numSteps)), t = Math.max(1e-4, p.timeHorizon), dt = t / n;
  const s0 = Math.max(0, p.initialInventory), p0 = p.initialPrice;
  const eta = Math.max(1e-6, p.litTemporaryImpact), gamma = Math.max(0, p.litPermanentImpact);
  const lambdaDark = Math.max(0, p.darkArrivalRate), pDark = Math.min(1, Math.max(0, p.darkFillProbability));
  const trajectory: KratzSchonebornStep[] = [];
  let remaining = s0, curPrice = p0, totalNotional = 0, totalDarkFilled = 0;
  for (let i = 0; i < n; i++) {
    const time = (i + 1) * dt, stepsLeft = n - i;
    const darkExpectedFill = stepsLeft > 1 ? Math.min(remaining, remaining * (1 - Math.exp(-lambdaDark * dt)) * pDark) : 0;
    const invAfterDark = remaining - darkExpectedFill;
    const litTarget = stepsLeft === 1 ? invAfterDark : Math.min(invAfterDark, invAfterDark / stepsLeft);
    const litTrade = Math.max(0, litTarget), darkTrade = Math.max(0, darkExpectedFill);
    const speed = dt > 0 ? litTrade / dt : 0;
    const permImp = gamma * litTrade, tempImp = eta * speed;
    const execPrice = curPrice - tempImp - permImp / 2;
    curPrice -= permImp;
    const stepCost = litTrade * (p0 - execPrice) + darkTrade * (p0 - curPrice);
    totalNotional += litTrade * execPrice + darkTrade * curPrice;
    totalDarkFilled += darkTrade;
    remaining = Math.max(0, remaining - litTrade - darkTrade);
    trajectory.push({ step: i + 1, time, inventoryRemaining: remaining, litTradeSize: litTrade, darkTradeSize: darkTrade, executionPrice: execPrice, stepCost });
  }
  const totalCost = Math.max(0, s0 * p0 - totalNotional);
  const pureLitCost = s0 > 0 ? (eta * (s0 / t) + (gamma * s0) / 2) * s0 : 0;
  const savingsBps = pureLitCost > 0 ? Math.max(0, ((pureLitCost - totalCost) / (s0 * p0)) * 10000) : 0;
  const darkRatio = s0 > 0 ? Math.min(1, totalDarkFilled / s0) : 0;
  const vwapPrice = s0 > 0 ? totalNotional / s0 : p0;
  return { trajectory, totalCost, vwapPrice, terminalPrice: curPrice, darkCaptureRatio: darkRatio, costSavingsVsPureLitBps: savingsBps, terminalInventory: remaining };
}
