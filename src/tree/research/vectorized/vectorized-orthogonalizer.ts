import type { VectorizedSeries } from './vectorized-factor-types';

export class VectorizedOrthogonalizer {
  orthogonalizeGramSchmidt(seriesList: readonly VectorizedSeries[]): VectorizedSeries[] {
    if (seriesList.length === 0) return [];

    const n = seriesList[0]!.data.length;
    const result: VectorizedSeries[] = [];

    for (let k = 0; k < seriesList.length; k++) {
      const current = seriesList[k]!;
      const proj = new Float64Array(current.data);

      for (let j = 0; j < result.length; j++) {
        const prev = result[j]!;
        const dotProduct = this.computeDot(current.data, prev.data, n);
        const normSq = this.computeDot(prev.data, prev.data, n);

        if (normSq > 1e-12) {
          const coeff = dotProduct / normSq;
          for (let i = 0; i < n; i++) {
            proj[i] -= coeff * prev.data[i]!;
          }
        }
      }

      const currentNorm = Math.sqrt(this.computeDot(proj, proj, n));
      if (currentNorm > 1e-12) {
        for (let i = 0; i < n; i++) {
          proj[i] /= currentNorm;
        }
      }

      result.push({
        name: `${current.name}_ORTHO`,
        data: proj,
      });
    }

    return result;
  }

  private computeDot(a: Float64Array, b: Float64Array, n: number): number {
    let sum = 0;
    const len = Math.min(n, a.length, b.length);
    for (let i = 0; i < len; i++) {
      const ai = a[i]!;
      const bi = b[i]!;
      if (Number.isFinite(ai) && Number.isFinite(bi)) {
        sum += ai * bi;
      }
    }
    return sum;
  }
}
