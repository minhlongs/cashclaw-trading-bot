export interface KyleObizhaevaSpreadParams {
  readonly dollarVolume: number; // Daily dollar trading volume V
  readonly volatility: number; // Return volatility sigma
  readonly price: number; // Asset price P
  readonly invariantSpreadCoeff?: number; // L_S pre-factor (default ~ 0.25)
  readonly invariantSizeCoeff?: number; // L_Q pre-factor (default ~ 0.05)
}

export interface KyleObizhaevaSpreadResult {
  readonly invariantSpread: number;
  readonly invariantSpreadBps: number;
  readonly invariantTradeSize: number;
  readonly invariantTradeCount: number;
  readonly dimensionalGamma: number;
}
