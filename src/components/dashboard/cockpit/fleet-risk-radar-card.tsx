'use client';

import React from 'react';
import type { FleetRiskRadarData } from './cockpit-types';

interface FleetRiskRadarCardProps {
  readonly data: FleetRiskRadarData;
}

export function FleetRiskRadarCard({ data }: FleetRiskRadarCardProps) {
  return (
    <div className="card space-y-3 p-4" data-testid="fleet-risk-radar-card">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="text-sm font-semibold text-foreground">Fleet Risk Radar</span>
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold ${
            data.isTriggered ? 'badge-danger' : 'badge-success'
          }`}
        >
          {data.isTriggered ? 'CIRCUIT TRIPPED' : 'NORMAL'}
        </span>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between items-center text-muted">
          <span>Half-Kelly Leverage:</span>
          <span className="font-mono text-foreground font-semibold">
            {data.fractionalKellyLeverage.toFixed(2)}x
          </span>
        </div>

        <div>
          <div className="flex justify-between text-muted mb-1">
            <span>Portfolio Drawdown</span>
            <span className="font-mono text-loss font-semibold">
              {(data.circuitBreakerDrawdownPct * 100).toFixed(1)}% / {(data.circuitBreakerMaxPct * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-loss"
              style={{
                width: `${Math.min(100, (data.circuitBreakerDrawdownPct / data.circuitBreakerMaxPct) * 100)}%`,
              }}
            />
          </div>
        </div>

        <div className="pt-1 border-t border-border/50">
          <span className="text-muted block mb-1">HRP Capital Distribution:</span>
          <div className="space-y-1">
            {data.strategyWeights.map((s) => (
              <div key={s.strategy} className="flex justify-between text-muted">
                <span>{s.strategy}</span>
                <span className="font-mono text-foreground font-semibold">{s.weightPct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
