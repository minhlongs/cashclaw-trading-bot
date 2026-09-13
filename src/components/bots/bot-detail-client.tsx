'use client';

import { useState } from 'react';
import { ArrowLeft, Play, Pause, RotateCcw, Settings2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { BotDetailData, TradeRow } from '@/forest/dashboard/actions';
import { BotDetailKpi } from './bot-detail-kpi';
import { BotDetailOverview } from './bot-detail-overview';
import { BotDetailTrades } from './bot-detail-trades';
import { BotDetailConfig } from './bot-detail-config';

type Tab = 'trades' | 'overview' | 'config';
type ControlAction = 'start' | 'stop' | 'pause' | 'resume';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'trades', label: 'Trade History' },
  { value: 'config', label: 'Config' },
];

interface ControlButtonProps {
  onClick: () => void;
  icon: typeof Play;
  label: string;
  disabled?: boolean;
  loading?: boolean;
}

function ControlButton({
  onClick,
  icon: Icon,
  label,
  disabled = false,
  loading = false,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      className="btn btn-ghost flex items-center gap-2"
      onClick={onClick}
      disabled={disabled}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {label}
    </button>
  );
}

interface BotDetailClientProps {
  bot: BotDetailData;
  trades?: TradeRow[];
}

export function BotDetailClient({ bot, trades = [] }: BotDetailClientProps) {
  const t = useTranslations('botDetail');
  const [tab, setTab] = useState<Tab>('overview');
  const [config] = useState(bot.config);
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
          <div className="flex items-center gap-2">
            <ControlButton
              onClick={() => handleControlAction(resumeAction)}
              icon={Play}
              label={t('resume')}
              disabled={loadingAction !== null}
              loading={loadingAction === resumeAction}
            />
            <ControlButton
              onClick={() => handleControlAction('pause')}
              icon={Pause}
              label={t('pause')}
              disabled={loadingAction !== null}
              loading={loadingAction === 'pause'}
            />
            <ControlButton
              onClick={() => handleControlAction('stop')}
              icon={RotateCcw}
              label={t('reset')}
              disabled={loadingAction !== null}
              loading={loadingAction === 'stop'}
            />
            <ControlButton
              onClick={() => setTab('config')}
              icon={Settings2}
              label={t('config')}
              disabled={loadingAction !== null}
            />
          </div>
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
      {tab === 'config' && <BotDetailConfig config={config} />}
    </div>
  );
}
