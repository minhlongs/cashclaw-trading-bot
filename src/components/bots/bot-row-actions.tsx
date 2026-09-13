'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Play, Pause, Loader2 } from 'lucide-react';
import type { BotCardData } from '@/forest/dashboard/actions';

interface BotRowActionsProps {
  bot: BotCardData;
  locale: string;
  onStatusChange: (botId: string, newStatus: string) => void;
  onError: (errorMsg: string) => void;
}

type ActionType = 'pause' | 'resume' | 'start';

export function BotRowActions({ bot, locale, onStatusChange, onError }: BotRowActionsProps) {
  const t = useTranslations();
  const [loadingAction, setLoadingAction] = useState<ActionType | null>(null);

  const isRunning = bot.botStatus === 'live_running' || bot.botStatus === 'paper_test';
  const isPaused = bot.botStatus === 'paused';
  const action: ActionType = isRunning ? 'pause' : isPaused ? 'resume' : 'start';

  const handleAction = async () => {
    setLoadingAction(action);
    try {
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        const nextStatus = action === 'pause' ? 'paused' : 'live_running';
        onStatusChange(bot.id, nextStatus);
      } else {
        onError(data.error || t('bots.actions.actionFailed', { error: 'Unknown' }));
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : t('bots.actions.actionFailed', { error: 'Unknown' }));
    } finally {
      setLoadingAction(null);
    }
  };

  const Icon = action === 'pause' ? Pause : Play;
  const title = t(`bots.actions.${action}`);

  return (
    <div className="table-actions-inner">
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        title={title}
        aria-label={title}
        disabled={loadingAction !== null}
        onClick={handleAction}
      >
        {loadingAction !== null ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Icon size={12} />
        )}
      </button>
      <Link href={`/${locale}/bots/${bot.id}`} className="btn btn-ghost btn-xs-wide">
        {t('bots.columns.detail')}
      </Link>
    </div>
  );
}
