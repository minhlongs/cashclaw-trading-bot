'use client';

import { useState } from 'react';
import { BarChart3, AlertTriangle } from 'lucide-react';
import { MICROSTRUCTURE_SNAPSHOTS, type SymbolKey } from './microstructure-liquidity-model';
import { QuantScreenHeader } from './quant-screen-header';

export function MicrostructureLiquidityAnalyzer() {
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolKey>('BTC/USDT');
  const [vpinAlertFloor, setVpinAlertFloor] = useState<number>(0.55);

  const active = MICROSTRUCTURE_SNAPSHOTS[selectedSymbol];
  const isToxicFlow = active.vpinToxicity >= vpinAlertFloor;

  return (
    <section aria-label="Microstructure and L2 Liquidity Toxicity Analyzer" className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <QuantScreenHeader
        icon={<BarChart3 size={20} className="text-[var(--color-accent)]" />}
        title="Microstructure & L2 Liquidity Toxicity Analyzer"
        subtitle="Real-time Order Flow Imbalance (OFI), VPIN toxicity, and TWAP urgency guard"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 flex flex-col gap-4 p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Instrument & Toxicity Fence</h2>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Target Orderbook</span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Symbol orderbook selector">
              {(['BTC/USDT', 'ETH/USDT', 'SOL/USDT'] as const).map((sym) => (
                <button key={sym} type="button" onClick={() => setSelectedSymbol(sym)} aria-pressed={selectedSymbol === sym} className={`min-h-[44px] px-2 py-2 rounded-lg text-xs font-mono font-semibold border transition-all ${selectedSymbol === sym ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'}`}>
                  {sym}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="vpin-threshold-slider" className="text-[var(--text-secondary)]">VPIN Toxicity Halt Threshold</label>
              <span className="font-mono font-bold text-[var(--color-warning)]">{vpinAlertFloor.toFixed(2)}</span>
            </div>
            <input id="vpin-threshold-slider" type="range" min={0.3} max={0.85} step={0.05} value={vpinAlertFloor} onChange={(e) => setVpinAlertFloor(Number(e.target.value))} className="min-h-[44px] accent-[var(--color-accent)] cursor-pointer" />
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">Bid-Ask Spread</span>
              <div className="mt-1 font-mono text-xl font-bold text-[var(--text-primary)]">{active.spreadBps.toFixed(1)} bps</div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">Order Flow Imbalance</span>
              <div className={`mt-1 font-mono text-xl font-bold ${active.ofiScore >= 0 ? 'text-[var(--color-profit)]' : 'text-[var(--color-loss)]'}`}>
                {active.ofiScore >= 0 ? `+${active.ofiScore.toFixed(2)}` : active.ofiScore.toFixed(2)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">VPIN Toxicity</span>
              <div className={`mt-1 font-mono text-xl font-bold ${isToxicFlow ? 'text-[var(--color-loss)]' : 'text-[var(--color-profit)]'}`}>{active.vpinToxicity.toFixed(2)}</div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">OMS Execution Guard</span>
              <div className="mt-1 font-mono text-sm font-bold flex items-center gap-1 text-[var(--color-warning)]">
                <AlertTriangle size={14} /><span>{isToxicFlow ? 'TWAP_THROTTLED' : 'NORMAL_PASSIVE'}</span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-x-auto">
            <table className="w-full text-left text-xs font-mono" aria-label="Cross-symbol microstructure telemetry">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <th className="pb-2">Symbol</th><th className="pb-2">Mid Price</th><th className="pb-2">Spread (bps)</th><th className="pb-2">OFI (L1-L5)</th><th className="pb-2">VPIN</th><th className="pb-2 text-right">Top-5 Depth (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {Object.values(MICROSTRUCTURE_SNAPSHOTS).map((snap) => (
                  <tr key={snap.symbol} className="hover:bg-[var(--bg-hover)]">
                    <td className="py-3 font-semibold text-[var(--text-primary)]">{snap.symbol}</td>
                    <td className="py-3 text-[var(--text-primary)]">${snap.midPrice.toLocaleString()}</td>
                    <td className="py-3 text-[var(--text-secondary)]">{snap.spreadBps.toFixed(1)}</td>
                    <td className={`py-3 ${snap.ofiScore >= 0 ? 'text-[var(--color-profit)]' : 'text-[var(--color-loss)]'}`}>{snap.ofiScore.toFixed(2)}</td>
                    <td className="py-3 text-[var(--color-ai)]">{snap.vpinToxicity.toFixed(2)}</td>
                    <td className="py-3 text-right text-[var(--text-primary)]">${snap.depthUsdTop5.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
