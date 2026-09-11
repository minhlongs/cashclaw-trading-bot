'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { runBacktestAction } from '@/forest/backtest/actions';
import { MetricCard } from './metric-card';
import { EquityCurveChart, type EquityCurvePoint } from './equity-curve-chart';
import { RecentTradesTable, type BacktestTradeItem } from './recent-trades-table';

export interface BotInfo {
  id: string;
  name: string;
  strategy: string;
  configJson: string;
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
  equity_curve_json: EquityCurvePoint[];
  trades_json: BacktestTradeItem[];
  created_at: number;
}

const INTERVALS = ['1h', '4h', '1d'] as const;

function formatStrategy(strategy: string, locale: string): string {
  if (strategy === 'volatility_dca') {
    return locale === 'vi' ? 'DCA Biến Động' : 'Volatility DCA';
  }
  return strategy;
}

export default function BacktestsClient({ initialBots = [] }: { initialBots?: BotInfo[] }) {
  const t = useTranslations('backtests');
  const locale = useLocale();
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
        strategy: bot.strategy as 'grid' | 'mean_reversion' | 'volatility_dca',
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
            <option key={bot.id} value={bot.id}>{bot.name} ({formatStrategy(bot.strategy, locale)})</option>
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
