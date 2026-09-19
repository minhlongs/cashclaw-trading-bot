import type { Killswitch } from '@/tree/bot/killswitch';
import type { DirectTickerProvider } from '@/tree/exchange/direct';

export interface ExchangeOrchestratorDeps {
  killswitch?: Killswitch;
  onError?: (err: Error, ctx: string) => void;
  directTickerProviders?: Map<string, DirectTickerProvider> | Record<string, DirectTickerProvider>;
}
