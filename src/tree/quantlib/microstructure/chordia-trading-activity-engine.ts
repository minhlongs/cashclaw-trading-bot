export class ChordiaTradingActivityEngine {
  public static calculate(config: ChordiaActivityConfig): ChordiaActivityResult {
    const { activities, riskSensitivity = 0.5 } = config;
    if (!activities || activities.length === 0) throw new Error('At least one activity observation is required');
    const n = activities.length;
    const turnovers = activities.map((a) => {
      if (a.volume < 0 || a.sharesOutstanding <= 0) throw new Error('Invalid volume or shares');
      return a.volume / a.sharesOutstanding;
    });
    const mean = turnovers.reduce((s, x) => s + x, 0) / n;
    const variance = turnovers.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / (n > 1 ? n - 1 : 1);
    const vol = Math.sqrt(variance);
    const cv = mean > 0 ? vol / mean : 0;
    const riskAdj = -0.1 * mean + riskSensitivity * vol;
    return {
      meanTurnover: Number(mean.toFixed(6)),
      turnoverVolatility: Number(vol.toFixed(6)),
      coefficientOfVariation: Number(cv.toFixed(4)),
      liquidityRiskAdjustment: Number(riskAdj.toFixed(6)),
      sampleDays: n,
    };
  }
}

export interface DailyActivity {
  readonly volume: number;
  readonly sharesOutstanding: number;
  readonly price?: number;
}

export interface ChordiaActivityConfig {
  readonly activities: readonly DailyActivity[];
  readonly riskSensitivity?: number;
}

export interface ChordiaActivityResult {
  readonly meanTurnover: number;
  readonly turnoverVolatility: number;
  readonly coefficientOfVariation: number;
  readonly liquidityRiskAdjustment: number;
  readonly sampleDays: number;
}
