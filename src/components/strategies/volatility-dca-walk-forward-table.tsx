'use client';

import { useTranslations } from 'next-intl';
import { MOCK_WALK_FORWARD_WINDOWS, type WalkForwardWindow } from './volatility-dca-data';

export function VolatilityDcaWalkForwardTable() {
  const t = useTranslations('strategies.volatilityDca');

  return (
    <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('walkForwardTitle')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <th className="pb-2 font-medium">{t('colWindow')}</th>
              <th className="pb-2 font-medium">{t('colIc')}</th>
              <th className="pb-2 font-medium">{t('colSharpe')}</th>
              <th className="pb-2 font-medium">{t('colDrawdown')}</th>
              <th className="pb-2 font-medium text-right">{t('colGate')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {MOCK_WALK_FORWARD_WINDOWS.map((w: WalkForwardWindow) => (
              <tr key={w.windowIndex} className="hover:bg-[var(--bg-hover)] transition-colors">
                <td className="py-2.5 text-[var(--text-primary)]">{w.label}</td>
                <td className="py-2.5 text-[var(--color-ai)]">+{w.inSampleIc.toFixed(3)}</td>
                <td className="py-2.5 text-[var(--text-primary)]">{w.outOfSampleSharpe.toFixed(2)}</td>
                <td className="py-2.5 text-[var(--color-loss)]">{(w.maxDrawdown * 100).toFixed(1)}%</td>
                <td className="py-2.5 text-right">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[rgba(0,212,170,0.15)] text-[var(--color-accent)]">
                    {w.survivalGate}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
