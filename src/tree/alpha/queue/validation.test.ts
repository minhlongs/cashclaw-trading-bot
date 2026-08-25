// Research Queue Validation — Unit Tests
// Covers: validateJobSpec fail-closed (missing fields → ok:false reasons[]), re-test of seeded falsified class → rejected

import { describe, expect, it } from 'vitest';
import { validateJobSpec } from './validation';
import type { QueueJobSpec } from './types';
import type {
  ResearchCosts,
  ResearchEntry,
  ResearchSlippage,
} from '@/tree/alpha/registry/types';
import { RegimeLabel } from '@/tree/regime/types';
import type { Universe } from '@/tree/alpha/universe/types';

// ── Helpers ──────────────────────────────────────────────
function makeSpec(overrides: Partial<QueueJobSpec> = {}): QueueJobSpec {
  const universe: Universe = {
    id: 'test-universe',
    symbols: ['BTCUSDT', 'ETHUSDT'],
    weighting: 'equal',
    rebalanceRule: 'none',
  };
  const costs: ResearchCosts = { feeBps: 10, impactBps: 5 };
  const slippage: ResearchSlippage = { slippageBps: 3 };
  return {
    id: 'queue-0001-funding-fade',
    hypothesis: 'Funding rate mean reversion on 8h windows',
    rationale: 'Negative funding predicts positive returns next period',
    features: ['funding_rate', 'open_interest'],
    dataset: 'binance-ohlcv-funding',
    regime: RegimeLabel.RANGE,
    universe,
    costs,
    slippage,
    seed: 42,
    parentHypothesis: null,
    generatedBy: 'test-generator',
    timestamp: 1_700_000_000_000,
    gitSha: 'abc123',
    ...overrides,
  };
}

function makeRegistryEntry(overrides: Partial<ResearchEntry> = {}): ResearchEntry {
  return {
    id: 'funding-fade-class',
    hypothesis: 'Funding rate mean reversion on 8h windows',
    dataSources: ['binance-ohlcv', 'funding-rate'],
    featureSet: ['funding_rate', 'open_interest'],
    regime: 'RANGE',
    trainPeriod: { start: '2024-01-01', end: '2024-06-30' },
    validationPeriod: { start: '2024-07-01', end: '2024-09-30' },
    oosPeriod: { start: '2024-10-01', end: '2024-12-31' },
    costs: { feeBps: 10, impactBps: 5 },
    slippage: { slippageBps: 3 },
    seed: 42,
    gitCommit: 'abc123',
    result: { oosPassCount: 0, oosTotalCount: 5, aggregatePnlUsd: -100, summary: 'falsified' },
    falsificationReason: 'Bootstrap CI includes 0',
    status: 'FALSIFIED',
    reproducibility: 'class-level',
    ...overrides,
  };
}

