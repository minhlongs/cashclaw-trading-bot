// Multiple-Testing Defense — Overfitting Proxies
// Two deterministic, sampling-free proxies for backtest overfitting
// (mission §9):
// 1. `pboProxy` — CSCV-style rank proxy: rank configs by in-sample mean
//    across OOS windows, report the fraction of IS-best configs that
//    finish below the median OOS performance.
// 2. `parameterSensitivity` — metric spread across neighboring configs
//    in a parameter grid; unstable metrics indicate curve fitting.
// Pure and deterministic: no I/O, no randomness, no Node APIs.
//
// Facade: re-exports overfitting proxies from co-located submodules.

export {
  DEFAULT_MAX_NORMALIZED_SPREAD,
  parameterSensitivity,
} from './overfitting-sensitivity';

export { pboProxy } from './overfitting-pbo';
