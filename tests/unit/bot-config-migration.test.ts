import { describe, it, expect } from 'vitest';
import { botCreateHandler, type CreateBotPayload } from '@/forest/api/handlers/bot-create';
import { z } from 'zod';

const createSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  strategy: z.enum(['grid', 'mean_reversion']),
  pair: z.string().min(1).max(20),
  exchange: z.enum(['binance', 'bybit', 'okx']),
  capital: z.number().positive().max(1_000_000),
  mode: z.enum(['paper', 'live']).optional().default('paper'),
  config: z.object({
    spacingPct: z.number().positive().max(100).optional(),
    gridLevels: z.number().int().min(2).max(500).optional(),
    capitalPerLevelPct: z.number().positive().max(100).optional(),
    takeProfitPct: z.number().positive().max(100).optional(),
    stopLossPct: z.number().positive().max(100).optional(),
    maxDrawdownPct: z.number().positive().max(100).optional(),
  }).optional(),
});

function createPayload(overrides: Partial<CreateBotPayload> = {}): CreateBotPayload {
  const base = {
    id: 'wizard-bot-100',
    name: 'Wizard Bot',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    capital: 1000,
    mode: 'paper',
    config: {
      spacingPct: 0.5,
      gridLevels: 5,
      capitalPerLevelPct: 20,
      takeProfitPct: 1.5,
      stopLossPct: 3,
      maxDrawdownPct: 7,
    },
  } satisfies CreateBotPayload;
  return { ...base, ...overrides } as CreateBotPayload;
}

describe('botCreateHandler wizard config plumbing', () => {
  it('wizard config is preserved in create request', async () => {
    const payload = createPayload();
    const parsed = createSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = await botCreateHandler(parsed.data);
    expect(result.ok).toBe(true);
    expect(result.data?.id).toBe('wizard-bot-100');
  });
});