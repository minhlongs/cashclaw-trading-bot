'use client';

import { useTranslations } from 'next-intl';

export interface BacktestTradeItem {
  entryTimestamp: number;
  exitTimestamp: number;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  fee: number;
  pnlPct: number;
  holdingMinutes: number;
}

export function RecentTradesTable({ trades }: { trades: BacktestTradeItem[] }) {
  const t = useTranslations('backtests');
  const common = useTranslations('common');
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4 text-primary">
        {t('recentTrades')}
      </h3>
      <div className="overflow-auto">
        <table className="backtest-table">
          <thead>
            <tr className="backtest-tr-header">
              <th className="backtest-th">{t('side')}</th>
              <th className="backtest-th">{t('entryTime')}</th>
              <th className="backtest-th">{common('entryPrice')}</th>
              <th className="backtest-th">{t('exitTime')}</th>
              <th className="backtest-th">{common('exitPrice')}</th>
              <th className="backtest-th">{common('pnl')}</th>
              <th className="backtest-th">{t('pnlPct')}</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => {
              const sideClass = trade.side === 'buy' ? 'text-profit' : 'text-loss';
              const pnlColorClass = trade.pnl >= 0 ? 'text-profit' : 'text-loss';
              const pnlPctColorClass = trade.pnlPct >= 0 ? 'text-profit' : 'text-loss';
              return (
                <tr key={i} className="backtest-tr">
                  <td className={`backtest-td ${sideClass}`}>
                    <span className="font-semibold">{trade.side.toUpperCase()}</span>
                  </td>
                  <td className="backtest-td">{new Date(trade.entryTimestamp).toLocaleString()}</td>
                  <td className="backtest-td">${trade.entryPrice.toLocaleString()}</td>
                  <td className="backtest-td">{new Date(trade.exitTimestamp).toLocaleString()}</td>
                  <td className="backtest-td">${trade.exitPrice.toLocaleString()}</td>
                  <td className={`backtest-td ${pnlColorClass}`}>
                    {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                  </td>
                  <td className={`backtest-td ${pnlPctColorClass}`}>
                    {trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
