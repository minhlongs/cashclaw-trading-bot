import { NextResponse } from 'next/server';
import {
  computeQuantTelemetrySnapshot,
  computeRegimeAttributionTelemetry,
  computeFdrGateTelemetry,
  computeDataQualityTelemetry,
  type CostTierId,
  type DataFaultMode,
} from '@/forest/dashboard/quant-telemetry-service';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tierParam = (url.searchParams.get('costTier') ?? 'BASE') as CostTierId;
  const faultParam = (url.searchParams.get('faultMode') ?? 'NONE') as DataFaultMode;
  const trialsParam = Number(url.searchParams.get('trials') ?? '12');

  const baseSnapshot = computeQuantTelemetrySnapshot();
  return NextResponse.json({
    ...baseSnapshot,
    regime: computeRegimeAttributionTelemetry(
      ['BASE', 'ELEVATED', 'EXTREME'].includes(tierParam) ? tierParam : 'BASE',
      'ALL',
    ),
    fdr: computeFdrGateTelemetry(0.05, Number.isFinite(trialsParam) && trialsParam > 1 ? trialsParam : 12, 'BH_FDR'),
    dataQuality: computeDataQualityTelemetry(
      ['NONE', 'MONOTONICITY', 'ZERO_VOLUME', 'IMPOSSIBLE_OHLC'].includes(faultParam) ? faultParam : 'NONE',
    ),
  });
}
