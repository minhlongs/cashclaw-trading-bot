// Bot Manager Cache Metrics — lightweight edge-native telemetry
export interface CacheMetricsSnapshot {
  hits: number;
  misses: number;
  evictions: number;
  rejections: number;
  hitRate: number;
}

export class BotManagerCacheMetrics {
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private rejections = 0;

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.misses++;
  }

  recordEviction(): void {
    this.evictions++;
  }

  recordRejection(): void {
    this.rejections++;
  }

  getSnapshot(): CacheMetricsSnapshot {
    const total = this.hits + this.misses;
    const hitRate = total === 0 ? 0 : Number((this.hits / total).toFixed(4));
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      rejections: this.rejections,
      hitRate,
    };
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.rejections = 0;
  }
}
