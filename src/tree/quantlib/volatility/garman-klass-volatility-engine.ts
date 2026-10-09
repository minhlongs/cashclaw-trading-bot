import type { OhlcBar, GarmanKlassConfig, GarmanKlassResult } from './garman-klass-volatility-types';

const LOG2 = Math.LN2;
const GK_CONST = 2 * LOG2 - 1; // 2*ln(2) - 1 ≈ 0.386294
const PARKINSON_SCALE = 1 / (4 * LOG2); // 1 / (4*ln(2)) ≈ 0.360674

export class GarmanKlassVolatilityEngine {
  estimate(bars: readonly OhlcBar[], config?: GarmanKlassConfig): GarmanKlassResult {
    const n = bars.length;
    if (n < 2) {
      throw new Error('Garman-Klass volatility estimation requires at least 2 bars.');
    }

    let sumParkinson = 0;
    let sumGk = 0;
    let sumGkyz = 0;
    let count = 0;

    for (let i = 1; i < n; i++) {
      const prevClose = Math.max(1e-8, bars[i - 1]!.close);
      const open = Math.max(1e-8, bars[i]!.open);
      const high = Math.max(open, bars[i]!.high);
      const low = Math.max(1e-8, Math.min(open, bars[i]!.low));
      const close = Math.max(1e-8, bars[i]!.close);

      const logHl = Math.log(high / low);
      const logCo = Math.log(close / open);
      const logOc = Math.log(open / prevClose);

      const hlSq = logHl * logHl;
      const coSq = logCo * logCo;
      const ocSq = logOc * logOc;

      sumParkinson += PARKINSON_SCALE * hlSq;
      sumGk += 0.5 * hlSq - GK_CONST * coSq;
      sumGkyz += ocSq + 0.5 * hlSq - GK_CONST * coSq;
      count++;
    }

    const parkVar = Math.max(0, sumParkinson / count);
    const gkVar = Math.max(0, sumGk / count);
    const gkyzVar = Math.max(0, sumGkyz / count);
    const ann = config?.annualizationFactor ?? 365;

    return {
      parkinsonVariance: Number(parkVar.toFixed(8)),
      parkinsonVolatility: Number(Math.sqrt(parkVar * ann).toFixed(6)),
      garmanKlassVariance: Number(gkVar.toFixed(8)),
      garmanKlassVolatility: Number(Math.sqrt(gkVar * ann).toFixed(6)),
      gkyzVariance: Number(gkyzVar.toFixed(8)),
      gkyzVolatility: Number(Math.sqrt(gkyzVar * ann).toFixed(6)),
    };
  }
}
