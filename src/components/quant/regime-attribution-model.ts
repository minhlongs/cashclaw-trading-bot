import {
  computeRegimeAttributionTelemetry,
  type CostTierId,
  type RegimeId,
} from '@/forest/dashboard/quant-telemetry-service';

export { computeRegimeAttributionTelemetry, type CostTierId, type RegimeId };

export const COST_TIERS: Record<CostTierId, { label: string; bps: number }> = {
  BASE: { label: 'BASE (10 bps)', bps: 10 },
  ELEVATED: { label: 'ELEVATED (20 bps)', bps: 20 },
  EXTREME: { label: 'EXTREME (35 bps)', bps: 35 },
};
