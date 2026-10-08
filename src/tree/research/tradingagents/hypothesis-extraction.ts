// Hypothesis extraction — turn a bull/bear debate into two falsifiable
// ResearchHypothesis objects (task §B). Pure logic: no I/O, no LLM, no
// winner selection. Bull → Hypothesis A, Bear → Hypothesis B; BOTH are fed
// to CashClaw's experiment/OOS/cost pipeline. Which survives is decided by
// evidence downstream, never by which debater was more persuasive (§B, §L).
// Deterministic ids via FNV-1a32 over canonical(debateState+role) — no wall
// clock. Reuses parseResearchHypothesis (Zod + mechanism gate).

import { fnv1a32 } from './hypothesis-fnv';
import {
  buildHypothesisId,
  type DebateThesis,
  type DebateInput,
  type HypothesisExtractionConfig,
} from './hypothesis-builder';
import {
  extractHypotheses,
  type ExtractedHypotheses,
  type ExtractHypothesesResult,
} from './hypothesis-extractor';

export { fnv1a32, buildHypothesisId, extractHypotheses };
export type {
  DebateThesis,
  DebateInput,
  HypothesisExtractionConfig,
  ExtractedHypotheses,
  ExtractHypothesesResult,
};
