/**
 * Pure deterministic tail-stress mathematical kernels:
 * seeded PRNG, canonical JSON serializer, pure RFC-6234 SHA-256 hex digest,
 * Expected Shortfall (99% CVaR), honest post-gap stop fill, funding debit accumulator,
 * and pairwise correlation convergence exposure scalar.
 */

export class DeterministicPrng {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public nextUnit(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextSignedShock(scale: number): number {
    return (this.nextUnit() * 2 - 1) * scale;
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function compressChunk(h: number[], chunkWords: readonly number[]): void {
  const w = new Array<number>(64);
  for (let i = 0; i < 16; i += 1) w[i] = chunkWords[i] ?? 0;
  for (let i = 16; i < 64; i += 1) {
    const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
    const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }

  let [a, b, c, d, e, f, g, hh] = h;
  for (let i = 0; i < 64; i += 1) {
    const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const temp1 = (hh + s1 + ch + SHA256_K[i] + w[i]) | 0;
    const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (s0 + maj) | 0;
    hh = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
}

export function sha256HexSync(input: string): string {
  const bytes = Array.from(new TextEncoder().encode(input));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
  bytes.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words: number[] = [];
    for (let j = 0; j < 64; j += 4) {
      words.push(((bytes[offset + j] << 24) | (bytes[offset + j + 1] << 16) | (bytes[offset + j + 2] << 8) | bytes[offset + j + 3]) | 0);
    }
    compressChunk(h, words);
  }
  return h.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

export function computeStressedCvar99Pct(lossSamplesPct: readonly number[]): number {
  if (lossSamplesPct.length === 0) return 0;
  const sorted = [...lossSamplesPct].sort((a, b) => a - b);
  const varIdx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * 0.99) - 1));
  const tail = sorted.slice(varIdx);
  const mean = tail.reduce((acc, x) => acc + x, 0) / tail.length;
  return Number(mean.toFixed(4));
}

export function simulateHonestGapStopFill(params: {
  preGapPrice: number;
  stopPrice: number;
  gapShockPct: number;
  stressedSlippageBps: number;
  positionNotionalUsd: number;
  equityUsd: number;
}): { postGapOpen: number; honestFillPrice: number; portfolioLossPct: number; counterfactual3xLossPct: number } {
  const postGapOpen = params.preGapPrice * (1 + params.gapShockPct);
  const honestFillPrice = Math.min(params.stopPrice, postGapOpen) * (1 - params.stressedSlippageBps / 10_000);
  const assetReturnPct = (honestFillPrice - params.preGapPrice) / params.preGapPrice;
  const portfolioLossPct = Math.abs((params.positionNotionalUsd / params.equityUsd) * assetReturnPct) * 100;
  const counterfactual3xLossPct = Math.abs(3.0 * assetReturnPct) * 100;
  return {
    postGapOpen: Number(postGapOpen.toFixed(2)),
    honestFillPrice: Number(honestFillPrice.toFixed(2)),
    portfolioLossPct: Number(portfolioLossPct.toFixed(4)),
    counterfactual3xLossPct: Number(counterfactual3xLossPct.toFixed(4)),
  };
}

export function computeCorrelationConvergenceScale(
  assetCount: number,
  normalCorr: number,
  stressedCorr: number,
  unscaledCvar99Pct: number,
  hardCvarCapPct = 12.0,
): { covarianceRatio: number; exposureScaleFactor: number; scaledCvar99Pct: number } {
  const n = Math.max(2, assetCount);
  const normalVarFactor = (1 + (n - 1) * normalCorr) / n;
  const stressedVarFactor = (1 + (n - 1) * stressedCorr) / n;
  const covVolRatio = Math.sqrt(stressedVarFactor / Math.max(0.01, normalVarFactor));
  const cvarCapScale = unscaledCvar99Pct > hardCvarCapPct ? hardCvarCapPct / (unscaledCvar99Pct * 1.15) : 1.0;
  const scale = Math.min(1 / covVolRatio, cvarCapScale);
  return {
    covarianceRatio: Number(covVolRatio.toFixed(4)),
    exposureScaleFactor: Number(scale.toFixed(4)),
    scaledCvar99Pct: Number((unscaledCvar99Pct * scale).toFixed(4)),
  };
}
