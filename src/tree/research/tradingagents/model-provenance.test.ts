// Model provenance tests (task §F): 9-provider allowlist, tier-by-task
// routing law, fail-closed recording of the selected provider/model.

import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_PROVIDERS,
  TIER_BY_TASK,
  isSupportedProvider,
  recordModelProvenance,
  tierForTask,
} from './model-provenance';
import type { ModelProvenance } from './types';

const VALID: ModelProvenance = {
  providerId: 'Anthropic',
  modelId: 'claude-x',
  tier: 'REASONING',
};

describe('SUPPORTED_PROVIDERS — task.md §F allowlist', () => {
  it('contains exactly 9 providers', () => {
    expect(SUPPORTED_PROVIDERS).toHaveLength(9);
  });

  it('contains the verbatim provider ids from task.md §F', () => {
    expect([...SUPPORTED_PROVIDERS]).toEqual([
      'Anthropic', 'OpenAI', 'Gemini', 'DeepSeek', 'Qwen',
      'GLM', 'MiniMax', 'OpenRouter', 'Ollama/local',
    ]);
  });

  it('isSupportedProvider accepts every allowlisted id', () => {
    for (const p of SUPPORTED_PROVIDERS) {
      expect(isSupportedProvider(p)).toBe(true);
    }
  });

  it('isSupportedProvider rejects unknown ids', () => {
    expect(isSupportedProvider('unknown-provider')).toBe(false);
    expect(isSupportedProvider('')).toBe(false);
  });
});

describe('tierForTask — routing law (§F)', () => {
  it('maps data-extraction and summarization to FAST', () => {
    expect(tierForTask('data-extraction')).toBe('FAST');
    expect(tierForTask('summarization')).toBe('FAST');
  });

  it('maps research-synthesis and debate to REASONING', () => {
    expect(tierForTask('research-synthesis')).toBe('REASONING');
    expect(tierForTask('debate')).toBe('REASONING');
  });

  it('maps repetitive-research to LOCAL', () => {
    expect(tierForTask('repetitive-research')).toBe('LOCAL');
  });

  it('TIER_BY_TASK covers exactly 5 tasks', () => {
    expect(Object.keys(TIER_BY_TASK)).toHaveLength(5);
  });
});

describe('recordModelProvenance — happy path', () => {
  it('records a valid REASONING debate call', () => {
    const result = recordModelProvenance('bull-researcher', 'debate', VALID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.agentRole).toBe('bull-researcher');
    expect(result.record.task).toBe('debate');
    expect(result.record.provenance.tier).toBe('REASONING');
  });

  it('records a valid FAST data-extraction call', () => {
    const result = recordModelProvenance('analyst', 'data-extraction', {
      providerId: 'Anthropic', modelId: 'fast-model', tier: 'FAST',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts optional token/latency counters', () => {
    const result = recordModelProvenance('analyst', 'debate', {
      ...VALID, promptTokens: 100, completionTokens: 50, latencyMs: 1200,
    });
    expect(result.ok).toBe(true);
  });
});

describe('recordModelProvenance — fail-closed', () => {
  it('rejects an unsupported provider id', () => {
    const result = recordModelProvenance('analyst', 'debate', {
      ...VALID, providerId: 'not-a-provider',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('not in the supported provider allowlist'))).toBe(true);
  });

  it('rejects a tier mismatch (REASONING task on FAST tier)', () => {
    const result = recordModelProvenance('analyst', 'debate', {
      ...VALID, tier: 'FAST',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes("requires tier 'REASONING'"))).toBe(true);
  });

  it('rejects a tier mismatch (FAST task on REASONING tier)', () => {
    const result = recordModelProvenance('analyst', 'data-extraction', {
      ...VALID, tier: 'REASONING',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an empty modelId', () => {
    const result = recordModelProvenance('analyst', 'debate', { ...VALID, modelId: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects an empty agentRole', () => {
    const result = recordModelProvenance('' as never, 'debate', VALID);
    expect(result.ok).toBe(false);
  });

  it('rejects negative token counters', () => {
    const result = recordModelProvenance('analyst', 'debate', { ...VALID, promptTokens: -1 });
    expect(result.ok).toBe(false);
  });

  it('collects ALL reasons (provider + tier + modelId)', () => {
    const result = recordModelProvenance('analyst', 'debate', {
      providerId: 'bad', modelId: '', tier: 'FAST',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
