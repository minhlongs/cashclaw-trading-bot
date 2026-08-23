// Multiple-Testing Defense — Seeded PRNG
// One shared deterministic PRNG for every randomized statistic in this
// module. mulberry32 (upgraded from the baselines LCG for better
// uniformity). Same seed always yields bit-identical sequences.

/**
 * mulberry32 — small, fast, deterministic 32-bit PRNG.
 * Returns a function producing floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates shuffle, in place, driven by the supplied RNG.
 * Returns the same array reference for chaining convenience.
 */
export function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
