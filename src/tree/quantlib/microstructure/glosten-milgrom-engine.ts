export function computeGlostenMilgromSpread(p: GlostenMilgromParams): GlostenMilgromResult {
  const vL = Math.max(1e-4, p.vLow), vH = Math.max(vL + 1e-4, p.vHigh);
  const mu = Math.min(0.99, Math.max(0, p.informedProb ?? 0.2)), gammaB = Math.min(0.99, Math.max(0.01, p.uninformedBuyProb ?? 0.5));
  const gammaS = 1 - gammaB;
  let pi = Math.min(0.999, Math.max(0.001, p.priorHighProb ?? 0.5));
  const trades: readonly ('buy' | 'sell')[] = p.tradeSequence.length > 0 ? p.tradeSequence : ['buy'];
  const quotes: GlostenMilgromQuote[] = [];
  let sumSpread = 0;
  for (let s = 0; s < trades.length; s++) {
    const trade = trades[s]!;
    const pBuy = mu * pi + (1 - mu) * gammaB, pSell = mu * (1 - pi) + (1 - mu) * gammaS;
    const piBuy = (pi * (mu + (1 - mu) * gammaB)) / (pBuy || 1e-6);
    const piSell = (pi * (1 - mu) * gammaS) / (pSell || 1e-6);
    const ask = piBuy * vH + (1 - piBuy) * vL, bid = piSell * vH + (1 - piSell) * vL;
    const spread = Math.max(1e-6, ask - bid), mid = (ask + bid) / 2;
    sumSpread += spread;
    const prior = pi;
    pi = trade === 'buy' ? piBuy : piSell;
    quotes.push({ step: s + 1, trade, priorProb: prior, posteriorProb: pi, bid, ask, spread, midPrice: mid });
  }
  const avgSpread = quotes.length > 0 ? sumSpread / quotes.length : (vH - vL) * mu;
  const initialMid = ((p.priorHighProb ?? 0.5) * vH + (1 - (p.priorHighProb ?? 0.5)) * vL);
  const asBps = (avgSpread / initialMid) * 10_000;
  return { quotes, finalProb: pi, averageSpread: avgSpread, adverseSelectionBps: asBps };
}

export interface GlostenMilgromQuote {
  readonly step: number;
  readonly trade: 'buy' | 'sell';
  readonly priorProb: number;
  readonly posteriorProb: number;
  readonly bid: number;
  readonly ask: number;
  readonly spread: number;
  readonly midPrice: number;
}

export interface GlostenMilgromParams {
  readonly vLow: number;
  readonly vHigh: number;
  readonly tradeSequence: readonly ('buy' | 'sell')[];
  readonly priorHighProb?: number;
  readonly informedProb?: number;
  readonly uninformedBuyProb?: number;
}

export interface GlostenMilgromResult {
  readonly quotes: readonly GlostenMilgromQuote[];
  readonly finalProb: number;
  readonly averageSpread: number;
  readonly adverseSelectionBps: number;
}
