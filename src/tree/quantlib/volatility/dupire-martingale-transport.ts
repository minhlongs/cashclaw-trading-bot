export interface DupireMotParams {
  readonly logMoneynessGrid: readonly number[];
  readonly maturityYears: number;
  readonly sviA: number;
  readonly sviB: number;
  readonly sviRho: number;
  readonly sviM: number;
  readonly sviSigma: number;
}

export interface DupireStrikeNode {
  readonly logMoneyness: number;
  readonly totalVarianceW: number;
  readonly impliedVol: number;
  readonly butterflyDensityG: number;
  readonly dupireLocalVol: number;
  readonly subBoundBps: number;
  readonly midPriceBps: number;
  readonly superBoundBps: number;
  readonly isArbitrageFree: boolean;
}

export interface DupireMotSurfaceResult {
  readonly maturityYears: number;
  readonly isSurfaceArbitrageFree: boolean;
  readonly minButterflyG: number;
  readonly atmLocalVol: number;
  readonly meanMotCorridorBps: number;
  readonly nodes: readonly DupireStrikeNode[];
}

function evaluateStrikeNode(k: number, params: DupireMotParams): DupireStrikeNode {
  const T = Math.max(1e-4, params.maturityYears);
  const b = Math.max(1e-6, params.sviB);
  const rho = Math.max(-0.999, Math.min(0.999, params.sviRho));
  const sigma = Math.max(1e-4, params.sviSigma);
  const km = k - params.sviM;
  const dk = Math.sqrt(km * km + sigma * sigma);
  const w = Math.max(1e-6, params.sviA + b * (rho * km + dk));
  const w1 = b * (rho + km / dk);
  const w2 = (b * sigma * sigma) / (dk * dk * dk);

  const term1 = (1 - (k * w1) / (2 * w)) ** 2;
  const term2 = ((w1 * w1) / 4) * (1 / w + 0.25);
  const g = term1 - term2 + 0.5 * w2;
  const dTw = Math.max(1e-5, w / T);
  const localVol = Math.sqrt(dTw / Math.max(1e-4, g));
  const impliedVol = Math.sqrt(w / T);

  const midBps = Number((impliedVol * 1000).toFixed(2));
  const halfWidth = Number(((Math.abs(k) * 85 + sigma * 140) * Math.sqrt(T)).toFixed(2));
  const subBps = Number(Math.max(1, midBps - halfWidth).toFixed(2));
  const superBps = Number((midBps + halfWidth).toFixed(2));

  return {
    logMoneyness: Number(k.toFixed(4)),
    totalVarianceW: Number(w.toFixed(6)),
    impliedVol: Number(impliedVol.toFixed(6)),
    butterflyDensityG: Number(g.toFixed(6)),
    dupireLocalVol: Number(localVol.toFixed(6)),
    subBoundBps: subBps,
    midPriceBps: midBps,
    superBoundBps: superBps,
    isArbitrageFree: g > 0 && dTw > 0,
  };
}

export function computeDupireMartingaleSurface(params: DupireMotParams): DupireMotSurfaceResult {
  const nodes = params.logMoneynessGrid.map((k) => evaluateStrikeNode(k, params));
  const minG = nodes.reduce((acc, n) => Math.min(acc, n.butterflyDensityG), Number.POSITIVE_INFINITY);
  const atmNode = nodes.reduce((best, n) => (Math.abs(n.logMoneyness) < Math.abs(best.logMoneyness) ? n : best), nodes[0]!);
  const meanCorridor =
    nodes.reduce((acc, n) => acc + (n.superBoundBps - n.subBoundBps), 0) / Math.max(1, nodes.length);

  return {
    maturityYears: params.maturityYears,
    isSurfaceArbitrageFree: nodes.every((n) => n.isArbitrageFree),
    minButterflyG: Number((Number.isFinite(minG) ? minG : 0).toFixed(6)),
    atmLocalVol: atmNode?.dupireLocalVol ?? 0,
    meanMotCorridorBps: Number(meanCorridor.toFixed(2)),
    nodes,
  };
}
