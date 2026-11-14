// Gate G13: Deterministic H3_MAKER PaperForwardRunner (PAPER_ONLY, Fail-Closed).

import { PaperOrderLifecycleEngine } from '../execution/lifecycle';
import { MicroDoubleEntryLedger } from '../ledger';
import {
  CapitalProtectionEngine,
  DeterministicPrng,
  canonicalJson,
  sha256HexSync,
} from '../protection';
import { buildProtectionContext } from './paper-forward-leg-order';
import {
  fromMicroUsd,
  settlePerpFundingIntervals,
  toMicroUsd,
  valuePortfolioAtMarks,
} from './paper-forward-math';
import { executeH3MakerSymbolStep } from './paper-forward-pair-executor';
import { assertValidSignedStrategySpec } from './spec-guard';
import {
  PaperForwardGuardError,
  type PaperForwardCheckpoint,
  type PaperForwardDayInput,
  type SignedStrategySpec,
} from './spec-types';

export interface PaperForwardRunnerOptions {
  readonly spec: unknown;
  readonly registry?: unknown;
  readonly rawSpecJson?: string;
  readonly rawRegistryJson?: string;
  readonly botId?: string;
  readonly initialCapitalUsd?: number;
  readonly genesisTimestampMs?: number;
  readonly seed?: number;
}

export class PaperForwardRunner {
  private readonly spec: SignedStrategySpec;
  private readonly botId: string;
  private readonly universeSet: ReadonlySet<string>;
  private readonly ledger: MicroDoubleEntryLedger;
  private readonly lifecycle: PaperOrderLifecycleEngine;
  private readonly protection: CapitalProtectionEngine;
  private readonly prng: DeterministicPrng;
  private readonly latestMarks = new Map<string, { spotMidUsd: number; perpMidUsd: number }>();
  private readonly checkpoints: PaperForwardCheckpoint[] = [];
  private peakNavUsd: number;
  private prevNavUsd: number;
  private cumulativeExecutedOrders = 0;
  private ledgerBreachCount = 0;
  private protectionViolationCount = 0;
  private lastCheckpointSha = '0'.repeat(64);

  public constructor(options: PaperForwardRunnerOptions) {
    this.spec = assertValidSignedStrategySpec(options.spec, {
      registry: options.registry,
      rawSpecJson: options.rawSpecJson,
      rawRegistryJson: options.rawRegistryJson,
    });
    const initialCapitalUsd = options.initialCapitalUsd ?? 100_000;
    if (!Number.isFinite(initialCapitalUsd) || initialCapitalUsd <= 0) {
      throw new PaperForwardGuardError('INVALID_SPEC_SCHEMA', 'initialCapitalUsd must be finite and > 0');
    }
    const genesisTs = options.genesisTimestampMs ?? 1_794_614_400_000;
    this.botId = options.botId ?? `g13-${this.spec.strategyId.toLowerCase()}`;
    this.universeSet = new Set(this.spec.universe);
    this.ledger = new MicroDoubleEntryLedger(this.botId);
    this.ledger.depositCapital(`genesis_${this.botId}`, toMicroUsd(initialCapitalUsd), genesisTs);
    this.lifecycle = new PaperOrderLifecycleEngine({ botId: this.botId, ledger: this.ledger });
    this.protection = new CapitalProtectionEngine({
      maxGrossLeverage: this.spec.parameters.maxGrossLeverage,
      softDrawdownPct: this.spec.riskGates.maxDrawdownSoftPct / 100,
      hardDrawdownPct: this.spec.riskGates.maxDrawdownHardPct / 100,
      maxRolling24hLossPct: this.spec.riskGates.maxDailyLossPct / 100,
      maxMarketDataAgeMs: this.spec.riskGates.staleDataCutoffMs,
      maxSingleOrderNotionalPct: 0.25,
      maxSingleAssetWeightPct: 0.25,
      marketNeutralMode: true,
    });
    this.prng = new DeterministicPrng(options.seed ?? 63_013);
    this.peakNavUsd = initialCapitalUsd;
    this.prevNavUsd = initialCapitalUsd;
  }

  public getSpec(): SignedStrategySpec { return this.spec; }
  public getLedger(): MicroDoubleEntryLedger { return this.ledger; }
  public getLifecycleEngine(): PaperOrderLifecycleEngine { return this.lifecycle; }
  public getProtectionEngine(): CapitalProtectionEngine { return this.protection; }
  public getCheckpoints(): readonly PaperForwardCheckpoint[] { return [...this.checkpoints]; }

  public getWeeklyCheckpoints(): readonly PaperForwardCheckpoint[] {
    return this.checkpoints.filter(
      (cp, idx) => cp.dayIndex === 0 || cp.dayIndex % 7 === 0 || idx === this.checkpoints.length - 1,
    );
  }

