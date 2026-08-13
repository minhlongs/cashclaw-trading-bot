'use client';

import { useState } from 'react';
import { ArrowLeft, Play, Pause, RotateCcw, Settings2 } from 'lucide-react';
import Link from 'next/link';
import type { BotDetailData, TradeRow } from '@/forest/dashboard/actions';
import { BotDetailKpi } from './bot-detail-kpi';
import { BotDetailOverview } from './bot-detail-overview';
import { BotDetailTrades } from './bot-detail-trades';
import { BotDetailConfig } from './bot-detail-config';

type Tab = 'trades' | 'overview' | 'config';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'trades', label: 'Trade History' },
  { value: 'config', label: 'Config' },
];

function ControlButton({ onClick, icon: Icon, label, color }: {
  onClick: () => void;
  icon: typeof Play;
  label: string;
  color?: string;
}) {
  return (
    <button
      className="btn btn-ghost"
      style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', color }}
      onClick={onClick}
    >
      <Icon size={16} /> {label}
    </button>
  );
}

interface BotDetailClientProps {
  bot: BotDetailData;
  trades?: TradeRow[];
}

export function BotDetailClient({ bot, trades = [] }: BotDetailClientProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [config] = useState(bot.config);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/bots"
          className="inline-flex items-center gap-2 text-tertiary hover:text-primary mb-4"
        >
          <ArrowLeft size={16} /> Back to Bots
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="text-h2" style={{ color: 'var(--text-primary)', margin: 0 }}>{bot.name}</h1>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <span className={`badge ${bot.botStatus === 'live_running' ? 'badge-running' : bot.botStatus === 'paused' ? 'badge-paused' : 'badge-neutral'}`}>
                {bot.botStatus}
              </span>
              <span className="badge badge-neutral">{bot.pair}</span>
              <span className="badge badge-neutral">{bot.strategy}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ControlButton onClick={() => {}} icon={Play} label="Resume" />
            <ControlButton onClick={() => {}} icon={Pause} label="Pause" />
            <ControlButton onClick={() => {}} icon={RotateCcw} label="Reset" />
            <ControlButton onClick={() => {}} icon={Settings2} label="Config" color="var(--text-tertiary)" />
          </div>
        </div>
      </div>

      <BotDetailKpi bot={bot} />

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.value}
            className={`tab ${tab === t.value ? 'active' : ''}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <BotDetailOverview bot={bot} />}
      {tab === 'trades' && <BotDetailTrades trades={trades} emptyMsg="No trades yet" />}
      {tab === 'config' && <BotDetailConfig config={config} />}
    </div>
  );
}
