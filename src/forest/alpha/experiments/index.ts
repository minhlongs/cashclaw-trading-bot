// Experiment Engine — Barrel Export

export type {
  ExperimentId,
  Experiment,
  FeeModel,
  SlippageModel,
  FeatureSet,
  EntryRule,
  ExitRule,
  PositionSizing,
  Period,
  PeriodMetrics,
  RegimePerformance,
  RegimePerformanceEntry,
  SymbolPerformance,
  SymbolPerformanceEntry,
  ExperimentResult,
  ExperimentDeps,
} from './types';

export { runExperiment } from './runner';