  public getViolationSummary(): { ledgerBreachCount: number; protectionViolationCount: number } {
    return {
      ledgerBreachCount: this.ledgerBreachCount,
      protectionViolationCount: this.protectionViolationCount,
    };
  }

  public recordGenesisCheckpoint(timestampMs = 1_794_614_400_000): PaperForwardCheckpoint {
    return this.appendCheckpoint(0, timestampMs);
  }

  public stepDay(input: PaperForwardDayInput): PaperForwardCheckpoint {
    const prevCp = this.checkpoints[this.checkpoints.length - 1];
    if (prevCp && (input.dayIndex <= prevCp.dayIndex || input.timestampMs <= prevCp.timestampMs)) {
      throw new Error(`Non-monotonic PaperForwardDayInput at dayIndex=${input.dayIndex}`);
    }
    const validObs = input.observations.filter((o) => this.universeSet.has(o.symbol));
    for (const obs of validObs) {
      this.latestMarks.set(obs.symbol, { spotMidUsd: obs.spotMidUsd, perpMidUsd: obs.perpMidUsd });
      settlePerpFundingIntervals(this.ledger, input.dayIndex, input.timestampMs, obs);
    }

    if (validObs.length > 0) {
      const refreshTickCtx = () => {
        const liveVal = valuePortfolioAtMarks(this.ledger, this.spec.universe, this.latestMarks);
        return buildProtectionContext({
          nowMs: input.timestampMs, valuation: liveVal,
          peakNavUsd: this.peakNavUsd, prevNavUsd: this.prevNavUsd,
          ledger: this.ledger, observations: validObs,
        });
      };
      const tickCtx = refreshTickCtx();
      if (tickCtx.ledger && !this.protection.reconcileLedger(tickCtx.ledger)) {
        this.ledgerBreachCount += 1;
      }
      const tickDec = this.protection.evaluateTick(tickCtx);
      if (!tickDec.allowed) this.protectionViolationCount += 1;

      for (const obs of validObs) {
        const symCtx = refreshTickCtx();
        const res = executeH3MakerSymbolStep({
          botId: this.botId, dayIndex: input.dayIndex, nowMs: input.timestampMs,
          navUsd: symCtx.equityUsd, allowNewEntries: tickDec.allowed,
          forceUnwind: tickDec.unwindStage !== 'NONE',
          spec: this.spec, obs, ledger: this.ledger,
          lifecycle: this.lifecycle, protection: this.protection,
          prng: this.prng, tickCtx: symCtx, refreshTickCtx,
        });
        this.cumulativeExecutedOrders += res.executedOrders;
        this.protectionViolationCount += res.protectionViolations;
      }
    }

    return this.appendCheckpoint(input.dayIndex, input.timestampMs);
  }

  public runDays(days: readonly PaperForwardDayInput[]): readonly PaperForwardCheckpoint[] {
    for (const day of days) this.stepDay(day);
    return this.getCheckpoints();
  }

  private appendCheckpoint(dayIndex: number, timestampMs: number): PaperForwardCheckpoint {
    const val = valuePortfolioAtMarks(this.ledger, this.spec.universe, this.latestMarks);
    const sheet = this.ledger.getBalanceSheet();
    const balances = this.ledger.getAccountBalances();
    if (!sheet.balanced) this.ledgerBreachCount += 1;
    this.peakNavUsd = Math.max(this.peakNavUsd, val.navUsd);
    this.prevNavUsd = val.navUsd;

    const core = {
      prevSha256: this.lastCheckpointSha,
      dayIndex,
      timestampMs,
      paperNav: val.navUsd,
      grossExposure: val.grossExposureUsd,
      executedOrderCount: this.cumulativeExecutedOrders,
      ledgerBalanced: sheet.balanced,
      cumulativeFundingUsd: Number(fromMicroUsd(balances.FUNDING_NET).toFixed(6)),
      cumulativeFeesUsd: Number(fromMicroUsd(balances.FEES_EXPENSE).toFixed(6)),
    };
    const checkpointSha256 = sha256HexSync(canonicalJson(core));
    this.lastCheckpointSha = checkpointSha256;
    const cp: PaperForwardCheckpoint = Object.freeze({
      dayIndex: core.dayIndex,
      timestampMs: core.timestampMs,
      paperNav: core.paperNav,
      grossExposure: core.grossExposure,
      executedOrderCount: core.executedOrderCount,
      ledgerBalanced: core.ledgerBalanced,
      cumulativeFundingUsd: core.cumulativeFundingUsd,
      cumulativeFeesUsd: core.cumulativeFeesUsd,
      checkpointSha256,
    });
    this.checkpoints.push(cp);
    return cp;
  }
}
