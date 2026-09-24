// Payload parsers for Binance REST microstructure responses.
// Pure functions: unknown in → PollResult out. Bad data yields {ok:false}
// with a specific reason; control-flow throws are forbidden here so callers
// cannot accidentally skip the fail-closed audit path.

export type {
  DepthLevel,
  DepthPayload,
  PollResult,
  RawPollPayload,
  TradePrint,
} from './snapshot-types';

export { parseDepthPayload } from './parse-depth';
export { parseAggTradesPayload } from './parse-trades';
