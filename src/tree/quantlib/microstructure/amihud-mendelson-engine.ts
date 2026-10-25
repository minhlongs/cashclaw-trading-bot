export function computeAmihudMendelsonSpread(p: AmihudMendelsonParams): AmihudMendelsonResult {
  const r0 = Math.max(0, p.baseYield), s = Math.max(1e-5, p.spreadPct), mu = Math.max(0.1, p.amortizationFactor ?? 1);
  const horizons = p.investorHorizons.length > 0 ? p.investorHorizons : [1];
  const clienteles: AmihudMendelsonClientele[] = [];
  let minReq = Infinity, optH = horizons[0]!;
  for (const h of horizons) {
    const safeH = Math.max(0.01, h);
    const amortized = s / (mu * safeH);
    const req = r0 + amortized;
    if (req < minReq) { minReq = req; optH = safeH; }
    clienteles.push({ horizon: safeH, requiredReturn: req, amortizedSpreadBps: amortized * 10_000 });
  }
  const eqReturn = r0 + 0.5 * s + 0.1 * Math.log(1 + s * 100);
  const premiumBps = Math.max(0, eqReturn - r0) * 10_000;
  const elasticity = 0.5 + 10 / (1 + s * 100);
  return {
    clienteleReturns: clienteles,
    equilibriumReturn: eqReturn,
    liquidityPremiumBps: premiumBps,
    optimalHoldingHorizon: optH,
    marginalSpreadElasticity: elasticity,
  };
}

export interface AmihudMendelsonClientele {
  readonly horizon: number;
  readonly requiredReturn: number;
  readonly amortizedSpreadBps: number;
}

export interface AmihudMendelsonParams {
  readonly baseYield: number;
  readonly spreadPct: number;
  readonly investorHorizons: readonly number[];
  readonly amortizationFactor?: number;
}

export interface AmihudMendelsonResult {
  readonly clienteleReturns: readonly AmihudMendelsonClientele[];
  readonly equilibriumReturn: number;
  readonly liquidityPremiumBps: number;
  readonly optimalHoldingHorizon: number;
  readonly marginalSpreadElasticity: number;
}
