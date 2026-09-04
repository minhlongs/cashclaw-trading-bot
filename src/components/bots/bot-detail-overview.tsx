'use client';

import { useTranslations } from 'next-intl';
import type { BotDetailData } from '@/forest/dashboard/actions';

interface BotDetailOverviewProps {
  bot: BotDetailData;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'badge-neutral',
    paper_test: 'badge-neutral',
    live_running: 'badge-running',
    paused: 'badge-paused',
    error: 'badge-error',
    stopped: 'badge-neutral',
    running: 'badge-running',
  };
  return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status}</span>;
}

export function BotDetailOverview({ bot }: BotDetailOverviewProps) {
  const t = useTranslations();
  const totalTrades = bot.winCount + bot.lossCount;

  return (
    <div className="space-y-4">
      <div className="detail-grid">
        <div>
          <div className="detail-label">Strategy</div>
          <div className="detail-value">{t(`bots.strategy.${bot.strategy}`)}</div>
        </div>
        <div>
          <div className="detail-label">Pair</div>
          <div className="mono detail-value">{bot.pair}</div>
        </div>
        <div>
          <div className="detail-label">Exchange</div>
          <div className="detail-value">{bot.exchange}</div>
        </div>
        <div>
          <div className="detail-label">Status</div>
          <StatusBadge status={bot.botStatus} />
        </div>
        <div>
          <div className="detail-label">Total Trades</div>
          <div className="mono detail-value">{totalTrades}</div>
        </div>
        <div>
          <div className="detail-label">Created</div>
          <div className="detail-value">{bot.startedAt ? new Date(bot.startedAt).toLocaleDateString('vi-VN') : '—'}</div>
        </div>
      </div>
    </div>
  );
}
