'use client';

import { use } from 'react';
import BotDetailClient from '@/components/bots/bot-detail-client';
import { useState, useEffect } from 'react';

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
          const data = await res.json() as { bot: BotDetailData; trades: TradeRow[] };
          setBot(data.bot);
          setTrades(data.trades ?? []);
        }
      } catch (err) {
        console.error('Failed to fetch bot data:', err);
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
      <BotDetailClient initialData={bot} initialTrades={trades} />
    </div>
  );
}
