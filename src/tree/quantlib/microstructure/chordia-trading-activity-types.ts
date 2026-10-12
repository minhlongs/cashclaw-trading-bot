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
