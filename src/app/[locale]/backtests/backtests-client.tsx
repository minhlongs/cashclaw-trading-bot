'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { runBacktestAction } from '@/forest/backtest/actions';

export interface BotInfo {
  id: string;
  name: string;
  strategy: string;
  configJson: string;
}

interface BacktestTrade {
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

interface BacktestEquityPoint {
  timestamp: number;
  equity: number;
  drawdownPct: number;
}

interface BacktestResult {
  id: string;
  bot_id: string;
  strategy: string;
  pair: string;
  exchange: string;
  start_date: number;
  end_date: number;
  total_trades: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  total_pnl: number;
  max_drawdown: number;
  sharpe_ratio: number | null;
  params_json: string;
  equity_curve_json: BacktestEquityPoint[];
  trades_json: BacktestTrade[];
  created_at: number;
}

const INTERVALS = ['1h', '4h', '1d'] as const;

export default function BacktestsClient({ initialBots = [] }: { initialBots?: BotInfo[] }) {
  const t = useTranslations('backtests');
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [interval, setInterval] = useState<string>('1h');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const runBacktest = useCallback(async () => {
    if (!selectedBotId) {
      setError(t('pleaseSelectBot'));
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const bot = initialBots.find(b => b.id === selectedBotId);
      if (!bot) {
        setError(t('botNotFound'));
        return;
      }
      const config = JSON.parse(bot.configJson || '{}');
      const now = new Date();
      const endDate = now;
      const startDate = new Date(now.getTime() - 90 * 86400000);

      const data = await runBacktestAction({
        botId: bot.id,
        exchange: config.exchange || 'binance',
        symbol: config.symbol || 'BTC/USDT',
        strategy: bot.strategy as 'grid' | 'mean_reversion',
        config,
        startDate,
        endDate,
        interval: interval as '1h' | '4h' | '1d',
      });
      if (data.success && data.result) {
        setResult(data.result as BacktestResult);
      } else {
        setError(data.error ?? t('failed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requestFailed'));
    } finally {
      if (mountedRef.current) setIsRunning(false);
    }
  }, [selectedBotId, interval, initialBots, t]);

  return (
    <div className="page-container">
      <h1 className="text-2xl font-bold mb-6 text-primary">
        {t('title')}
      </h1>

      {/* Bot Selector */}
      <div className="card mb-4">
        <select
          value={selectedBotId}
          onChange={(e) => setSelectedBotId(e.target.value)}
          className="form-input form-select"
        >
          <option value="">{t('selectBotPlaceholder')}</option>
          {initialBots.map((bot) => (
            <option key={bot.id} value={bot.id}>{bot.name} ({bot.strategy})</option>
          ))}
        </select>
        <select
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          className="form-input form-select mt-3"
        >
          {INTERVALS.map((iv) => (
            <option key={iv} value={iv}>{iv}</option>
          ))}
        </select>
      </div>

      {/* Run Button */}
      <button
        onClick={runBacktest}
        disabled={isRunning || !selectedBotId}
        className={`btn btn-primary mb-6 ${isRunning || !selectedBotId ? 'opacity-50' : ''}`}
      >
        {isRunning ? t('running') : t('run')}
      </button>

      {error && <p className="text-loss text-sm mb-4">{error}</p>}

      {result && <BacktestResults result={result} />}
    </div>
  );
}

function BacktestResults({ result }: { result: BacktestResult }) {
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

function RecentTradesTable({ trades }: { trades: BacktestResult['trades_json'] }) {
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

function MetricCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const valueColorClass = positive === true ? 'text-profit' : positive === false ? 'text-loss' : 'text-primary';
  return (
    <div className="metric-card">
      <p className="text-xs text-secondary mb-1">{label}</p>
      <p className={`text-lg font-bold ${valueColorClass}`}>
        {value}
      </p>
    </div>
  );
}

function EquityCurveChart({ data }: { data: { timestamp: number; equity: number; drawdownPct: number }[] }) {
  const t = useTranslations('backtests');
  if (data.length < 2) return null;

  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };

  const equities = data.map(d => d.equity);
  const minVal = Math.min(...equities);
  const maxVal = Math.max(...equities);
  const range = maxVal - minVal || 1;

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d.equity - minVal) / range) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  const linePath = points;
  const areaPath = `${padding.left},${padding.top + chartHeight} ${points} ${width - padding.right},${padding.top + chartHeight}`;

  const isProfit = equities[equities.length - 1] >= equities[0];

  const yTicks = [minVal, minVal + range * 0.25, minVal + range * 0.5, minVal + range * 0.75, maxVal];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg">
      {/* Grid lines */}
      {yTicks.map((tick, i) => {
        const y = padding.top + chartHeight - ((tick - minVal) / range) * chartHeight;
        return (
          <g key={i}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4,4" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" fill="var(--text-secondary)" fontSize="10">
              ${Math.round(tick).toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <polygon points={areaPath} fill={isProfit ? 'rgba(0, 212, 170, 0.1)' : 'rgba(255, 71, 87, 0.1)'} />

      {/* Line */}
      <polyline points={linePath} fill="none" stroke={isProfit ? 'var(--color-profit)' : 'var(--color-loss)'} strokeWidth="2" strokeLinejoin="round" />

      {/* Start line */}
      <line x1={padding.left} y1={padding.top + chartHeight - ((data[0].equity - minVal) / range) * chartHeight} x2={width - padding.right} y2={padding.top + chartHeight - ((data[0].equity - minVal) / range) * chartHeight} stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="2,2" />

      {/* Labels */}
      <text x={padding.left} y={height - 5} fill="var(--text-secondary)" fontSize="10">{t('chartStart')}</text>
      <text x={width - padding.right} y={height - 5} fill="var(--text-secondary)" fontSize="10" textAnchor="end">{t('chartEnd')}</text>
    </svg>
  );
}

