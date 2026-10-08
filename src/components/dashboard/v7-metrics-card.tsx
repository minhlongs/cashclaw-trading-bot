'use client';

import { Activity, Zap, Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function V7MetricsCard() {
  const t = useTranslations('dashboard');

  return (
    <div className="panel v7-metrics-card mt-4 border border-border/40 rounded-xl p-5 bg-card/60 backdrop-blur">
      <div className="flex items-center justify-between pb-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-ai" />
          <h3 className="font-semibold text-foreground text-sm tracking-wide">
            {t('v7Metrics.title') ?? 'V7 Quantitative Multi-Pillar HUD'}
          </h3>
        </div>
        <span className="badge badge-success text-xs font-mono">Paper-Simulation Active</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {/* Pillar 1: Avellaneda-Stoikov */}
        <div className="p-3.5 rounded-lg bg-surface/50 border border-border/20">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span className="font-medium">Pillar 1: AS Inventory</span>
            <span className="text-profit font-mono">r(s) Active</span>
          </div>
          <div className="text-lg font-bold font-mono text-foreground">99.82 USD</div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Reservation price shifted down (-0.18 USD) to offset long inventory (+2.0 units).
          </p>
        </div>

        {/* Pillar 2: CEX/DEX Basis Arb */}
        <div className="p-3.5 rounded-lg bg-surface/50 border border-border/20">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span className="font-medium">Pillar 2: Basis Arbitrage</span>
            <Zap size={13} className="text-ai" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground">+4.20 USD</div>
          <p className="text-[11px] text-muted-foreground mt-1">
            AMM Curve: DEX Buy ($100.0) → CEX Sell ($105.0) | Gas: $1.00 net positive.
          </p>
        </div>

        {/* Pillar 3: SABR Volatility */}
        <div className="p-3.5 rounded-lg bg-surface/50 border border-border/20">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span className="font-medium">Pillar 3: SABR Smile</span>
            <Layers size={13} className="text-profit" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground">σ = 28.4%</div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Hagan asymptotic calibration. Delta-neutral mispricing detected on Strike 90.
          </p>
        </div>
      </div>
    </div>
  );
}
