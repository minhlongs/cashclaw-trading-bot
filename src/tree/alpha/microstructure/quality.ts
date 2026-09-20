// Microstructure data-quality checks — pure functions, no I/O.
// Every check returns a QualityReport; callers decide whether to persist
// or log. `now` is always received as a parameter, never Date.now().
//
// Facade: re-exports shared types/gates and the two validators from
// co-located submodules.

export {
  MAX_STALE_DRIFT_MS,
  validateDepth,
  type QualityReport,
} from './quality-types';

export { validateTradeBatch } from './quality-trade';
