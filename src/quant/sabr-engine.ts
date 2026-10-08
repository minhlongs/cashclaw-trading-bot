export interface SabrParams {
  alpha: number; // initial volatility
  beta: number; // elasticity, CEV parameter [0, 1]
  rho: number; // correlation [-1, 1]
  nu: number; // vol of vol
}

export function computeSabrVol(
  f: number, // forward price
  k: number, // strike price
  t: number, // time to maturity
  params: SabrParams
): number {
  const { alpha, beta, rho, nu } = params;

  if (f <= 0 || k <= 0) {
    throw new Error('Forward and strike prices must be positive');
  }
  if (t <= 0) {
    throw new Error('Time to maturity must be positive');
  }
  if (beta < 0 || beta > 1) {
    throw new Error('Beta must be between 0 and 1');
  }
  if (rho < -1 || rho > 1) {
    throw new Error('Rho must be between -1 and 1');
  }
  if (nu <= 0) {
    throw new Error('Nu (vol of vol) must be strictly positive');
  }
  if (alpha <= 0) {
    throw new Error('Alpha must be strictly positive');
  }

  // ATM formula for very small differences between f and k
  if (Math.abs(f - k) < 1e-6) {
    const term1 = (Math.pow(1 - beta, 2) / 24) * (alpha * alpha / Math.pow(f, 2 - 2 * beta));
    const term2 = (rho * beta * nu * alpha) / (4 * Math.pow(f, 1 - beta));
    const term3 = ((2 - 3 * rho * rho) / 24) * nu * nu;
    const atmVol = (alpha / Math.pow(f, 1 - beta)) * (1 + (term1 + term2 + term3) * t);
    return Math.max(0, atmVol); // ensuring non-negative volatility
  }

  // General formula for f != k
  const fK = f * k;
  const lnFK = Math.log(f / k);
  const oneMinusBeta = 1 - beta;
  
  const fKPow = Math.pow(fK, oneMinusBeta / 2.0);
  
  const z = (nu / alpha) * fKPow * lnFK;
  
  // Numerical safeguard for high/low strikes
  const radicand = 1.0 - 2.0 * rho * z + z * z;
  const x = Math.log((Math.sqrt(Math.max(radicand, 0.0)) + z - rho) / (1 - rho));

  let zOverX = 1.0;
  if (Math.abs(z) > 1e-9) {
    zOverX = z / x;
  }

  const denominatorTerm1 = 1 + Math.pow(oneMinusBeta, 2) / 24.0 * Math.pow(lnFK, 2) 
                         + Math.pow(oneMinusBeta, 4) / 1920.0 * Math.pow(lnFK, 4);

  const termA = (Math.pow(oneMinusBeta, 2) / 24.0) * (alpha * alpha / Math.pow(fK, oneMinusBeta));
  const termB = (rho * beta * nu * alpha) / (4.0 * fKPow);
  const termC = ((2.0 - 3.0 * rho * rho) / 24.0) * nu * nu;

  const sabrVol = (alpha / (fKPow * denominatorTerm1)) * zOverX * (1 + (termA + termB + termC) * t);

  return Math.max(0, sabrVol); // ensuring non-negative volatility
}
