// Mechanism gate — accept/reject table tests.
// Heuristic floor: length + blocklist + causal-connective/domain-token rule.

import { describe, expect, it } from 'vitest';
import { checkMechanism, MECHANISM_MIN_LENGTH } from './mechanism-gate';

const VALID_MECHANISM =
  'Funding dislocation + OI expansion + liquidation imbalance may indicate crowded positioning and short-horizon reversal';

describe('checkMechanism table', () => {
  const rejected: ReadonlyArray<readonly [string, string]> = [
    ['LLM thinks price will go up', 'blocklist + too short'],
    ['AI predicts BTC moon soon, trust the output blindly', 'blocklist: ai predicts'],
    ['The model says buy now because the chart looks good', 'blocklist: model says'],
    ['Price will go up because I said so, no further details', 'blocklist: price will go up'],
    ['Random words with enough length but no causal content here', 'no connective, <2 tokens'],
  ];
  it.each(rejected)('rejects %s (%s)', (text) => {
    expect(checkMechanism(text).ok).toBe(false);
  });

  const accepted: ReadonlyArray<readonly [string, string]> = [
    [VALID_MECHANISM, 'connective + multiple domain tokens'],
    [
      'Rising open interest alongside flat price implies building pressure that leads to a breakout',
      'connective leads to + tokens',
    ],
    [
      'Elevated funding and open interest together signal crowded positioning in the market',
      'two domain tokens, no connective',
    ],
  ];
  it.each(accepted)('accepts %s (%s)', (text) => {
    expect(checkMechanism(text).ok).toBe(true);
  });

  it('rejects empty and whitespace-only mechanisms', () => {
    expect(checkMechanism('').ok).toBe(false);
    expect(checkMechanism('   ').ok).toBe(false);
  });

  it('rejects mechanisms below the min length floor', () => {
    const result = checkMechanism('funding leads to x');
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain(`${MECHANISM_MIN_LENGTH} chars`);
  });

  it('collects multiple reasons for a vacuous long mechanism', () => {
    const result = checkMechanism(
      'The LLM thinks price will go up and this is a long sentence to pass the length floor',
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
