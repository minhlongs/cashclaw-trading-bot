/**
 * Cost and slippage stress checks 7-8 for Alpha Research OS Phase 9.
 * Validates survival under standard and severe transaction cost friction.
 */

import { resolveStressConfig } from '../../../tree/alpha/cost-stress';
import type { GateCheck } from './types';

/** Check 7: feeStress — Net PnL remains positive under NORMAL and CONSERVATIVE fee stress. */
export function checkFeeStress(
  netPnlNormal: number,
  netPnlConservative: number,
  threshold = 0,
): GateCheck {
  const normalConfig = resolveStressConfig('normal');
  const conservativeConfig = resolveStressConfig('conservative');
  const normalBps = Math.round(normalConfig.feePct * 10000);
  const conservativeBps = Math.round(conservativeConfig.feePct * 10000);

  const valid = Number.isFinite(netPnlNormal) && Number.isFinite(netPnlConservative);
  const passed = valid && netPnlNormal > threshold && netPnlConservative > threshold;
  const minPnl = valid ? Math.min(netPnlNormal, netPnlConservative) : null;

  const detail = valid
    ? `Net PnL NORMAL: ${netPnlNormal.toFixed(2)} (${normalBps} bps fee), CONSERVATIVE: ${netPnlConservative.toFixed(2)} (${conservativeBps} bps fee) vs. > ${threshold}`
    : `Invalid fee stress values: normal=${netPnlNormal}, conservative=${netPnlConservative}`;

  return {
    name: 'fee_stress',
    passed,
    actual: minPnl,
    threshold,
    detail,
  };
}

/** Check 8: slippageStress — Net PnL remains positive under ADVERSE and EXTREME (100 bps) stress. */
export function checkSlippageStress(
  netPnlAdverse: number,
  netPnlExtreme: number,
  threshold = 0,
): GateCheck {
  const adverseConfig = resolveStressConfig('adverse');
  const extremeConfig = resolveStressConfig('extreme');
  const adverseDragBps = Math.round(
    (adverseConfig.slipPct + adverseConfig.marketImpactPct) * 10000,
  );
  const extremeDragBps = Math.round(
    (extremeConfig.feePct + extremeConfig.slipPct + extremeConfig.marketImpactPct) * 10000,
  );

  const valid = Number.isFinite(netPnlAdverse) && Number.isFinite(netPnlExtreme);
  const passed = valid && netPnlAdverse > threshold && netPnlExtreme > threshold;
  const minPnl = valid ? Math.min(netPnlAdverse, netPnlExtreme) : null;

  const detail = valid
    ? `Net PnL ADVERSE: ${netPnlAdverse.toFixed(2)} (${adverseDragBps} bps drag), EXTREME: ${netPnlExtreme.toFixed(2)} (${extremeDragBps} bps total) vs. > ${threshold}`
    : `Invalid slippage stress values: adverse=${netPnlAdverse}, extreme=${netPnlExtreme}`;

  return {
    name: 'slippage_stress',
    passed,
    actual: minPnl,
    threshold,
    detail,
  };
}
