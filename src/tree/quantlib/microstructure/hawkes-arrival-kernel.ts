export type HawkesRoutingVerdict = 'PASSIVE_MAKER' | 'TWAP_SLICE' | 'HALT_TOXIC_SWEEP';

export interface HawkesParams {
  readonly baselineMu: number;
  readonly excitationAlpha: number;
  readonly decayBeta: number;
}

export interface HawkesIntensityResult {
  readonly intensityLambda: number;
  readonly branchingRatioEta: number;
  readonly isStationary: boolean;
  readonly expectedClusterSize: number;
  readonly routingVerdict: HawkesRoutingVerdict;
}

export interface OrderBookImbalanceResult {
  readonly obi: number;
  readonly microPriceSkewBps: number;
  readonly bidDepthSum: number;
  readonly askDepthSum: number;
}

function resolveRoutingVerdict(intensity: number, baselineMu: number, isStationary: boolean): HawkesRoutingVerdict {
  if (!isStationary || intensity >= baselineMu * 3.5) return 'HALT_TOXIC_SWEEP';
  if (intensity >= baselineMu * 1.8) return 'TWAP_SLICE';
  return 'PASSIVE_MAKER';
}

export function computeHawkesIntensity(
  timestampsMs: readonly number[],
  evalTimeMs: number,
  params: HawkesParams,
): HawkesIntensityResult {
  const mu = Math.max(0.01, params.baselineMu);
  const alpha = Math.max(0, params.excitationAlpha);
  const beta = Math.max(0.01, params.decayBeta);

  let excitationSum = 0;
  for (const ts of timestampsMs) {
    if (ts < evalTimeMs) {
      excitationSum += alpha * Math.exp(-beta * ((evalTimeMs - ts) / 1000));
    }
  }

  const intensityLambda = Number((mu + excitationSum).toFixed(4));
  const branchingRatioEta = Number((alpha / beta).toFixed(4));
  const isStationary = branchingRatioEta < 1;
  const expectedClusterSize = isStationary ? Number((1 / (1 - branchingRatioEta)).toFixed(4)) : 999.99;

  return {
    intensityLambda,
    branchingRatioEta,
    isStationary,
    expectedClusterSize,
    routingVerdict: resolveRoutingVerdict(intensityLambda, mu, isStationary),
  };
}

export function computeOrderBookImbalance(
  bids: readonly number[],
  asks: readonly number[],
): OrderBookImbalanceResult {
  const levels = Math.min(bids.length, asks.length);
  if (levels === 0) return { obi: 0, microPriceSkewBps: 0, bidDepthSum: 0, askDepthSum: 0 };

  let bidWeighted = 0;
  let askWeighted = 0;
  let bidRaw = 0;
  let askRaw = 0;

  for (let i = 0; i < levels; i++) {
    const weight = Math.exp(-0.35 * i);
    const b = Math.max(0, bids[i]);
    const a = Math.max(0, asks[i]);
    bidWeighted += b * weight;
    askWeighted += a * weight;
    bidRaw += b;
    askRaw += a;
  }

  const denom = bidWeighted + askWeighted;
  const obi = denom > 0 ? Number(((bidWeighted - askWeighted) / denom).toFixed(4)) : 0;
  return {
    obi,
    microPriceSkewBps: Number((obi * 4.5).toFixed(2)),
    bidDepthSum: Number(bidRaw.toFixed(2)),
    askDepthSum: Number(askRaw.toFixed(2)),
  };
}
