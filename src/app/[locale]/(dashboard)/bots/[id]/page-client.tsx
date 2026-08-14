'use client';

import { use, useState, useEffect } from 'react';
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

export default function BotDetailPageClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [bot, setBot] = useState<BotDetailData | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
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
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="main-content">
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <h2 style={{ color: 'var(--text-secondary)' }}>Bot not found</h2>
          <p style={{ color: 'var(--text-tertiary)', marginTop: '8px' }}>
            Không tìm thấy bot / No bot found with ID: {id}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <BotDetailClient bot={bot} trades={trades} />
    </div>
  );
}
