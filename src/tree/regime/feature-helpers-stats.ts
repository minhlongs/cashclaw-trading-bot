export function logReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  return returns;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function zScore(value: number, reference: number[]): number {
  if (reference.length < 2) return 0;
  const m = mean(reference), s = stdDev(reference);
  return s === 0 ? 0 : (value - m) / s;
}
