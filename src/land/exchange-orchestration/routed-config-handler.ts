import { ExchangeRouter, RoutingConfigSchema, type RoutingConfig } from '@/tree/exchange/provider';
import { ok, err, type Result } from '@/lib/result';

export function setupRouting(cfg: unknown): Result<{ router: ExchangeRouter; config: RoutingConfig }> {
  const parsed = RoutingConfigSchema.safeParse(cfg);
  if (!parsed.success) return err(`Invalid routing config: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  return ok({ router: new ExchangeRouter(parsed.data), config: parsed.data });
}
