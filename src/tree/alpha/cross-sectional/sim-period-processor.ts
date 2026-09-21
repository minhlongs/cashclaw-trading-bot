import type { CrossSectionalSnapshot } from '@/tree/alpha/universe/types';
import { computeTurnover } from './turnover';
import { buildWeights, resolveCostFraction } from './weight-builder';
import type { CrossSectionalSimConfig, RebalanceRecord } from './types';

function computePeriodReturn(
  t: number,
  weights: Record<string, number>,
  returnIndex: Map<string, Map<number, number>>,
  warnings: string[],
): number {
  let grossReturn = 0;
  let available = 0;
  for (const symbol of Object.keys(weights)) {
    const ret = returnIndex.get(symbol)?.get(t);
    if (ret === undefined) {
      warnings.push(`Missing return for '${symbol}' at timestamp ${t}; excluded from gross return`);
      continue;
    }
    grossReturn += weights[symbol] * ret;
    available++;
  }
  if (available === 0) {
    throw new Error(
      `runCrossSectionalSim: no held asset has a return at timestamp ${t} (misaligned panel)`,
    );
  }
  return grossReturn;
}

function computeExposures(weights: Record<string, number>): { gross: number; net: number } {
  let grossExposure = 0;
  let netExposure = 0;
  for (const symbol of Object.keys(weights)) {
    grossExposure += Math.abs(weights[symbol]);
    netExposure += weights[symbol];
  }
  return { gross: grossExposure, net: netExposure };
}

export function processPeriod(
  snapshot: CrossSectionalSnapshot,
  prevWeights: Record<string, number>,
  config: CrossSectionalSimConfig,
  returnIndex: Map<string, Map<number, number>>,
  warnings: string[],
): RebalanceRecord {
  const t = snapshot.timestamp;
  const weights = buildWeights(snapshot.assets, config);
  const grossReturn = computePeriodReturn(t, weights, returnIndex, warnings);
  const turnover = computeTurnover(prevWeights, weights);
  const costFraction = resolveCostFraction(config);
  const costPct = turnover * costFraction;
  const netReturn = grossReturn - costPct;
  const { gross: grossExposure, net: netExposure } = computeExposures(weights);

  return {
    timestamp: t,
    weights,
    turnover,
    costPct,
    grossReturn,
    netReturn,
    grossExposure,
    netExposure,
  };
}
