'use client';

import React from 'react';
import type { CockpitDepthData } from './cockpit-types';

interface L2DepthLadderProps {
  readonly data: CockpitDepthData;
}

export function L2DepthLadder({ data }: L2DepthLadderProps) {
  return (
    <div className="card space-y-3 p-4" data-testid="l2-depth-ladder">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="text-sm font-semibold text-foreground">L2 Depth Ladder</span>
        <span className="text-xs text-muted">
          Spread: <strong className="text-foreground">${data.spreadUsd.toFixed(2)}</strong>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Asks (Sells) */}
        <div className="space-y-1">
          <div className="font-medium text-loss">Asks (Sell)</div>
          {data.asks.map((lvl) => (
            <div key={`ask-${lvl.price}`} className="flex justify-between bg-loss/10 px-2 py-0.5 rounded">
              <span className="font-mono text-loss">{lvl.price.toFixed(2)}</span>
              <span className="font-mono text-muted">{lvl.size.toFixed(4)}</span>
            </div>
          ))}
        </div>

        {/* Bids (Buys) */}
        <div className="space-y-1">
          <div className="font-medium text-profit">Bids (Buy)</div>
          {data.bids.map((lvl) => (
            <div key={`bid-${lvl.price}`} className="flex justify-between bg-profit/10 px-2 py-0.5 rounded">
              <span className="font-mono text-profit">{lvl.price.toFixed(2)}</span>
              <span className="font-mono text-muted">{lvl.size.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
