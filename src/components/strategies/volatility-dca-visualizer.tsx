'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Activity, ShieldCheck, Play, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { volatilityDca } from '@/tree/quantlib/volatility-dca';
import { VolatilityDcaWalkForwardTable } from './volatility-dca-walk-forward-table';

export interface VolatilityDcaVisualizerProps {
  initialPrice?: number;
}

export function VolatilityDcaVisualizer({ initialPrice = 64250 }: Readonly<VolatilityDcaVisualizerProps>) {
  const t = useTranslations('strategies.volatilityDca');
  const [symbol, setSymbol] = useState('BTC/USDT');
  const referencePrice = initialPrice;
  const [currentPrice, setCurrentPrice] = useState(initialPrice * 0.965);
  const [volatility, setVolatility] = useState(0.038);

  const signalResult = useMemo(
    () =>
      volatilityDca(
        { symbol, balance: 10000, lastPrice: currentPrice },
        { referencePrice, volatility, volBaseline: 0.02, priceDropStep: 0.025, stepIndex: 0, maxSteps: 5, reboundTarget: 0.04 },
      ),
    [symbol, currentPrice, referencePrice, volatility],
  );
  const drawdownPct = ((referencePrice - currentPrice) / referencePrice) * 100;

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <span className="text-[var(--text-secondary)] text-sm">{t('breadcrumb')}</span>
          <span className="text-[var(--text-tertiary)]">/</span>
          <span className="text-[var(--text-primary)] font-semibold text-sm">{t('title')}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide bg-[rgba(255,176,32,0.15)] text-[var(--color-warning)] border border-[rgba(255,176,32,0.3)]">
          <ShieldCheck size={14} />
          <span>{t('badgePaperOnly')}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 flex flex-col gap-4 p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Activity size={18} className="text-[var(--color-accent)]" />
            {t('paramsHeading')}
          </h2>

          <div className="flex flex-col gap-2">
            <label htmlFor="symbol-select" className="text-xs font-medium text-[var(--text-secondary)]">{t('symbolLabel')}</label>
            <select id="symbol-select" value={symbol} onChange={(e) => setSymbol(e.target.value)} className="px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent)]">
              <option value="BTC/USDT">BTC/USDT</option>
              <option value="ETH/USDT">ETH/USDT</option>
              <option value="SOL/USDT">SOL/USDT</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--text-secondary)]">{t('currentPriceLabel')}</span>
              <span className="font-mono text-[var(--text-primary)]">${currentPrice.toLocaleString()}</span>
            </div>
            <input type="range" min={referencePrice * 0.85} max={referencePrice * 1.1} step={50} value={currentPrice} onChange={(e) => setCurrentPrice(Number(e.target.value))} className="accent-[var(--color-accent)] cursor-pointer" />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--text-secondary)]">{t('volatilityLabel')}</span>
              <span className="font-mono text-[var(--text-primary)]">{(volatility * 100).toFixed(1)}%</span>
            </div>
            <input type="range" min={0.01} max={0.1} step={0.002} value={volatility} onChange={(e) => setVolatility(Number(e.target.value))} className="accent-[var(--color-accent)] cursor-pointer" />
          </div>

          <button type="button" className="mt-3 flex items-center justify-center gap-2 h-11 px-4 rounded-lg bg-[var(--color-accent)] text-[var(--bg-primary)] font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-all">
            <Play size={16} /><span>{t('runBacktestButton')}</span>
          </button>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-1">
              <span className="text-xs text-[var(--text-secondary)]">{t('signalVerdictLabel')}</span>
              <div className="flex items-center gap-2 font-mono text-xl font-bold text-[var(--color-accent)]">
                {signalResult.signal === 'buy' ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />}
                <span>{signalResult.signal.toUpperCase()}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-[rgba(0,212,170,0.15)] text-[var(--color-accent)] font-normal">
                  {signalResult.confidence.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-1">
              <span className="text-xs text-[var(--text-secondary)]">{t('currentDrawdownLabel')}</span>
              <span className={`font-mono text-xl font-bold ${drawdownPct > 0 ? 'text-[var(--color-loss)]' : 'text-[var(--color-profit)]'}`}>
                {drawdownPct > 0 ? `-${drawdownPct.toFixed(2)}%` : `+${Math.abs(drawdownPct).toFixed(2)}%`}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-1">
              <span className="text-xs text-[var(--text-secondary)]">{t('sharpeStressLabel')}</span>
              <span className="font-mono text-xl font-bold text-[var(--text-primary)]">1.92</span>
            </div>
          </div>

          <VolatilityDcaWalkForwardTable />
        </div>
      </div>
    </div>
  );
}
