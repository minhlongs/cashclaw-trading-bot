'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import type { BotDetailData } from '@/forest/dashboard/actions';

interface BotDetailKpiProps {
  bot: BotDetailData;
}

export function BotDetailKpi({ bot }: BotDetailKpiProps) {
  const totalTrades = bot.winCount + bot.lossCount;
  const winRate = totalTrades > 0 ? ((bot.winCount / totalTrades) * 100).toFixed(1) : '0';

  return (
    <div className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-label">Total P&L</div>
        <div className={`kpi-value mono ${bot.totalPnl >= 0 ? 'profit' : 'loss'}`}>
          {bot.totalPnl >= 0 ? '+' : ''}{bot.totalPnl.toFixed(2)}
        </div>
        <div className={`kpi-change mono ${bot.totalPnl >= 0 ? 'profit' : 'loss'}`}>
          {bot.totalPnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          +{((bot.totalPnl / bot.capitalAllocated) * 100).toFixed(2)}%
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Win Rate</div>
        <div className="kpi-value mono" style={{ color: 'var(--color-profit)' }}>{winRate}%</div>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
          {bot.winCount}W / {bot.lossCount}L
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Capital Used</div>
        <div className="kpi-value mono">
          ${bot.capitalUsed.toLocaleString()}
        </div>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
          / ${bot.capitalAllocated.toLocaleString()} ({((bot.capitalUsed / bot.capitalAllocated) * 100).toFixed(0)}%)
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Max Drawdown</div>
        <div className="kpi-value mono text-warning">-{bot.maxDrawdownPct}%</div>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>Giới hạn 20%</div>
      </div>
    </div>
  );
}
