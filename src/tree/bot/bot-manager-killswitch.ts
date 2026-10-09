import { Killswitch } from './killswitch';
import { createLogger } from '@/lib/logger';
import type { BotManagerDependencies } from './bot-manager-types';
import type { TradeEventType } from '../telemetry';

const log = createLogger('bot-manager');

export function createManagerKillswitch(
  deps: Required<Omit<BotManagerDependencies, 'telemetry' | 'userId' | 'getOrchestrator'>>,
  stopAll: () => void,
  emitTelemetry: (type: TradeEventType, details: Record<string, unknown>) => void,
): Killswitch {
  return new Killswitch(
    {
      onHalt: (reason) => {
        deps.onLog(`KILLSWITCH HALT: ${reason}`);
        emitTelemetry('halt', { reason });
        stopAll();
      },
      onResume: () => {
        deps.onLog('Killswitch resumed');
        emitTelemetry('resume', {});
      },
      onOrderPlaced: () => {},
      onOrderFilled: () => {},
      onError: (e, ctx) => deps.onError(e, ctx),
      onDailyStateChange: (daily) => {
        import('@/forest/settings/actions')
          .then(({ saveKillswitchDailyState }) => saveKillswitchDailyState(daily))
          .catch((error) =>
            log.error('Failed to persist killswitch daily state', error instanceof Error ? error : new Error(String(error)), { action: 'onDailyStateChange' }),
          );
      },
    },
    { maxDailyLossPct: 10, maxConsecutiveLosses: 5, maxDrawdownPct: 15, cooldownMinutes: 30 },
  );
}
