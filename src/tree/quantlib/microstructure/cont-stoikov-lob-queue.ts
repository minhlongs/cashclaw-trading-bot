import type {
  LOBQueueSnapshot,
  ContStoikovQueueResult,
} from './cont-stoikov-lob-types';

export class ContStoikovLOBQueueEngine {
  calculateQueueDynamics(snapshot: LOBQueueSnapshot): ContStoikovQueueResult {
    const {
      bestBid,
      bestAsk,
      bidVolume,
      askVolume,
      queuePosition,
      totalLevelVolume,
      marketArrivalRate,
      cancelRate,
    } = snapshot;

    const midPrice = (bestBid + bestAsk) / 2;
    const spread = Math.max(0, bestAsk - bestBid);
    const totalVolume = bidVolume + askVolume;

    const ofi = totalVolume > 1e-12
      ? (bidVolume - askVolume) / totalVolume
      : 0;

    const microPrice = totalVolume > 1e-12
      ? midPrice + ofi * (spread / 2)
      : midPrice;

    const netRate = marketArrivalRate + cancelRate;
    let fillProb = 0;
    let expectedWaitTimeMs = 0;

    if (netRate > 1e-12 && totalLevelVolume > 0) {
      const positionRatio = Math.max(0, Math.min(1, queuePosition / (totalLevelVolume + 1)));
      const baseProbability = marketArrivalRate / netRate;
      fillProb = Math.max(0, Math.min(1, baseProbability * (1 - positionRatio)));

      const queueAhead = Math.max(0, queuePosition);
      expectedWaitTimeMs = netRate > 0 ? (queueAhead / netRate) * 1000 : 0;
    }

    const isDepletionLikely = fillProb > 0.65 || ofi > 0.4;

    return {
      fillProbability: Number(fillProb.toFixed(4)),
      expectedWaitTimeMs: Number(expectedWaitTimeMs.toFixed(2)),
      microPrice: Number(microPrice.toFixed(4)),
      midPrice: Number(midPrice.toFixed(4)),
      orderFlowImbalance: Number(ofi.toFixed(4)),
      isDepletionLikely,
    };
  }
}
