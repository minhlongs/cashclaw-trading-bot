'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { BotDetailData, TradeRow } from '@/forest/dashboard/actions';
import { BotDetailKpi } from './bot-detail-kpi';
import { BotDetailOverview } from './bot-detail-overview';
import { BotDetailTrades } from './bot-detail-trades';
import { BotDetailConfig } from './bot-detail-config';
import {
  Tab,
  ControlAction,
  TABS,
  BotDetailActionButtons,
} from './bot-detail-controls';

export { type Tab, type ControlAction } from './bot-detail-controls';

export interface BotDetailClientProps {
  bot: BotDetailData;
  trades?: TradeRow[];
}

export function BotDetailClient({ bot, trades = [] }: BotDetailClientProps) {
  const t = useTranslations('botDetail');
  const [tab, setTab] = useState<Tab>('overview');
  const [config, setConfig] = useState(bot.config);
  const [currentStatus, setCurrentStatus] = useState(bot.botStatus);
  const [loadingAction, setLoadingAction] = useState<ControlAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleControlAction(action: ControlAction) {
    setLoadingAction(action);
    setActionError(null);
    try {
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || t('actionFailed', { error: 'Unknown error' }));
      }
      if (action === 'resume' || action === 'start') setCurrentStatus('live_running');
      else if (action === 'pause') setCurrentStatus('paused');
      else if (action === 'stop') setCurrentStatus('stopped');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingAction(null);
    }
  }

  const resumeAction: ControlAction = currentStatus === 'paused' ? 'resume' : 'start';

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/bots"
          className="inline-flex items-center gap-2 text-tertiary hover:text-primary mb-4"
        >
          <ArrowLeft size={16} /> Back to Bots
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h2 text-primary mb-4">{bot.name}</h1>
            <div className="flex items-center gap-2">
              <span className={`badge ${currentStatus === 'live_running' ? 'badge-running' : currentStatus === 'paused' ? 'badge-paused' : 'badge-neutral'}`}>
                {currentStatus}
              </span>
              <span className="badge badge-neutral">{bot.pair}</span>
              <span className="badge badge-neutral">{bot.strategy}</span>
            </div>
          </div>
          <BotDetailActionButtons
            resumeAction={resumeAction}
            loadingAction={loadingAction}
            onAction={handleControlAction}
            onOpenConfig={() => setTab('config')}
            resumeLabel={t('resume')}
            pauseLabel={t('pause')}
            resetLabel={t('reset')}
            configLabel={t('config')}
          />
        </div>
      </div>

      {actionError && (
        <div className="badge badge-error flex items-center justify-between gap-2 p-3 text-sm" role="alert">
          <span>{actionError}</span>
          <button
            type="button"
            className="text-secondary hover:text-primary ml-2 text-xs"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      <BotDetailKpi bot={bot} />

      <div className="tabs">
        {TABS.map((tabItem) => (
          <button
            key={tabItem.value}
            type="button"
            className={`tab ${tab === tabItem.value ? 'active' : ''}`}
            onClick={() => setTab(tabItem.value)}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <BotDetailOverview bot={{ ...bot, botStatus: currentStatus }} />}
      {tab === 'trades' && <BotDetailTrades trades={trades} emptyMsg="No trades yet" />}
      {tab === 'config' && (
        <BotDetailConfig
          config={config}
          botId={bot.id}
          onConfigSaved={setConfig}
        />
      )}
    </div>
  );
}
