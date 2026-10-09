import type { Ticker } from '../../exchange/types';
import { volatilityDca } from '../../quantlib/volatility-dca';
import { computeAnnualizedVol } from './volatility-dca-math';
import { executeDcaOrder } from './volatility-dca-execution';
import type { VolatilityDcaState } from './volatility-dca-state';

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
    s.stepIndex += 1; s.positionQty += qty; s.positionCost += capital;
    s.callbacks.onLog(`VolatilityDCA buy step=${s.stepIndex} price=${p} vol=${vol.toFixed(2)}%`);
    void executeDcaOrder(s.callbacks, s.config.symbol, s.config.exchange, 'buy', p, qty);
  } else if (res.signal === 'sell') {
    const qty = s.positionQty; s.positionQty = 0; s.positionCost = 0; s.stepIndex = 0; s.referencePrice = p;
    s.callbacks.onLog(`VolatilityDCA sell: price=${p} ref=${s.referencePrice} resetting${qty > 0 ? '' : ' (no position)'}`);
    if (qty > 0) void executeDcaOrder(s.callbacks, s.config.symbol, s.config.exchange, 'sell', p, qty);
  }
}
