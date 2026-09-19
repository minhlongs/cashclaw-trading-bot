'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { runBacktestAction } from '@/forest/backtest/actions';
import { BacktestResults, formatStrategy } from './backtests-client-results';
import { INTERVALS, type BotInfo, type BacktestResult } from './backtests-client-types';

export type { BotInfo, BacktestResult };
export { INTERVALS };

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
