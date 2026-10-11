import type { CircuitBreaker } from './circuit-breaker';
import type { ProviderHealth } from './types';
import { applyRecordSuccess } from './paper-provider-health';

export interface HealthRecorder {
  health: ProviderHealth;
  setHealth: (next: ProviderHealth) => void;
  recordFailure: () => void;
}

export async function runRecorded<T>(params: {
  breaker: CircuitBreaker;
  adapterCall: () => Promise<T>;
  recorder: HealthRecorder;
  now?: number;
}): Promise<T> {
  const start = params.now ?? Date.now();
  try {
    const result = await params.breaker.execute(params.adapterCall);
    params.recorder.setHealth(applyRecordSuccess(params.recorder.health, Date.now() - start));
    return result;
  } catch (err) {
    params.recorder.recordFailure();
    throw err;
  }
}
