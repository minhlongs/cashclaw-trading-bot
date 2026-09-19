import { ECE_BINS, type CalibrationOutcome } from './calibration-types';

/** Whether the predicted direction matched the realized move. */
export function isDirectionCorrect(o: CalibrationOutcome): boolean {
  if (o.predictedDirection === 'long') return o.realizedReturn > 0;
  if (o.predictedDirection === 'short') return o.realizedReturn < 0;
  return o.realizedReturn === 0;
}

/** Brier score: mean squared error between confidence and correctness. */
export function computeBrierScore(outcomes: readonly CalibrationOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const sum = outcomes.reduce(
    (acc, o) => acc + (o.predictedConfidence - (isDirectionCorrect(o) ? 1 : 0)) ** 2,
    0,
  );
  return sum / outcomes.length;
}

/** Expected calibration error (ECE) over equal-width confidence bins. */
export function computeCalibrationError(outcomes: readonly CalibrationOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const bins: { confSum: number; correct: number; count: number }[] = Array.from(
    { length: ECE_BINS },
    () => ({ confSum: 0, correct: 0, count: 0 }),
  );
  for (const o of outcomes) {
    const idx = Math.min(ECE_BINS - 1, Math.floor(o.predictedConfidence * ECE_BINS));
    bins[idx].confSum += o.predictedConfidence;
    bins[idx].correct += isDirectionCorrect(o) ? 1 : 0;
    bins[idx].count += 1;
  }
  let ece = 0;
  for (const bin of bins) {
    if (bin.count === 0) continue;
    const avgConf = bin.confSum / bin.count;
    const accuracy = bin.correct / bin.count;
    ece += (bin.count / outcomes.length) * Math.abs(avgConf - accuracy);
  }
  return ece;
}
