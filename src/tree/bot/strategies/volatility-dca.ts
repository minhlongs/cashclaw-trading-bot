import type { VolatilityDcaBotConfig } from '../types';
import type { Ticker } from '../../exchange/types';
import { type VolatilityDcaCallbacks } from './volatility-dca-math';
import { createInitialVolatilityDcaState, type VolatilityDcaState } from './volatility-dca-state';
import { handleVolatilityDcaTicker } from './volatility-dca-handler';

export { type VolatilityDcaCallbacks } from './volatility-dca-math';

export class VolatilityDcaStrategy {
  private state: VolatilityDcaState;

  constructor(config: VolatilityDcaBotConfig, callbacks: VolatilityDcaCallbacks) {
    this.state = createInitialVolatilityDcaState(config, callbacks);
  }

  start(initialPrice: number): void {
    const s = this.state;
    s.running = true; s.referencePrice = initialPrice; s.stepIndex = 0; s.positionQty = 0;
    s.positionCost = 0; s.priceWindow = [initialPrice];
    s.callbacks.onLog(`VolatilityDCA started: ref=${initialPrice}, window=${s.config.volatilityWindow}`);
  }

  stop(): void {
    this.state.running = false;
    this.state.callbacks.onLog('VolatilityDCA stopped');
  }

  onTicker(ticker: Ticker): void {
    handleVolatilityDcaTicker(this.state, ticker);
  }

  getConfig(): VolatilityDcaBotConfig { return { ...this.state.config }; }
  getStepIndex(): number { return this.state.stepIndex; }
  getReferencePrice(): number { return this.state.referencePrice; }
  getPositionQty(): number { return this.state.positionQty; }
  getPositionCost(): number { return this.state.positionCost; }
}
