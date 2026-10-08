'use client';

import { useTranslations } from 'next-intl';
import { L2DepthLadder } from './cockpit/l2-depth-ladder';
import { MicrostructureToxicityGauge } from './cockpit/microstructure-toxicity-gauge';
import { FleetRiskRadarCard } from './cockpit/fleet-risk-radar-card';
import type { CockpitDepthData, MicrostructureGaugeData, FleetRiskRadarData } from './cockpit/cockpit-types';

interface CockpitHudProps {
  readonly depthData?: CockpitDepthData;
  readonly gaugeData?: MicrostructureGaugeData;
  readonly radarData?: FleetRiskRadarData;
}

const DEFAULT_DEPTH: CockpitDepthData = {
  spreadUsd: 0.8,
  bids: [
    { price: 65420.5, size: 2.1, total: 2.1 },
    { price: 65419.0, size: 4.5, total: 6.6 },
  ],
  asks: [
    { price: 65421.3, size: 1.8, total: 1.8 },
    { price: 65422.5, size: 5.2, total: 7.0 },
  ],
};

const DEFAULT_GAUGE: MicrostructureGaugeData = {
  ofiSignal: 0.35,
  vpinToxicity: 0.18,
  status: 'HEALTHY',
};

const DEFAULT_RADAR: FleetRiskRadarData = {
  strategyWeights: [
    { strategy: 'volatility_dca', weightPct: 40 },
    { strategy: 'grid', weightPct: 35 },
    { strategy: 'mean_reversion', weightPct: 25 },
  ],
  fractionalKellyLeverage: 1.25,
  circuitBreakerDrawdownPct: 0.035,
  circuitBreakerMaxPct: 0.15,
  isTriggered: false,
};

export function CockpitHudSection({
  depthData = DEFAULT_DEPTH,
  gaugeData = DEFAULT_GAUGE,
  radarData = DEFAULT_RADAR,
}: CockpitHudProps) {
  const t = useTranslations('dashboard');

  return (
    <section className="cockpit-hud-section mt-4 mb-4" aria-label="Cockpit HUD">
      <div className="section-header mb-3">
        <div>
          <h2 className="text-lg font-semibold">{t('cockpit.title') ?? 'Institutional L2 Cockpit'}</h2>
          <p className="meta text-xs text-secondary">{t('cockpit.subtitle') ?? 'Live Microstructure & Fleet Risk Telemetry'}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <L2DepthLadder data={depthData} />
        <MicrostructureToxicityGauge data={gaugeData} />
        <FleetRiskRadarCard data={radarData} />
      </div>
    </section>
  );
}
