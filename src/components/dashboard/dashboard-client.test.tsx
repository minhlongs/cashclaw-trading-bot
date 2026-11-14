import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import enMessages from '@/messages/en.json';
import viMessages from '@/messages/vi.json';
import type { BotCardData } from '@/forest/dashboard/actions';
import { DashboardTopKpiCards, DashboardPerformanceGrid } from './dashboard-kpi-cards';

const sampleKpis = {
  totalBalance: 10_250,
  todayPnl: 250,
  activeBots: 1,
  winRate: 75,
  totalTrades: 12,
};

const sampleBots: BotCardData[] = [
  {
    id: 'bot_paper_1',
    name: 'Paper Grid Bot',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    botStatus: 'running',
    totalPnl: 250,
    winCount: 9,
    lossCount: 3,
    startedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_500_000,
    capitalAllocated: 10_000,
    maxDrawdownPct: 1.5,
  },
];

describe('DashboardClient & KPI Paper-Simulation Separation Badges (Gate G11)', () => {
  it('renders unmistakable paper-simulation-badge on balance, capital, and PnL cards', () => {
    render(
      <>
        <DashboardTopKpiCards kpis={sampleKpis} bots={sampleBots} />
        <DashboardPerformanceGrid kpis={sampleKpis} bots={sampleBots} />
      </>,
    );

    const badges = screen.getAllByTestId('paper-simulation-badge');
    expect(badges.length).toBe(3);
    for (const badge of badges) {
      expect(badge.textContent).toBe('SIMULATED PAPER PnL — NOT REAL FUNDS');
    }
  });

  it('defines matching EN and VI paperSimulationBadge keys in localization catalogs', () => {
    expect(enMessages.dashboard.paperSimulationBadge).toBe('SIMULATED PAPER PnL — NOT REAL FUNDS');
    expect(viMessages.dashboard.paperSimulationBadge).toBe('MÔ PHỎNG GIẤY — KHÔNG PHẢI TIỀN THẬT');
  });
});
