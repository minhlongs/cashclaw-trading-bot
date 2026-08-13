'use client';

import { useState, useCallback } from 'react';
import { useLocale } from 'next-intl';

interface BotInfo {
  id: string;
  name: string;
  strategy: string;
  configJson: string;
}

interface Trade {
  id: string;
  side: 'LONG' | 'SHORT';
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
}

interface BacktestResult {
  trades: Trade[];
  equityCurve: number[];
  startingBalance: number;
  endingBalance: number;
  totalReturn: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  totalTrades: number;
}

const MOCK_RESULT: BacktestResult = {
  startingBalance: 10000,
  endingBalance: 12450,
  totalReturn: 24.5,
  winRate: 58.3,
  maxDrawdown: 12.4,
  sharpeRatio: 1.85,
  profitFactor: 2.1,
  totalTrades: 48,
  equityCurve: [
    10000, 10120, 10280, 10150, 10320, 10480, 10350, 10520, 10680, 10550,
    10720, 10880, 10750, 10920, 11080, 10950, 11120, 11280, 11150, 11320,
    11480, 11350, 11520, 11680, 11550, 11720, 11880, 11750, 11920, 12080,
    11950, 12120, 12280, 12150, 12320, 12450, 12300, 12450, 12520, 12380,
    12520, 12680, 12550, 12720, 12880, 12750, 12920, 12450,
  ],
  trades: [
    { id: '1', side: 'LONG', entryTime: '2026-08-01 09:15', exitTime: '2026-08-01 11:30', entryPrice: 67250, exitPrice: 67890, pnl: 640, pnlPercent: 0.95 },
    { id: '2', side: 'SHORT', entryTime: '2026-08-01 14:00', exitTime: '2026-08-01 16:45', entryPrice: 68100, exitPrice: 67650, pnl: 450, pnlPercent: 0.66 },
    { id: '3', side: 'LONG', entryTime: '2026-08-02 08:30', exitTime: '2026-08-02 10:15', entryPrice: 67900, exitPrice: 67550, pnl: -350, pnlPercent: -0.52 },
    { id: '4', side: 'LONG', entryTime: '2026-08-02 13:00', exitTime: '2026-08-02 15:30', entryPrice: 67600, exitPrice: 68200, pnl: 600, pnlPercent: 0.89 },
    { id: '5', side: 'SHORT', entryTime: '2026-08-03 09:45', exitTime: '2026-08-03 12:00', entryPrice: 68500, exitPrice: 68050, pnl: 450, pnlPercent: 0.66 },
    { id: '6', side: 'LONG', entryTime: '2026-08-03 14:30', exitTime: '2026-08-03 16:00', entryPrice: 68100, exitPrice: 68450, pnl: 350, pnlPercent: 0.51 },
    { id: '7', side: 'SHORT', entryTime: '2026-08-04 08:00', exitTime: '2026-08-04 10:30', entryPrice: 68700, exitPrice: 69200, pnl: -500, pnlPercent: -0.73 },
    { id: '8', side: 'LONG', entryTime: '2026-08-04 13:45', exitTime: '2026-08-04 16:15', entryPrice: 68900, exitPrice: 69450, pnl: 550, pnlPercent: 0.80 },
  ],
};

export default function BacktestsClient({ initialBots = [] }: { initialBots?: BotInfo[] }) {
  const locale = useLocale();
  const isEn = locale === 'en';
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(MOCK_RESULT);
  const [showMockBanner, setShowMockBanner] = useState(true);

  const runBacktest = useCallback(async () => {
    if (!selectedBotId) {
      setError(isEn ? 'Please select a bot' : 'Chon bot truoc');
      return;
    }
    setIsRunning(true);
    setError(null);
    setShowMockBanner(false);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId: selectedBotId }),
      });
      const data = (await res.json()) as { success: boolean; result?: BacktestResult; error?: string };
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
  }, [selectedBotId, isEn]);

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

      {/* Mock Data Banner */}
      {showMockBanner && (
        <div style={{ background: 'var(--color-warning)', color: '#000', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          {isEn ? 'Showing demo data. Select a bot and run backtest for real results.' : 'Dang hien thi du lieu mau. Chon bot va chay backtest de xem ket qua that.'}
        </div>
      )}

      {result && <BacktestResults result={result} isEn={isEn} />}
    </div>
  );
}

