import type { OhlcBar, GarmanKlassResult } from './garman-klass-volatility-types';

export function runGkEstimation(bars: readonly OhlcBar[], ann = 365): GarmanKlassResult {
  const n = bars.length;
  for (const b of bars) {
    if (b.open <= 0 || b.high <= 0 || b.low <= 0 || b.close <= 0) throw new Error('Prices must be positive');
  }
  if (n < 2) throw new Error('Garman-Klass volatility estimation requires at least 2 bars.');
  let sP = 0, sGk = 0, sGkyz = 0, cnt = 0;
  for (let i = 1; i < n; i++) {
    const o = bars[i].open, h = bars[i].high, l = bars[i].low, c = bars[i].close, prevC = bars[i - 1].close;
    const hl = Math.log(h / l), co = Math.log(c / o), oc = Math.log(o / prevC);
    sP += (1 / (4 * Math.LN2)) * hl * hl;
    sGk += 0.5 * hl * hl - (2 * Math.LN2 - 1) * co * co;
    sGkyz += oc * oc + 0.5 * hl * hl - (2 * Math.LN2 - 1) * co * co;
    cnt++;
  }
  const pV = Math.max(0, sP / cnt), gkV = Math.max(0, sGk / cnt), yzV = Math.max(0, sGkyz / cnt);
  return {
    parkinsonVariance: Number(pV.toFixed(8)), parkinsonVolatility: Number(Math.sqrt(pV * ann).toFixed(6)),
    garmanKlassVariance: Number(gkV.toFixed(8)), garmanKlassVolatility: Number(Math.sqrt(gkV * ann).toFixed(6)),
    gkyzVariance: Number(yzV.toFixed(8)), gkyzVolatility: Number(Math.sqrt(yzV * ann).toFixed(6)),
    rawVariance: gkV, annualizedVolatility: Math.sqrt(gkV * ann), barCount: n, efficiencyGain: 7.4,
  };
}
