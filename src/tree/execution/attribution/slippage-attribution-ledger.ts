import type {
  ExecutionFillRecord,
  SlippageAttributionBreakdown,
} from './slippage-attribution-types';

export class SlippageAttributionLedger {
  attributeExecutionSlippage(
    orderId: string,
    arrivalMidPrice: number,
    fills: readonly ExecutionFillRecord[],
    terminalMidPrice?: number
  ): SlippageAttributionBreakdown {
    if (fills.length === 0 || arrivalMidPrice <= 0) {
      return {
        orderId,
        totalExecutedQuantity: 0,
        arrivalPrice: arrivalMidPrice,
        vwapExecutionPrice: arrivalMidPrice,
        totalSlippageBps: 0,
        halfSpreadBps: 0,
        transientImpactBps: 0,
        permanentDriftBps: 0,
      };
    }

    let totalVolume = 0;
    let notionalExecuted = 0;

    for (const f of fills) {
      totalVolume += f.quantity;
      notionalExecuted += f.quantity * f.executionPrice;
    }

    const vwap = totalVolume > 0 ? notionalExecuted / totalVolume : arrivalMidPrice;
    const totalSlippageBps = ((vwap - arrivalMidPrice) / arrivalMidPrice) * 10000;

    const termMid = terminalMidPrice ?? (arrivalMidPrice + (vwap - arrivalMidPrice) * 0.4);
    const permanentDriftBps = Math.max(0, ((termMid - arrivalMidPrice) / arrivalMidPrice) * 10000);

    const halfSpreadBps = 2.5; // Standard institutional L2 quote half-spread baseline
    const transientImpactBps = Math.max(0, totalSlippageBps - halfSpreadBps - permanentDriftBps);

    return {
      orderId,
      totalExecutedQuantity: Number(totalVolume.toFixed(6)),
      arrivalPrice: Number(arrivalMidPrice.toFixed(4)),
      vwapExecutionPrice: Number(vwap.toFixed(4)),
      totalSlippageBps: Number(totalSlippageBps.toFixed(2)),
      halfSpreadBps: Number(halfSpreadBps.toFixed(2)),
      transientImpactBps: Number(transientImpactBps.toFixed(2)),
      permanentDriftBps: Number(permanentDriftBps.toFixed(2)),
    };
  }
}
