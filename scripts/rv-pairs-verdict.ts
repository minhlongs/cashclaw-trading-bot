// Real-data pairs walk-forward verdict — MANUAL ONLY.
// NEVER imported by vitest (network-flake escrow). Run:
//   npx tsx scripts/rv-pairs-verdict.ts
// Paper/backtest only; no orders. Deterministic seeds. No fabricated
// numbers: thin data overlap or missing symbols exits non-zero (BLOCKED).
//
// Protocol: arms M1–M4 run through the walk-forward driver + survival gate;
// the full multiple-testing battery applies to the PRE-REGISTERED PRIMARY
// arm M4 only — verdicts come from M4, never cherry-picked across arms.

import { fetchResearchData } from '@/forest/alpha/data-fetcher';
import type {
  UniversePanel,
} from '@/tree/alpha/relative-value';
import type { Candle } from '@/forest/backtest/ohlcv';
import type { RVWalkForwardResult } from '@/forest/alpha/relative-value-eval';
import {
  ADAPTER,
  buildArms,
  LIMIT,
  MIN_BARS,
  TIMEFRAME,
  UNIVERSE,
  WINDOW_CONFIG,
} from './rv-pairs-verdict-protocol';
import {
  evaluatePrimaryM4,
  runArm,
  summarizeArm,
} from './rv-pairs-verdict-evaluate';
import { writeArtifact } from './rv-pairs-verdict-artifacts';

/** Fetch every universe symbol; fail closed on missing/thin series. */
async function loadUniverse(): Promise<UniversePanel> {
  const fetched = await fetchResearchData(
    UNIVERSE.map((symbol) => ({
      source: 'binance' as const, symbol, timeframe: TIMEFRAME, limit: LIMIT,
    })),
  );
  const bySymbol = new Map<string, Candle[]>();
  for (const symbol of UNIVERSE) {
    const candles = fetched.get(`binance:${symbol}:${TIMEFRAME}`);
    if (!candles || candles.length < MIN_BARS) {
      throw new Error(
        `BLOCKED: ${symbol} missing/thin (${candles?.length ?? 0} bars < ${MIN_BARS})`,
      );
    }
    bySymbol.set(symbol, candles);
  }
  let stamps = bySymbol.get(UNIVERSE[0])!.map((c) => c.timestamp);
  for (const symbol of UNIVERSE.slice(1)) {
    const keep = new Set(bySymbol.get(symbol)!.map((c) => c.timestamp));
    stamps = stamps.filter((t) => keep.has(t));
  }
  if (stamps.length < MIN_BARS) {
    throw new Error(
      `BLOCKED: timestamp intersection too thin (${stamps.length} bars < ${MIN_BARS})`,
    );
  }
  return {
    symbols: [...UNIVERSE],
    timestamps: stamps,
    closes: [...UNIVERSE].map((symbol) => {
      const closeOf = new Map(
        bySymbol.get(symbol)!.map((c) => [c.timestamp, c.close]),
      );
      return stamps.map((t) => closeOf.get(t)!);
    }),
  };
}

async function main(): Promise<void> {
  console.log('fetching research data…');
  const universe = await loadUniverse();
  const arms = buildArms(universe.closes[0]!, universe.timestamps);

  const results = new Map<string, RVWalkForwardResult>();
  const outcomes = [];
  for (const def of arms) {
    const result = runArm(def, universe);
    results.set(def.id, result);
    outcomes.push(summarizeArm(def.id, result));
    console.log(
      `${def.id}: expectancy=${outcomes[outcomes.length - 1]!.expectancy.toFixed(6)} ` +
      `trades=${outcomes[outcomes.length - 1]!.completedTrades}/` +
      `${outcomes[outcomes.length - 1]!.periods} periods ` +
      `gate=${outcomes[outcomes.length - 1]!.gateStatus}`,
    );
  }

  const m4 = results.get('M4')!;
  const primary = evaluatePrimaryM4(m4, arms[3]!, universe);
  for (const reason of primary.survival.reasons) {
    console.log(`failed check: ${reason}`);
  }
  console.log(`M4 gate: ${primary.gate.status} — ${primary.gate.reason}`);

  const verdict =
    primary.survival.verdict === 'survived' &&
    primary.gate.status === 'PAPER_CANDIDATE'
      ? 'SURVIVED'
      : 'KILLED';
  writeArtifact('rv-pairs-verdict.json', {
    generatedAt: new Date().toISOString(),
    protocol: {
      universe: [...UNIVERSE],
      timeframe: TIMEFRAME,
      limit: LIMIT,
      windowConfig: WINDOW_CONFIG,
      primaryArm: 'M4',
      adapterOptions: ADAPTER,
    },
    arms: outcomes,
    primarySurvivalVerdict: primary.survival.verdict,
    failedChecks: primary.survival.reasons,
    gateStatus: primary.gate.status,
    gateReason: primary.gate.reason,
    finalVerdict: verdict,
  });
  console.log(`FINAL VERDICT: ${verdict}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
