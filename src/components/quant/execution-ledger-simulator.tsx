'use client';

import { useState, useMemo } from 'react';
import { Layers } from 'lucide-react';
import { resolveStressConfig, type StressMode } from '@/tree/alpha/cost-stress';
import { QuantScreenHeader } from './quant-screen-header';

const PAPER_FILLS = [
  { fillId: 'PAPER-ORD-901', symbol: 'BTC/USDT', side: 'BUY', notionalUsd: 25000, baseSlipBps: 2.4 },
  { fillId: 'PAPER-ORD-902', symbol: 'ETH/USDT', side: 'SELL', notionalUsd: 18000, baseSlipBps: 3.1 },
  { fillId: 'PAPER-ORD-903', symbol: 'SOL/USDT', side: 'BUY', notionalUsd: 12000, baseSlipBps: 4.8 },
] as const;

export function ExecutionLedgerSimulator() {
  const [stressMode, setStressMode] = useState<StressMode>('normal');
  const [depthMultiplier, setDepthMultiplier] = useState<number>(1.0);

  const stressCfg = useMemo(() => resolveStressConfig(stressMode), [stressMode]);
  const feeBps = Number((stressCfg.feePct * 10000).toFixed(1));
  const impactBps = Number((stressCfg.marketImpactPct * 10000 * depthMultiplier).toFixed(1));

  const ledgerRows = useMemo(
    () => PAPER_FILLS.map((fill) => {
      const effectiveSlipBps = Number((fill.baseSlipBps * depthMultiplier + impactBps).toFixed(1));
      const totalCostUsd = Number(((fill.notionalUsd * (feeBps + effectiveSlipBps)) / 10000).toFixed(2));
      return { ...fill, effectiveSlipBps, totalCostUsd };
    }),
    [depthMultiplier, feeBps, impactBps],
  );

  return (
    <section aria-label="Real-Time Paper Execution Ledger and Slippage Stress Simulator" className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <QuantScreenHeader
        icon={<Layers size={20} className="text-[var(--color-accent)]" />}
        title="Paper Execution Ledger & Slippage Stress Simulator"
        subtitle="Wired to resolveStressConfig (src/tree/alpha/cost-stress) • Zero live exchange orders"
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 flex flex-col gap-4 p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Friction & Orderbook Depth Controls</h2>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-[var(--text-secondary)]">Exchange Fee & Impact Regime</span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Fee stress regime selector">
              {(['normal', 'conservative', 'adverse', 'extreme'] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => setStressMode(mode)} aria-pressed={stressMode === mode} className={`min-h-[44px] px-2 py-2 rounded-lg text-xs font-mono font-semibold uppercase border transition-all duration-150 ease-out ${stressMode === mode ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'}`}>{mode}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="depth-mult-select" className="text-xs text-[var(--text-secondary)]">Orderbook Depth Slippage Multiplier</label>
            <select id="depth-mult-select" value={depthMultiplier} onChange={(e) => setDepthMultiplier(Number(e.target.value))} className="min-h-[44px] px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] text-sm font-mono">
              <option value={1}>1.0x Nominal Depth</option><option value={1.5}>1.5x Thin Book</option><option value={2.5}>2.5x Liquidity Vacuum</option>
            </select>
          </div>
        </div>
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">Taker Fee Floor</span>
              <div className="mt-1 font-mono text-xl font-bold text-[var(--color-warning)]">{feeBps} bps</div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">Market Impact Add-On</span>
              <div className="mt-1 font-mono text-xl font-bold text-[var(--color-loss)]">+{impactBps} bps</div>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-x-auto">
            <table className="w-full text-left text-xs font-mono" aria-label="Paper execution fills table">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <th className="pb-2">Order ID</th><th className="pb-2">Symbol</th><th className="pb-2">Side</th><th className="pb-2">Eff. Slippage</th><th className="pb-2 text-right">Total Friction (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {ledgerRows.map((row) => (
                  <tr key={row.fillId} className="hover:bg-[var(--bg-hover)]">
                    <td className="py-3 font-semibold text-[var(--text-primary)]">{row.fillId}</td>
                    <td className="py-3 text-[var(--text-primary)]">{row.symbol}</td>
                    <td className="py-3 text-[var(--color-accent)]">{row.side}</td>
                    <td className="py-3 text-[var(--color-warning)]">{row.effectiveSlipBps} bps</td>
                    <td className="py-3 text-right text-[var(--color-loss)]">${row.totalCostUsd.toFixed(2)}</td>
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
