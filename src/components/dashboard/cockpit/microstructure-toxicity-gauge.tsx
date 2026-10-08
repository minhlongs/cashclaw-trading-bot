'use client';

import React from 'react';
import type { MicrostructureGaugeData } from './cockpit-types';

interface MicrostructureToxicityGaugeProps {
  readonly data: MicrostructureGaugeData;
}

export function MicrostructureToxicityGauge({ data }: MicrostructureToxicityGaugeProps) {
  const statusColor =
    data.status === 'HEALTHY'
      ? 'badge-success'
      : data.status === 'CAUTION'
        ? 'badge-warning'
        : 'badge-danger';

  return (
    <div className="card space-y-3 p-4" data-testid="microstructure-toxicity-gauge">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="text-sm font-semibold text-foreground">Microstructure Toxicity</span>
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColor}`}>
          {data.status}
        </span>
      </div>

      <div className="space-y-2 text-xs">
        <div>
          <div className="flex justify-between text-muted mb-1">
            <span>VPIN Informed Flow</span>
            <span className="font-mono text-foreground font-semibold">
              {(data.vpinToxicity * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
            <div
              className={`h-full ${data.vpinToxicity > 0.65 ? 'bg-loss' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, Math.max(0, data.vpinToxicity * 100))}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-muted mb-1">
            <span>Order Flow Imbalance (OFI)</span>
            <span className="font-mono text-foreground font-semibold">
              {data.ofiSignal > 0 ? `+${data.ofiSignal.toFixed(2)}` : data.ofiSignal.toFixed(2)}
            </span>
          </div>
          <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
            <div
              className={`h-full ${data.ofiSignal >= 0 ? 'bg-profit' : 'bg-loss'}`}
              style={{ width: `${Math.min(100, Math.max(0, (data.ofiSignal + 1) * 50))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
