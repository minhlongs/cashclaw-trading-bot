'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Bot } from 'lucide-react';
import Link from 'next/link';
import type { BotCardData } from '@/forest/dashboard/actions';

const statusStyles: Record<string, string> = {
  running: 'badge-success',
  active: 'badge-success',
  paused: 'badge-warning',
  stopped: 'badge-neutral',
  error: 'badge-error',
};

export interface DashboardBotListProps {
  bots: BotCardData[];
}

export function DashboardBotList({ bots }: DashboardBotListProps) {
  const t = useTranslations('dashboard');
  const locale = useLocale();

  return (
    <div className="panel mt-6">
      <header className="panel-header">
        <h2>Bots</h2>
        <div className="panel-actions">
          <span className="text-sm text-secondary">
            {bots.length === 0
              ? (t('empty') ?? 'No bots found. Create your first bot to get started.')
              : `${bots.length} ${t('subtitle')}`}
          </span>
          <Link className="btn btn-secondary" href={`/${locale}/bots/new`}>
            <Bot className="btn-icon" />
            {t('createBot')}
          </Link>
        </div>
      </header>

      {bots.length === 0 ? (
        <div className="empty-state">
          <Bot size={40} className="mono" />
          <p>{t('empty') ?? 'No bots found. Start by creating a new trading bot.'}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {bots.map((bot) => (
            <div className="list-item" key={bot.id}>
              <div className="list-meta">
                <div className="list-titles">
                  <h4>{bot.name}</h4>
                  <span>{bot.pair}</span>
                </div>
              </div>
              <div className="flex items-center gap-5">
                <span className={`badge ${statusStyles[bot.botStatus] ?? 'badge-neutral'}`}>
                  {bot.botStatus}
                </span>
                <div className="list-value">
                  <div className={`mono ${bot.totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                    ${bot.totalPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                  <div className="meta">
                    {bot.winCount}W / {bot.lossCount}L
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
