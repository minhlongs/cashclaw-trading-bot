import { NextResponse } from 'next/server';
import {
  type SignedCloudSyncBundle,
  type SyncStrategyConfig,
  verifyAndImportCloudSyncBundle,
} from '@/ee/sync/local-to-cloud-sync';
import { enforceWorkspaceQuota } from '@/ee/billing/quota-guard';
import {
  resolveActiveBotCount,
  resolveWorkspaceTierContext,
} from '@/ee/tenancy/workspace-request-context';
import { botCreateHandler, botListHandler, type CreateBotPayload } from '@/forest/api/routes';

const STRATEGY_MAP: Record<SyncStrategyConfig['strategyId'], CreateBotPayload['strategy']> = {
  grid: 'grid',
  meanReversion: 'mean_reversion',
  volatilityDca: 'volatility_dca',
};

const ALLOWED_EXCHANGES = new Set(['binance', 'bybit', 'okx']);

function resolveSyncExchange(raw: unknown): string {
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (ALLOWED_EXCHANGES.has(normalized)) return normalized;
  }
  return 'binance';
}

function resolveSyncCapital(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= 1_000_000
    ? raw
    : 1000;
}

function normalizeSyncPair(symbol: string): string {
  const trimmed = symbol.trim().toUpperCase();
  if (trimmed.includes('/')) return trimmed;
  for (const quote of ['USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH']) {
    if (trimmed.endsWith(quote) && trimmed.length > quote.length) {
      return `${trimmed.slice(0, -quote.length)}/${quote}`;
    }
  }
  return trimmed;
}

function buildSyncBotConfig(
  params: Record<string, number | string | boolean>,
): Record<string, number | boolean> {
  const config: Record<string, number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'number' || typeof v === 'boolean') config[k] = v;
  }
  return config;
}

export async function POST(req: Request) {
  try {
    const userId = req.headers.get('x-user-id')?.trim() || undefined;
    const { tier } = await resolveWorkspaceTierContext(req);
    const activeRunningBots = await resolveActiveBotCount(() =>
      userId ? botListHandler(userId) : botListHandler(),
    );

    const quotaCheck = enforceWorkspaceQuota({
      tier,
      activeRunningBots,
      requestedWalkForwardWindows: 1,
    });
    if (!quotaCheck.ok) {
      return NextResponse.json(
        { ok: false, error: quotaCheck.error },
        { status: 403 },
      );
    }

    const rawBundle = (await req.json()) as SignedCloudSyncBundle;
    const importResult = await verifyAndImportCloudSyncBundle(rawBundle);

    if (!importResult.ok) {
      return NextResponse.json(
        { ok: false, error: importResult.error },
        { status: 422 },
      );
    }

    const { botName, strategyId, symbol, parameters } = importResult.data;
    const botId = `sync_${crypto.randomUUID().slice(0, 8)}`;
    const payload: CreateBotPayload = {
      id: botId,
      name: botName,
      strategy: STRATEGY_MAP[strategyId],
      pair: normalizeSyncPair(symbol),
      exchange: resolveSyncExchange(parameters.exchange),
      capital: resolveSyncCapital(parameters.capital),
      config: buildSyncBotConfig(parameters),
      mode: 'paper',
    };

    const created = userId
      ? await botCreateHandler(payload, userId)
      : await botCreateHandler(payload);
    if (!created.ok) {
      return NextResponse.json(
        { ok: false, error: created.error ?? 'Failed to materialize synced bot' },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      imported: true,
      tier,
      botId: created.data?.id ?? botId,
      botName,
      strategyId,
      symbol,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Internal server error while importing bundle' },
      { status: 500 },
    );
  }
}
