'use client';

import { useState, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { runBacktestAction } from '@/forest/backtest/actions';

interface BotInfo {
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
  const locale = useLocale();
  const isEn = locale === 'en';
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [interval, setInterval] = useState<string>('1h');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    if (!selectedBotId) {
      setError(isEn ? 'Please select a bot' : 'Chon bot truoc');
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const bot = initialBots.find(b => b.id === selectedBotId);
      if (!bot) {
        setError(isEn ? 'Bot not found' : 'Khong tim thay bot');
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
        setError(data.error ?? (isEn ? 'Backtest failed' : 'Backtest that bai'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEn ? 'Request failed' : 'Yeu cau that bai'));
    } finally {
      setIsRunning(false);
    }
  }, [selectedBotId, interval, initialBots, isEn]);

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-6)', color: 'var(--text-primary)' }}>
        {isEn ? 'Backtest' : 'Backtest'}
      </h1>

      {/* Bot Selector */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <select
          value={selectedBotId}
          onChange={(e) => setSelectedBotId(e.target.value)}
          style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}
        >
          <option value="">{isEn ? 'Select a bot...' : 'Chon bot...'}</option>
          {initialBots.map((bot) => (
            <option key={bot.id} value={bot.id}>{bot.name} ({bot.strategy})</option>
          ))}
        </select>
        <select
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          style={{ width: '100%', padding: 'var(--space-3)', marginTop: 'var(--space-3)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}
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
        className="btn btn-primary"
        style={{ marginBottom: 'var(--space-6)', opacity: isRunning || !selectedBotId ? 0.5 : 1 }}
      >
        {isRunning ? (isEn ? 'Running...' : 'Dang chay...') : (isEn ? 'Run Backtest' : 'Chay Backtest')}
      </button>

      {error && <p style={{ color: 'var(--color-loss)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>{error}</p>}

      {result && <BacktestResults result={result} isEn={isEn} />}
    </div>
  );
}

function BacktestResults({ result, isEn }: { result: BacktestResult; isEn: boolean }) {
  const { total_pnl, win_rate, max_drawdown, sharpe_ratio, total_trades, equity_curve_json, trades_json, win_count, loss_count } = result;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="card">
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-4)', color: 'var(--text-primary)' }}>
          {isEn ? 'Performance Metrics' : 'Chi So Hieu Suat'}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-4)' }}>
          <MetricCard label={isEn ? 'Total PnL' : 'Tong Loi Nhuan'} value={`${total_pnl > 0 ? '+' : ''}$${total_pnl.toFixed(2)}`} positive={total_pnl > 0} />
          <MetricCard label={isEn ? 'Win Rate' : 'Ty Le Thang'} value={`${win_rate.toFixed(1)}%`} />
          <MetricCard label={isEn ? 'Max Drawdown' : 'Max Drawdown'} value={`-${max_drawdown.toFixed(1)}%`} positive={false} />
          <MetricCard label="Sharpe Ratio" value={(sharpe_ratio ?? 0).toFixed(2)} />
          <MetricCard label={isEn ? 'Total Trades' : 'Tong Giao Dich'} value={`${total_trades} (${win_count}W / ${loss_count}L)`} />
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-4)', color: 'var(--text-primary)' }}>
          {isEn ? 'Equity Curve' : 'Duong Equity'}
        </h3>
        <EquityCurveChart data={equity_curve_json} />
      </div>

      <RecentTradesTable trades={trades_json} isEn={isEn} />
    </div>
  );
}

function RecentTradesTable({ trades, isEn }: { trades: BacktestResult['trades_json']; isEn: boolean }) {
  return (
    <div className="card">
      <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-4)', color: 'var(--text-primary)' }}>
        {isEn ? 'Recent Trades' : 'Giao Dich Gan Day'}
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
              <th style={thStyle}>{isEn ? 'Side' : 'Huong'}</th>
              <th style={thStyle}>{isEn ? 'Entry Time' : 'Thoi Gian Vao'}</th>
              <th style={thStyle}>{isEn ? 'Entry Price' : 'Gia Vao'}</th>
              <th style={thStyle}>{isEn ? 'Exit Time' : 'Thoi Gian Ra'}</th>
              <th style={thStyle}>{isEn ? 'Exit Price' : 'Gia Ra'}</th>
              <th style={thStyle}>{isEn ? 'PnL' : 'Loi Nhuan'}</th>
              <th style={thStyle}>{isEn ? 'PnL %' : 'Loi Nhuan %'}</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={tdStyle}>
                  <span style={{ color: trade.side === 'buy' ? 'var(--color-profit)' : 'var(--color-loss)', fontWeight: 600 }}>
                    {trade.side.toUpperCase()}
                  </span>
                </td>
                <td style={tdStyle}>{new Date(trade.entryTimestamp).toLocaleString()}</td>
                <td style={tdStyle}>${trade.entryPrice.toLocaleString()}</td>
                <td style={tdStyle}>{new Date(trade.exitTimestamp).toLocaleString()}</td>
                <td style={tdStyle}>${trade.exitPrice.toLocaleString()}</td>
                <td style={{ ...tdStyle, color: trade.pnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                </td>
                <td style={{ ...tdStyle, color: trade.pnlPct >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
                  {trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>{label}</p>
      <p style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: positive === true ? 'var(--color-profit)' : positive === false ? 'var(--color-loss)' : 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  );
}

function EquityCurveChart({ data }: { data: { timestamp: number; equity: number; drawdownPct: number }[] }) {
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
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
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
      <text x={padding.left} y={height - 5} fill="var(--text-secondary)" fontSize="10">Start</text>
      <text x={width - padding.right} y={height - 5} fill="var(--text-secondary)" fontSize="10" textAnchor="end">End</text>
    </svg>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: 'var(--space-3)',
  color: 'var(--text-secondary)',
  fontWeight: 600,
  fontSize: 'var(--text-xs)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: 'var(--space-3)',
  color: 'var(--text-primary)',
};
