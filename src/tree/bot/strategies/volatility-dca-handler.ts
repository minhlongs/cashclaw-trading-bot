import type { Ticker } from '../../exchange/types';
import { volatilityDca } from '../../quantlib/volatility-dca';
import { computeQuantExecutionPlan } from './quantlib-execution-sizer';
import { computeAnnualizedVol } from './volatility-dca-math';
import { executeDcaOrder, executeQuantDcaOrder } from './volatility-dca-execution';
import type { VolatilityDcaState } from './volatility-dca-state';

function dispatchOrder(s: VolatilityDcaState, side: 'buy' | 'sell', price: number, qty: number, volPct: number): number {
  if (s.config.quantExecution) {
    const plan = computeQuantExecutionPlan({ totalQuantity: qty, volatilityPct: volPct });
    void executeQuantDcaOrder(s.callbacks, s.config.symbol, s.config.exchange, side, price, qty, { volatilityPct: volPct });
    return plan.sliceQuantity;
  }
  void executeDcaOrder(s.callbacks, s.config.symbol, s.config.exchange, side, price, qty);
  return qty;
}

export function handleVolatilityDcaTicker(s: VolatilityDcaState, ticker: Ticker): void {
  if (!s.running || ticker.last <= 0) return;
  const p = ticker.last;
  s.priceWindow.push(p);
  if (s.priceWindow.length > s.config.volatilityWindow) s.priceWindow.shift();
  if (s.priceWindow.length < s.config.volatilityWindow) {
    s.callbacks.onLog(`VolatilityDCA accumulating: ${s.priceWindow.length}/${s.config.volatilityWindow}`);
    return;
  }
  const vol = computeAnnualizedVol(s.priceWindow);
  const res = volatilityDca(
    { symbol: s.config.symbol, balance: s.config.capital, lastPrice: p },
    { referencePrice: s.referencePrice, volatility: vol, volBaseline: s.config.volBaseline, priceDropStep: s.config.priceDropStep / 100, stepIndex: s.stepIndex, maxSteps: s.config.maxSteps, reboundTarget: s.config.reboundTarget / 100 },
  );
  if (res.signal === 'buy') {
    const capital = s.config.capital * (s.config.baseOrderSizePct / 100), qty = capital / p;
    const filledQty = dispatchOrder(s, 'buy', p, qty, vol);
    s.stepIndex += 1; s.positionQty += filledQty; s.positionCost += filledQty * p;
    s.callbacks.onLog(`VolatilityDCA buy step=${s.stepIndex} price=${p} vol=${vol.toFixed(2)}%`);
  } else if (res.signal === 'sell') {
    const qty = s.positionQty; s.positionQty = 0; s.positionCost = 0; s.stepIndex = 0; s.referencePrice = p;
    s.callbacks.onLog(`VolatilityDCA sell: price=${p} ref=${s.referencePrice} resetting${qty > 0 ? '' : ' (no position)'}`);
    if (qty > 0) dispatchOrder(s, 'sell', p, qty, vol);
  }
}
