export class EkopPinEngine {
  calculate(buckets: readonly EkopTradeBucket[]): EkopPinResult {
    const n = buckets.length;
    if (n < 2) {
      throw new Error('EKOP PIN estimation requires at least 2 trade buckets.');
    }

    let sumB = 0;
    let sumS = 0;
    let sumAbsImbalance = 0;
    let eventCount = 0;

    for (const b of buckets) {
      const buys = Math.max(0, b.buys);
      const sells = Math.max(0, b.sells);
      const tot = buys + sells;
      const imb = buys - sells;
      const absImb = Math.abs(imb);
      sumB += buys;
      sumS += sells;
      sumAbsImbalance += absImb;

      // Event day indicator: imbalance exceeds 20% of total bucket volume
      if (tot > 0 && absImb / tot > 0.2) {
        eventCount++;
      }
    }

    const meanAbsImb = sumAbsImbalance / n;
    const meanTot = (sumB + sumS) / n;

    // Probability of information event alpha in [0.01, 1]
    const alphaRaw = n > 0 ? eventCount / n : 0.5;
    const alpha = Math.max(0.01, Math.min(1, alphaRaw));

    // Informed arrival rate mu and uninformed arrival rate epsilon
    const informedArrival = meanAbsImb;
    const mu = Math.max(1e-6, informedArrival / alpha);
    const epsilon = Math.max(1e-6, Math.max(0, meanTot - informedArrival) / 2);

    // PIN = alpha * mu / (alpha * mu + 2 * epsilon) = meanAbsImb / meanTot
    const totalArrival = informedArrival + 2 * epsilon;
    const pin = totalArrival > 0
      ? Math.max(0, Math.min(1, informedArrival / totalArrival))
      : 0;

    return {
      pin: Number(pin.toFixed(4)),
      alpha: Number(alpha.toFixed(4)),
      mu: Number(mu.toFixed(4)),
      epsilon: Number(epsilon.toFixed(4)),
      sampleBuckets: n,
    };
  }
}

export interface EkopTradeBucket {
  readonly buys: number;
  readonly sells: number;
}

export interface EkopPinResult {
  readonly pin: number; // Probability of Informed Trading [0, 1]
  readonly alpha: number; // Probability of information event [0, 1]
  readonly mu: number; // Informed trader arrival rate
  readonly epsilon: number; // Uninformed noise arrival rate
  readonly sampleBuckets: number;
}
