'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pause, Play, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';
import type { BotCardData } from '@/forest/dashboard/actions';

interface TerminalQuickActionsProps {
  bots: BotCardData[];
  onActionComplete?: () => void;
}

export function TerminalQuickActions({ bots, onActionComplete }: TerminalQuickActionsProps) {
  const t = useTranslations('dashboard.terminal');
  const [loadingAction, setLoadingAction] = useState<'pause' | 'resume' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeBots = bots.filter((b) => b.botStatus === 'running' || b.botStatus === 'active');
  const pausedBots = bots.filter((b) => b.botStatus === 'paused');

  async function handleBatchAction(action: 'pause' | 'resume') {
    const targets = action === 'pause' ? activeBots : pausedBots;
    if (targets.length === 0) return;

    setLoadingAction(action);
    setStatusMessage(null);
    try {
      await Promise.allSettled(
        targets.map((bot) =>
          fetch(`/api/bots/${bot.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          }),
        ),
      );
      setStatusMessage(t('actionSuccess'));
      onActionComplete?.();
    } catch {
      setStatusMessage(t('actionFailed'));
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="card mb-6 border border-subtle bg-surface">
      <div className="card-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-warning" />
          <h2 className="text-base font-medium">{t('title')}</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-secondary">
          <CheckCircle2 className="h-4 w-4 text-profit" />
          <span>{t('allHealthy')}</span>
        </div>
      </div>

      <div className="card-body flex flex-wrap items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="badge badge-success">{t('activeCount', { count: activeBots.length })}</span>
          <span className="badge badge-warning">{t('pausedCount', { count: pausedBots.length })}</span>
          {statusMessage && <span className="text-secondary">{statusMessage}</span>}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary text-xs"
            disabled={loadingAction !== null || pausedBots.length === 0}
            onClick={() => handleBatchAction('resume')}
          >
            {loadingAction === 'resume' ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1 h-3.5 w-3.5 text-profit" />
            )}
            {loadingAction === 'resume' ? t('resuming') : t('resumeAll')}
          </button>

          <button
            type="button"
            className="btn btn-secondary text-xs text-loss"
            disabled={loadingAction !== null || activeBots.length === 0}
            onClick={() => handleBatchAction('pause')}
          >
            {loadingAction === 'pause' ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Pause className="mr-1 h-3.5 w-3.5 text-loss" />
            )}
            {loadingAction === 'pause' ? t('pausing') : t('pauseAll')}
          </button>
        </div>
      </div>
    </div>
  );
}
