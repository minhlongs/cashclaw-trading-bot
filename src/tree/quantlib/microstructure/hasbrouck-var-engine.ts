import type { TradeObservation, HasbrouckVarConfig, HasbrouckVarResult } from './hasbrouck-var-types';

export class HasbrouckVarEngine {
  calculate(trades: readonly TradeObservation[], _config?: HasbrouckVarConfig): HasbrouckVarResult {
    const n = trades.length;
    if (n < 4) {
      throw new Error('Hasbrouck VAR estimation requires at least 4 trade observations.');
    }

    const r: number[] = [];
    const x: number[] = [];

    for (let i = 1; i < n; i++) {
      const pPrev = Math.max(1e-8, trades[i - 1]!.midPrice);
      const pCurr = Math.max(1e-8, trades[i]!.midPrice);
      const ret = Math.log(pCurr / pPrev);
      const sign = Math.max(-1, Math.min(1, trades[i]!.tradeSign));
      const vol = Math.max(1, trades[i]!.volume ?? 1);
      r.push(ret);
      x.push(sign * Math.sqrt(vol));
    }

    const m = r.length;
    let sR2 = 0, sX2 = 0, sRX = 0, sR1R = 0, sX1R = 0, sR1_2 = 0, sX1_2 = 0;

    for (let i = 1; i < m; i++) {
      const rCurr = r[i]!;
      const xCurr = x[i]!;
      const rLag = r[i - 1]!;
      const xLag = x[i - 1]!;

      sR2 += rCurr * rCurr;
      sX2 += xCurr * xCurr;
      sRX += rCurr * xCurr;
      sR1R += rCurr * rLag;
      sX1R += rCurr * xLag;
      sR1_2 += rLag * rLag;
      sX1_2 += xLag * xLag;
    }

    const varX = Math.max(1e-8, sX2 / (m - 1));
    const beta0 = (sRX / (m - 1)) / varX;
    const alpha1 = Math.max(-0.95, Math.min(0.95, sR1_2 > 1e-8 ? (sR1R / (m - 1)) / (sR1_2 / (m - 1)) : 0));
    const beta1 = sX1_2 > 1e-8 ? (sX1R / (m - 1)) / (sX1_2 / (m - 1)) : 0;

    const denom = Math.max(0.05, 1 - alpha1);
    const rInf = (beta0 + beta1) / denom;

    const totalRetVar = Math.max(1e-8, sR2 / (m - 1));
    const tradeShockVar = (rInf * rInf) * varX;
    const infoShare = Math.max(0, Math.min(1, tradeShockVar / (totalRetVar + tradeShockVar)));

    return {
      priceImpactFactor: Number(beta0.toFixed(6)),
      permanentPriceImpact: Number(rInf.toFixed(6)),
      informationShare: Number(infoShare.toFixed(4)),
      autoregressiveReturnCoeff: Number(alpha1.toFixed(4)),
      laggedTradeImpactCoeff: Number(beta1.toFixed(6)),
      sampleCount: m,
    };
  }
}
