import { SEED_FALSIFIED } from '@/tree/alpha/registry/seed-falsified';
import type { HypothesisProposal } from './types';

export class AgentValidationError extends Error {
  constructor(message: string, readonly issues?: readonly unknown[]) {
    super(message);
    this.name = 'AgentValidationError';
  }
}

const FALSIFIED = SEED_FALSIFIED.map((e) => ({
  id: e.id.toLowerCase(),
  features: e.featureSet.map((f) => f.toLowerCase()),
}));

export function extractItems(parsed: unknown, key: string): unknown {
  if (!parsed || typeof parsed !== 'object') {
    throw new AgentValidationError(`Completion response must be an object or array, received ${typeof parsed}`);
  }
  return Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>)[key];
}

export function matchesTokens(id: string, text: string): boolean {
  const tokens = id.split('-').filter(Boolean);
  if (tokens.length === 0) return false;
  const match = (list: string[]) => list.every((t) => new RegExp(`\\b${t}\\b`, 'i').test(text));
  return match(tokens) || (tokens.includes('mean') && match(tokens.filter((t) => t !== 'mean')));
}

export function matchFalsified(proposal: HypothesisProposal, extraExcluded: Set<string>): string | null {
  const idLower = proposal.id.toLowerCase();
  if (extraExcluded.has(idLower)) return idLower;
  const text = `${proposal.id} ${proposal.title} ${proposal.rationale}`.toLowerCase();
  for (const entry of FALSIFIED) {
    if (idLower === entry.id) return entry.id;
    if (proposal.proposedFeatures && proposal.proposedFeatures.length > 0) {
      const feats = proposal.proposedFeatures.map((f) => f.toLowerCase().replace(/[-_]/g, ''));
      const eFeats = entry.features.map((f) => f.replace(/[-_]/g, ''));
      const exact = eFeats.length === feats.length && eFeats.every((f) => feats.includes(f));
      const sub = eFeats.length >= 2 && eFeats.every((f) => feats.includes(f));
      if (exact || sub) return entry.id;
    }
    if (matchesTokens(entry.id, text)) return entry.id;
  }
  for (const excluded of extraExcluded) {
    if (matchesTokens(excluded, text)) return excluded;
  }
  return null;
}
