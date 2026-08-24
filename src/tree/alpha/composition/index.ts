export type {
  ComposedAlpha,
  CompositionWeights,
  CompositionConfig,
} from './types';

export type {
  AlphaScore,
  ScoredAlpha,
  RejectedAlpha,
  ScoreComposedResult,
} from './scoring';

export { scoreAlpha, scoreComposedAlphas } from './scoring';
