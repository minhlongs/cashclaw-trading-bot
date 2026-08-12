'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';

interface Props {
  initialBots?: Array<{ id: string; name: string; strategy: string; configJson: string }>;
}

export interface BotInfo {
  id: string;
  name: string;
  strategy: string;
  configJson: string;
}

export interface BacktestResult {
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
  created_at: number;
}

const EXCHANGES = ['binance', 'bybit', 'okx'] as const;
const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;

export default function BacktestsClient({ initialBots }: Props) {
  const locale = useLocale();
  const t = (vi: string, en: string) => locale === 'vi' ? vi : en;

  const [bots, setBots] = useState<BotInfo[]>(initialBots ?? []);
  const [selectedBotId, setSelectedBotId] = useState('');
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candlesFetched, setCandlesFetched] = useState<number | null>(null);

  // Set default selection when bots load
  useEffect(() => {
    if (bots.length > 0 && !selectedBotId) {
      setSelectedBotId(bots[0].id);
    }
  }, [bots, selectedBotId]);

  const selectedBot = bots.find((b) => b.id === selectedBotId);
  const selectedConfig = useCallback((): Record<string, unknown> | null => {
    if (!selectedBot) return null;
    try { return JSON.parse(selectedBot.configJson) as Record<string, unknown>; } catch { return null; }
  }, [selectedBot]);

  const sCfg = selectedConfig();

  const handleRun = async () => {
    if (!selectedBot || !sCfg) {
      setError('No bot selected');
      return;
    }
    setLoading(true);
    setError(null);
    setCandlesFetched(null);

    try {
      const startMs = new Date('2024-01-01').getTime();
      const endMs = Date.now();

      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: selectedBotId,
          exchange: 'binance',
          symbol: (sCfg.symbol as string) ?? 'BTC/USDT',
          strategy: selectedBot.strategy,
          config: sCfg,
          startDate: '2024-01-01',
          endDate: new Date().toISOString().split('T')[0],
          interval: '1h',
          initialCapital: (sCfg.capital as number) ?? 1000,
        }),
      });

      const data = (await res.json()) as { success: boolean; error?: string; candlesFetched?: number; result?: unknown };
      if (!data.success) {
        setError(data.error ?? 'Unknown error');
        return;
      }

      const fetched = data.candlesFetched;
      setCandlesFetched(typeof fetched === 'number' ? fetched : null);
      if (data.result) setResults([data.result as BacktestResult, ...results]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Run Backtest */}
      <div className="card">
        <h2 style={{ fontWeight: 700, fontSize: 'var(--text-xl)', marginBottom: '16px' }}>
          {t('Chạy Backtest', 'Run Backtest')}
        </h2>

        <div className="form-group">
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
            {t('Bot', 'Bot')}
          </label>
          <select
            value={selectedBotId}
            onChange={(e) => setSelectedBotId(e.target.value)}
            className="input"
            style={{ width: '100%' }}
            disabled={bots.length === 0}
          >
            {bots.length === 0 && <option value="">{t('Chưa có bot / No bots yet', '')}</option>}
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — {b.strategy}
              </option>
            ))}
          </select>
        </div>

        {sCfg && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '4px' }}>
            {(sCfg.symbol as string) ?? 'USD'} | Exchange: {(sCfg.exchange as string) ?? 'paper'} | Capital: ${(sCfg.capital as number ?? 0).toLocaleString()}
          </div>
        )}

        <button
          onClick={handleRun}
          disabled={loading || !selectedBotId}
          className="btn btn-primary"
          style={{ marginTop: '16px', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? t('Đang chạy...', 'Running...') : t('Chạy Backtest', 'Run Backtest')}
        </button>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', marginTop: '8px' }}>{error}</p>}
        {candlesFetched !== null && !error && (
          <p style={{ color: 'var(--color-success)', fontSize: 'var(--text-sm)', marginTop: '8px' }}>
            {t(`Fetched ${candlesFetched} candles`, `Fetched ${candlesFetched} candles`)}
          </p>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 'var(--text-xl)', marginBottom: '12px' }}>
            {t('Kết quả', 'Results')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {results.map((r) => (
              <div key={r.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 'var(--text-sm)' }}>{r.strategy}</span>
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px', fontSize: 'var(--text-sm)' }}>
                      {r.pair} @ {r.exchange}
                    </span>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                    {new Date(r.start_date).toLocaleDateString()} — {new Date(r.end_date).toLocaleDateString()}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginTop: '12px' }}>
                  <Metric label={t('Tổng P&L', 'Total P&L')} value={`$${r.total_pnl.toFixed(2)}`} positive={r.total_pnl >= 0} locale={locale} />
                  <Metric label={t('Tỷ lệ thắng', 'Win Rate')} value={`${(r.win_rate * 100).toFixed(1)}%`} locale={locale} />
                  <Metric label={t('Max DD', 'Max DD')} value={`${r.max_drawdown.toFixed(2)}%`} locale={locale} />
                  <Metric label={t('Trades', 'Trades')} value={`${r.win_count}W / ${r.loss_count}L (${r.total_trades})`} locale={locale} />
                  {r.sharpe_ratio !== null && <Metric label="Sharpe" value={r.sharpe_ratio.toFixed(2)} locale={locale} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {bots.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
            {t('Tạo bot trước để chạy backtest', 'Create a bot first to run a backtest')}
          </p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, positive, locale }: { label: string; value: string; positive?: boolean; locale: string }) {
  return (
    <div>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', margin: 0 }}>{label}</p>
      <p
        style={{
          fontSize: 'var(--text-lg)',
          fontWeight: 700,
          margin: 0,
          color: positive && positive ? 'var(--color-success)' : 'var(--text-primary)',
        }}
      >
        {value}
      </p>
    </div>
  );
}
