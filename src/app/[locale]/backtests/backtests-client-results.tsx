'use client';

import { useTranslations } from 'next-intl';
import { MetricCard } from './metric-card';
import { EquityCurveChart } from './equity-curve-chart';
import { RecentTradesTable } from './recent-trades-table';
import type { BacktestResult } from './backtests-client-types';

export function formatStrategy(strategy: string, locale: string): string {
  if (strategy === 'volatility_dca') {
    return locale === 'vi' ? 'DCA Biến Động' : 'Volatility DCA';
  }
  return strategy;
}

export function BacktestResults({ result }: { result: BacktestResult }) {
  const t = useTranslations('backtests');
  const { total_pnl, win_rate, max_drawdown, sharpe_ratio, total_trades, equity_curve_json, trades_json, win_count, loss_count } = result;

  return (
    <div className="flex-col gap-6">
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-primary">
          {t('performanceMetrics')}
        </h3>
        <div className="grid-auto-fit gap-4">
          <MetricCard label={t('totalPnl')} value={`${total_pnl > 0 ? '+' : ''}$${total_pnl.toFixed(2)}`} positive={total_pnl > 0} />
          <MetricCard label={t('winRate')} value={`${win_rate.toFixed(1)}%`} />
          <MetricCard label={t('maxDrawdown')} value={`-${max_drawdown.toFixed(1)}%`} positive={false} />
          <MetricCard label={t('sharpeRatio')} value={(sharpe_ratio ?? 0).toFixed(2)} />
          <MetricCard label={t('totalTrades')} value={`${total_trades} (${win_count}W / ${loss_count}L)`} />
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-primary">
          {t('equityCurve')}
        </h3>
        <EquityCurveChart data={equity_curve_json} />
      </div>

      <RecentTradesTable trades={trades_json} />
    </div>
  );
}