describe('validateJobSpec', () => {
  describe('fail-closed: missing required fields', () => {
    it('empty id → ok:false with reason', () => {
      const result = validateJobSpec(makeSpec({ id: '' }), []);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('id must be non-empty');
    });

    it('empty hypothesis → ok:false with reason', () => {
      const result = validateJobSpec(makeSpec({ hypothesis: '' }), []);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('hypothesis must be non-empty');
    });

    it('empty rationale → ok:false with reason', () => {
      const result = validateJobSpec(makeSpec({ rationale: '' }), []);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('rationale must be non-empty');
    });

    it('empty dataset → ok:false with reason', () => {
      const result = validateJobSpec(makeSpec({ dataset: '' }), []);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('dataset must be non-empty');
    });

    it('empty generatedBy → ok:false with reason', () => {
      const result = validateJobSpec(makeSpec({ generatedBy: '' }), []);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('generatedBy must be non-empty');
    });

    it('empty features → ok:false with reason', () => {
      const result = validateJobSpec(makeSpec({ features: [] }), []);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('features must be non-empty');
    });

    it('empty universe.id → ok:false with reason', () => {
      const result = validateJobSpec(
        makeSpec({ universe: { id: '', symbols: ['BTCUSDT'], weighting: 'equal', rebalanceRule: 'none' } }),
        [],
      );
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('universe.id must be non-empty');
    });

    it('empty universe.symbols → ok:false with reason', () => {
      const result = validateJobSpec(
        makeSpec({ universe: { id: 'u', symbols: [], weighting: 'equal', rebalanceRule: 'none' } }),
        [],
      );
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('universe.symbols must be non-empty');
    });

    it('non-finite timestamp → ok:false with reason', () => {
      const result = validateJobSpec(makeSpec({ timestamp: NaN }), []);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('timestamp must be a finite number');
    });

    it('negative feeBps → ok:false with reason', () => {
      const result = validateJobSpec(
        makeSpec({ costs: { feeBps: -1, impactBps: 5 } }),
        [],
      );
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('costs.feeBps must be a finite non-negative number');
    });

    it('negative impactBps → ok:false with reason', () => {
      const result = validateJobSpec(
        makeSpec({ costs: { feeBps: 10, impactBps: -1 } }),
        [],
      );
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('costs.impactBps must be a finite non-negative number');
    });

    it('negative slippageBps → ok:false with reason', () => {
      const result = validateJobSpec(
        makeSpec({ slippage: { slippageBps: -1 } }),
        [],
      );
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('slippage.slippageBps must be a finite non-negative number');
    });

    it('multiple missing fields → all reasons reported', () => {
      const result = validateJobSpec(
        makeSpec({
          id: '',
          hypothesis: '',
          rationale: '',
          dataset: '',
          generatedBy: '',
          features: [],
          universe: { id: '', symbols: [], weighting: 'equal', rebalanceRule: 'none' },
          timestamp: NaN,
        }),
        [],
      );
      expect(result.ok).toBe(false);
      expect(result.reasons.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('valid spec passes field checks', () => {
    it('all required fields present → ok:true with empty reasons', () => {
      const result = validateJobSpec(makeSpec(), []);
      expect(result.ok).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('seed can be null', () => {
      const result = validateJobSpec(makeSpec({ seed: null }), []);
      expect(result.ok).toBe(true);
    });

    it('parentHypothesis can be null', () => {
      const result = validateJobSpec(makeSpec({ parentHypothesis: null }), []);
      expect(result.ok).toBe(true);
    });

    it('gitSha can be null', () => {
      const result = validateJobSpec(makeSpec({ gitSha: null }), []);
      expect(result.ok).toBe(true);
    });
  });

  describe('registry collision checks', () => {
    it('hypothesis matching falsified registry entry → ok:false with re-test reason', () => {
      const entry = makeRegistryEntry({ status: 'FALSIFIED' });
      const result = validateJobSpec(makeSpec(), [entry]);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain(
        "re-tests falsified hypothesis class 'funding-fade-class' — do not retest dead hypotheses",
      );
    });

    it('hypothesis matching non-falsified registry entry → ok:false with duplicate reason', () => {
      const entry = makeRegistryEntry({ status: 'SURVIVED' });
      const result = validateJobSpec(makeSpec(), [entry]);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain(
        "duplicates existing registry entry 'funding-fade-class' (status SURVIVED)",
      );
    });

    it('case-insensitive hypothesis matching', () => {
      const entry = makeRegistryEntry({ status: 'FALSIFIED' });
      const spec = makeSpec({ hypothesis: 'FUNDING RATE MEAN REVERSION ON 8H WINDOWS' });
      const result = validateJobSpec(spec, [entry]);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain(
        "re-tests falsified hypothesis class 'funding-fade-class' — do not retest dead hypotheses",
      );
    });

    it('hypothesis with different casing in registry still matches', () => {
      const entry = makeRegistryEntry({
        hypothesis: 'FUNDING RATE MEAN REVERSION ON 8H WINDOWS',
        status: 'FALSIFIED',
      });
      const result = validateJobSpec(makeSpec(), [entry]);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain(
        "re-tests falsified hypothesis class 'funding-fade-class' — do not retest dead hypotheses",
      );
    });

    it('different hypothesis passes registry check', () => {
      const entry = makeRegistryEntry({ status: 'FALSIFIED' });
      const spec = makeSpec({ hypothesis: 'Momentum on 4h windows' });
      const result = validateJobSpec(spec, [entry]);
      expect(result.ok).toBe(true);
    });

    it('multiple registry entries — one falsified match fails', () => {
      const entries = [
        makeRegistryEntry({ id: 'entry-1', hypothesis: 'Different hypothesis', status: 'SURVIVED' }),
        makeRegistryEntry({ id: 'entry-2', hypothesis: 'Funding rate mean reversion on 8h windows', status: 'FALSIFIED' }),
      ];
      const result = validateJobSpec(makeSpec(), entries);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain(
        "re-tests falsified hypothesis class 'entry-2' — do not retest dead hypotheses",
      );
    });

    it('PROPOSED registry entry → duplicate reason (not re-test)', () => {
      const entry = makeRegistryEntry({ status: 'PROPOSED' });
      const result = validateJobSpec(makeSpec(), [entry]);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain(
        "duplicates existing registry entry 'funding-fade-class' (status PROPOSED)",
      );
    });

    it('RUNNING registry entry → duplicate reason', () => {
      const entry = makeRegistryEntry({ status: 'RUNNING' });
      const result = validateJobSpec(makeSpec(), [entry]);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain(
        "duplicates existing registry entry 'funding-fade-class' (status RUNNING)",
      );
    });

    it('ARCHIVED registry entry → duplicate reason', () => {
      const entry = makeRegistryEntry({ status: 'ARCHIVED' });
      const result = validateJobSpec(makeSpec(), [entry]);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain(
        "duplicates existing registry entry 'funding-fade-class' (status ARCHIVED)",
      );
    });
  });

  describe('combined field + registry checks', () => {
    it('missing field AND registry collision → both reasons reported', () => {
      const entry = makeRegistryEntry({ status: 'FALSIFIED' });
      const result = validateJobSpec(makeSpec({ id: '' }), [entry]);
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('id must be non-empty');
      expect(result.reasons).toContain(
        "re-tests falsified hypothesis class 'funding-fade-class' — do not retest dead hypotheses",
      );
    });
  });
});