function BacktestResults({ result, isEn }: { result: BacktestResult; isEn: boolean }) {
  const { startingBalance, endingBalance, totalReturn, winRate, maxDrawdown, sharpeRatio, profitFactor, totalTrades, equityCurve, trades } = result;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Performance Metrics */}
      <div className="card">
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-4)', color: 'var(--text-primary)' }}>
          {isEn ? 'Performance Metrics' : 'Chi So Hieu Suat'}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-4)' }}>
          <MetricCard label={isEn ? 'Total Return' : 'Tong Loi Nhuan'} value={`${totalReturn > 0 ? '+' : ''}${totalReturn.toFixed(1)}%`} positive={totalReturn > 0} />
          <MetricCard label={isEn ? 'Win Rate' : 'Ty Le Thang'} value={`${winRate.toFixed(1)}%`} />
          <MetricCard label={isEn ? 'Max Drawdown' : 'Max Drawdown'} value={`-${maxDrawdown.toFixed(1)}%`} positive={false} />
          <MetricCard label="Sharpe Ratio" value={sharpeRatio.toFixed(2)} />
          <MetricCard label={isEn ? 'Profit Factor' : 'Loi Nhuan Factor'} value={profitFactor.toFixed(2)} />
          <MetricCard label={isEn ? 'Total Trades' : 'Tong Giao Dich'} value={totalTrades.toString()} />
          <MetricCard label={isEn ? 'Starting Balance' : 'So Du Khoi Dau'} value={`$${startingBalance.toLocaleString()}`} />
          <MetricCard label={isEn ? 'Ending Balance' : 'So Du Cuoi Cung'} value={`$${endingBalance.toLocaleString()}`} positive={endingBalance >= startingBalance} />
        </div>
      </div>

      {/* Equity Curve */}
      <div className="card">
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-4)', color: 'var(--text-primary)' }}>
          {isEn ? 'Equity Curve' : 'Duong Equity'}
        </h3>
        <EquityCurveChart data={equityCurve} startingBalance={startingBalance} />
      </div>

      {/* Trade List */}
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
              {trades.map((trade) => (
                <tr key={trade.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={tdStyle}>
                    <span style={{ color: trade.side === 'LONG' ? 'var(--color-profit)' : 'var(--color-loss)', fontWeight: 600 }}>
                      {trade.side}
                    </span>
                  </td>
                  <td style={tdStyle}>{trade.entryTime}</td>
                  <td style={tdStyle}>${trade.entryPrice.toLocaleString()}</td>
                  <td style={tdStyle}>{trade.exitTime}</td>
                  <td style={tdStyle}>${trade.exitPrice.toLocaleString()}</td>
                  <td style={{ ...tdStyle, color: trade.pnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
                    {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toLocaleString()}
                  </td>
                  <td style={{ ...tdStyle, color: trade.pnlPercent >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
                    {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

function EquityCurveChart({ data, startingBalance }: { data: number[]; startingBalance: number }) {
  if (data.length < 2) return null;

  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = data.map((val, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((val - minVal) / range) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  const linePath = points;
  const areaPath = `${padding.left},${padding.top + chartHeight} ${points} ${width - padding.right},${padding.top + chartHeight}`;

  const isProfit = data[data.length - 1] >= startingBalance;

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
      <line x1={padding.left} y1={padding.top + chartHeight - ((startingBalance - minVal) / range) * chartHeight} x2={width - padding.right} y2={padding.top + chartHeight - ((startingBalance - minVal) / range) * chartHeight} stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="2,2" />

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
