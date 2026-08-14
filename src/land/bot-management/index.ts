// Land layer — Bot Management Orchestration
// Coordinates BotManager, D1 persistence (FlightRecorder), and telemetry
// for multi-bot lifecycle workflows.
//
// Import rules: land imports seed, tree, forest.

import { getBotManager, resetBotManager } from '@/tree/bot';
import { BotInstance } from '@/tree/bot/bot-instance';
import type { BotState, BotConfig } from '@/tree/bot/types';
import type { CreateBotRequest } from '@/tree/bot/bot-manager';
import type { ExchangeConfig } from '@/tree/exchange/types';
import { createServerClient } from '@/lib/db/client';
import type { TradeEventType, CapitalSnapshot } from '@/tree/telemetry';
import { ok, err, type Result } from '@/lib/result';

// Types extracted to bot-management-types.ts
import type { BotInfo, BotCreateInput, BotListResult } from './bot-management-types';
export type { BotInfo, BotCreateInput, BotListResult } from './bot-management-types';

// ── Bot Operations ─────────────────────────────────────────────

export function getAllBots(): BotInfo[] {
  const manager = getBotManager();
  return manager.getAllBots().map(botToInfo);
}

export function getRunningBots(): BotInfo[] {
  const manager = getBotManager();
  return manager.getRunningBots().map(botToInfo);
}

export function getBot(id: string): BotInfo | undefined {
  const manager = getBotManager();
  const bot = manager.getBot(id);
  return bot ? botToInfo(bot) : undefined;
}

export async function createBot(input: BotCreateInput): Promise<BotInfo> {
  const manager = getBotManager();

  const baseConfig = {
    symbol: input.pair,
    exchange: input.exchange,
    mode: input.mode,
    capital: input.capital,
    maxDrawdownPct: 15,
    strategy: input.strategy,
  };

  const config: BotConfig = input.strategy === 'grid'
    ? ({
        ...baseConfig,
        gridSpacingPct: (input.config.gridSpacingPct as number) ?? 1,
        gridLevels: (input.config.gridLevels as number) ?? 5,
        capitalPerLevelPct: (input.config.capitalPerLevelPct as number) ?? 20,
        takeProfitPct: (input.config.takeProfitPct as number) ?? 0.5,
        stopLossPct: (input.config.stopLossPct as number) ?? 2,
        rebalanceOnFill: (input.config.rebalanceOnFill as boolean) ?? false,
      }) as BotConfig
    : ({
        ...baseConfig,
        bbPeriod: (input.config.bbPeriod as number) ?? 20,
        bbStdDev: (input.config.bbStdDev as number) ?? 2,
        rsiPeriod: (input.config.rsiPeriod as number) ?? 14,
        rsiBuyThreshold: (input.config.rsiBuyThreshold as number) ?? 30,
        rsiSellThreshold: (input.config.rsiSellThreshold as number) ?? 70,
        volumeMultiplier: (input.config.volumeMultiplier as number) ?? 1.5,
        positionSizePct: (input.config.positionSizePct as number) ?? 10,
        cooldownMinutes: (input.config.cooldownMinutes as number) ?? 60,
      }) as BotConfig;

  const exchangeConfig: ExchangeConfig = {
    apiKey: '',
    apiSecret: '',
    testnet: true,
    sandbox: true,
    rateLimitMs: 100,
  };

  const req: CreateBotRequest = {
    id: input.id,
    config,
    exchangeConfig,
    mode: input.mode,
  };

  const bot = await manager.createBot(req);
  return botToInfo(bot);
}

export async function startBot(id: string): Promise<Result<void>> {
  try {
    const manager = getBotManager();
    await manager.startBot(id);
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Start failed');
  }
}

export function stopBot(id: string): Result<void> {
  try {
    const manager = getBotManager();
    manager.stopBot(id);
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Stop failed');
  }
}

export function pauseBot(id: string): Result<void> {
  try {
    const manager = getBotManager();
    manager.pauseBot(id);
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Pause failed');
  }
}

export function resumeBot(id: string): Result<void> {
  try {
    const manager = getBotManager();
    manager.resumeBot(id);
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Resume failed');
  }
}

export function removeBot(id: string): void {
  const manager = getBotManager();
  manager.removeBot(id);
}

// ── Killswitch Operations ──────────────────────────────────────

export function haltAll(reason: string): void {
  getBotManager().getKillswitch().manualHalt(reason);
}

export function resumeAll(): void {
  getBotManager().getKillswitch().manualResume();
}

export function isTradingEnabled(): boolean {
  return getBotManager().getKillswitch().isTradingEnabled();
}

// ── Lifecycle ──────────────────────────────────────────────────

export function resetAll(): void {
  resetBotManager();
}

// ── Helpers ────────────────────────────────────────────────────

function botToInfo(bot: BotInstance): BotInfo {
  const state: BotState = bot.getSnapshot();
  const cfg = bot.getConfig() as BotConfig;
  return {
    id: state.id,
    name: state.id,
    strategy: cfg.strategy,
    pair: cfg.symbol,
    exchange: cfg.exchange || 'paper',
    status: state.status,
    capital: cfg.capital,
    totalPnl: state.totalPnl,
    totalTrades: state.totalTrades,
    winCount: state.winCount,
    lossCount: state.lossCount,
    maxDrawdown: state.maxDrawdown,
    startedAt: state.startedAt,
    stoppedAt: state.stoppedAt,
    lastTickAt: state.lastTickAt,
    lastOrderAt: state.lastOrderAt,
    error: state.error,
  };
}
