'use client';

import { use, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { BotDetailClient } from '@/components/bots/bot-detail-client';
import type { ApiBotDetail, BotDetailData, TradeEventRow, TradeRow } from './page-client-types';
import { BotDetailEventsTable } from './bot-detail-events-table';

export type {
  BotDetailData,
  ApiBotDetail,
  TradeRow,
  TradeEventRow,
} from './page-client-types';

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
              strategy: d.strategy as BotDetailData['strategy'],
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
        <div className="card empty-state">
          <p className="text-secondary">{common('loading')}</p>
        </div>
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="main-content">
        <div className="card empty-state">
          <h2 className="text-secondary">{t('notFound')}</h2>
          <p className="text-tertiary mt-2">
            {t('notFoundWithId', { id })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <BotDetailClient bot={bot} trades={trades} />
      <BotDetailEventsTable
        events={tradeEvents}
        title={t('tradeEvents')}
        timeHeader={common('time')}
        eventTypeHeader={t('eventType')}
        eventDetailsHeader={t('eventDetails')}
      />
    </div>
  );
}
