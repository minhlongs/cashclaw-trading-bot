// RegimeHistoryStore — pure in-memory rolling window of RegimeResult
// No I/O. Persistence to D1 can be wired later via telemetry.

import type { RegimeLabel, RegimeResult } from './types';

export class RegimeHistoryStore {
  private readonly window: RegimeResult[] = [];
  private readonly maxLen: number;

  constructor(maxLength = 200) {
    this.maxLen = maxLength;
  }

  add(result: RegimeResult): void {
    this.window.push(result);
    if (this.window.length > this.maxLen) {
      this.window.shift();
    }
  }

  getHistory(): readonly RegimeResult[] {
    return this.window;
  }

  getCurrent(): RegimeResult | null {
    return this.window.length > 0 ? this.window[this.window.length - 1] : null;
  }

  getByRegime(label: RegimeLabel): RegimeResult[] {
    return this.window.filter((r) => r.label === label);
  }

  /** Number of regime transitions in the recorded history. */
  transitionCount(): number {
    if (this.window.length < 2) return 0;
    let count = 0;
    for (let i = 1; i < this.window.length; i++) {
      if (this.window[i].label !== this.window[i - 1].label) count++;
    }
    return count;
  }

  /** Average duration (ms) spent in each regime across the full history. */
  averageDuration(): number {
    if (this.window.length < 2) return 0;
    let totalMs = 0;
    for (let i = 1; i < this.window.length; i++) {
      totalMs += this.window[i].timestamp - this.window[i - 1].timestamp;
    }
    return totalMs / (this.window.length - 1);
  }

  get length(): number {
    return this.window.length;
  }
}
