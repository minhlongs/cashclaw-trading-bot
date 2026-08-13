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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Strategy</div>
          <div style={{ fontWeight: 600 }}>{t(`bots.strategy.${bot.strategy}`)}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Pair</div>
          <div className="mono" style={{ fontWeight: 600 }}>{bot.pair}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Exchange</div>
          <div style={{ fontWeight: 600 }}>{bot.exchange}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Status</div>
          <StatusBadge status={bot.botStatus} />
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Total Trades</div>
          <div className="mono" style={{ fontWeight: 600 }}>{totalTrades}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Created</div>
          <div style={{ fontWeight: 600 }}>{bot.startedAt ? new Date(bot.startedAt).toLocaleDateString('vi-VN') : '—'}</div>
        </div>
      </div>
    </div>
  );
}
