'use client';

import { use, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { BotDetailClient } from '@/components/bots/bot-detail-client';

interface BotDetailData {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion';
  pair: string;
  exchange: string;
  botStatus: string;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  capitalAllocated: number;
  capitalUsed: number;
  maxDrawdownPct: number;
  startedAt: number | null;
  updatedAt: number;
  config: Record<string, number>;
}

interface ApiBotDetail {
  id: string;
  name: string;
  strategy: string;
  pair: string;
  exchange: string;
  status: string;
  capital: number;
  totalPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  currentDrawdown: number;
  startedAt: number | null;
  stoppedAt: number | null;
  lastTickAt: number | null;
  lastOrderAt: number | null;
  gridConfig: Record<string, unknown>;
  recentEvents?: Array<{ id: string; eventType: string; details: Record<string, unknown>; timestamp: number }>;
}

interface TradeRow {
  id: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  pnl: number | null;
  status: 'open' | 'filled' | 'cancelled' | 'failed';
  openedAt: number;
}

interface TradeEventRow {
  id: string;
  eventType: string;
  details: Record<string, unknown>;
  timestamp: number;
}

export default function BotDetailPageClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('botDetail');
  const common = useTranslations('common');
  const [bot, setBot] = useState<BotDetailData | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [tradeEvents, setTradeEvents] = useState<TradeEventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/bots/${id}`);
        if (res.ok) {
          const body = await res.json() as { ok: boolean; data?: ApiBotDetail; error?: string };
          if (body.ok && body.data) {
            const d = body.data;
            setBot({
              id: d.id,
              name: d.name,
              strategy: d.strategy as 'grid' | 'mean_reversion',
              pair: d.pair,
              exchange: d.exchange,
              botStatus: d.status,
              totalPnl: d.totalPnl,
              winCount: d.winCount,
              lossCount: d.lossCount,
              capitalAllocated: d.capital,
              capitalUsed: 0,
              maxDrawdownPct: d.maxDrawdown,
              startedAt: d.startedAt,
              updatedAt: d.lastTickAt ?? d.startedAt ?? Date.now(),
              config: (d.gridConfig ?? {}) as Record<string, number>,
            });
            setTrades([]);
            if (d.recentEvents && Array.isArray(d.recentEvents)) {
              setTradeEvents(d.recentEvents.map(e => ({
                id: e.id,
                eventType: e.eventType,
                details: e.details,
                timestamp: e.timestamp,
              })));
            }
          }
        }
      } catch {
        // Bot data fetch failed — user sees empty state
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="main-content">
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <p style={{ color: 'var(--text-secondary)' }}>{common('loading')}</p>
        </div>
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="main-content">
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <h2 style={{ color: 'var(--text-secondary)' }}>{t('notFound')}</h2>
          <p style={{ color: 'var(--text-tertiary)', marginTop: '8px' }}>
            {t('notFoundWithId', { id })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <BotDetailClient bot={bot} trades={trades} />
      {tradeEvents.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--space-4)' }}>
          <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
            {t('tradeEvents')}
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary)' }}>{common('time')}</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary)' }}>{t('eventType')}</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary)' }}>{t('eventDetails')}</th>
                </tr>
              </thead>
              <tbody>
                {tradeEvents.slice(0, 50).map((evt) => (
                  <tr key={evt.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {new Date(evt.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <span className={`badge ${
                        evt.eventType === 'fill' ? 'badge-success' :
                        evt.eventType === 'error' ? 'badge-error' :
                        'badge-neutral'
                      }`}>{evt.eventType}</span>
                    </td>
                    <td style={{ padding: '8px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 'var(--text-xs)' }}>
                      {JSON.stringify(evt.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
