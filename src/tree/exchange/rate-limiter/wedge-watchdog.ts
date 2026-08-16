// Detect "wedged" queues where tokens stop being acquired/refilled.
// Triggers a callback when the queue appears stuck.

export class WedgeWatchdog {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastAcquireAt = Date.now();
  private consecutiveStuckChecks = 0;

  constructor(
    private readonly checkIntervalMs: number = 30_000,
    private readonly refillCycleMs: number = 15_000,
  ) {}

  /**
   * Start the periodic check. Fires `onWedgeDetected` when the queue
   * has not seen any acquire for >= 2x the refill cycle.
   */
  start(onWedgeDetected: () => void): void {
    if (this.timer !== null) return;

    this.timer = setInterval(() => {
      const elapsed = Date.now() - this.lastAcquireAt;
      if (elapsed > 2 * this.refillCycleMs) {
        this.consecutiveStuckChecks += 1;
        if (this.consecutiveStuckChecks >= 2) {
          onWedgeDetected();
        }
      } else {
        this.consecutiveStuckChecks = 0;
      }
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.consecutiveStuckChecks = 0;
  }

  /**
   * Call after a successful acquire to reset the stuck counter.
   */
  poke(): void {
    this.lastAcquireAt = Date.now();
    this.consecutiveStuckChecks = 0;
  }
}
