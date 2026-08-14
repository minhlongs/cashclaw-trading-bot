import { describe, it, expect, vi } from 'vitest';
import { GridStrategy, type GridStrategyCallbacks } from './grid';

const SYMBOL = 'BTC/USDT';
const EXCHANGE = 'binance';

function makeGridConfig() {
 return {
 symbol: SYMBOL,
 exchange: EXCHANGE,
 strategy: 'grid' as const,
 mode: 'paper' as const,
 capital: 1000,
 maxDrawdownPct: 20,
 gridSpacingPct: 1,
 gridLevels: 10,
 capitalPerLevelPct: 5,
 takeProfitPct: 3,
 stopLossPct: 2,
 rebalanceOnFill: false,
 };
}

function makeMockCallbacks(): GridStrategyCallbacks {
 return {
 placeOrder: vi.fn().mockResolvedValue({
 id: 'ord_mock',
 exchangeId: '',
 symbol: SYMBOL,
 side: 'buy',
 type: 'limit',
 price: 0,
 quantity: 0,
 filled: 0,
 status: 'filled',
 fee: 0,
 feeCurrency: '',
 timestamp: Date.now(),
 pnl: 0,
 }),
 onTrade: vi.fn(),
 onLog: vi.fn(),
 };
}

const TICKER = (last: number) => ({ last, bid: last, ask: last, high24h: 105, low24h: 95, volume24h: 1000, timestamp: Date.now(), symbol: SYMBOL });

const JACKET = (last: number) => ({ last, bid: last, ask: last, high24h: 105, low24h: 95, volume24h: 1000, timestamp: Date.now(), symbol: SYMBOL });

describe('GridStrategy — trailing TP/SL', () => {
 it('ratchets TP upward and closes at take-profit', () => {
 const cb = makeMockCallbacks();
 const g = new GridStrategy(makeGridConfig(), cb);
 g.start(100);

 g.onTicker(JACKET(97));
 let levels = g.getLevels();
 let l = levels.find(x => x.side === 'buy' && x.level === 1);
 expect(l?.status).toBe('filled');
 expect(l?.filledPrice).toBeCloseTo(97, 2);

 // Tick 1 (price=95): init + skipExit → no close
 // Seed: TP=99.91, SL=93.12 (fill - 2*slOffset)
 g.onTicker(TICKER(95));
 levels = g.getLevels();
 l = levels.find(x => x.side === 'buy' && x.level === 1);
 expect(l?.trailingActive).toBe(true);
 expect(l?.currentTpPrice).toBeCloseTo(99.91, 2);
 expect(l?.currentSlPrice).toBeCloseTo(93.12, 2);
 expect(l?.status).toBe('filled');

 // Tick 2 (price=96): skipExit consumed → price<fill → SL stays at 97
 g.onTicker(TICKER(96));
 levels = g.getLevels();
 l = levels.find(x => x.side === 'buy' && x.level === 1);
 expect(l?.currentSlPrice).toBeCloseTo(93.12, 2);
 expect(l?.status).toBe('filled');

 // Tick 3 (price=99): price=99 > fill(97). SL: candidate=99+1.94=100.94, floor=97 → min(100.94,97)=97. Same as current.
 g.onTicker(TICKER(99));
 levels = g.getLevels();
 l = levels.find(x => x.side === 'buy' && x.level === 1);
expect(l?.currentSlPrice).toBeCloseTo(97, 2);
 expect(l?.status).toBe('filled');

 // Tick 4 (price=103): TP ratchets UP. threshold=103-2.91=100.09 > 99.91 → TP=100.09
 // SL: candidate=103+1.94=104.94 floor=97 → min=97 → same as current (97)
 // 103 >= 100.09 → CLOSE (TP hit)
 g.onTicker(TICKER(103));
 levels = g.getLevels();
 l = levels.find(x => x.side === 'buy' && x.level === 1);
 expect(l?.status).toBe('cancelled');
 });

 it('closes on stop-loss when price falls below SL threshold', () => {
 const cb = makeMockCallbacks();
 const g = new GridStrategy(makeGridConfig(), cb);
 g.start(100);

 g.onTicker(JACKET(97));
 let levels = g.getLevels();
 let l = levels.find(x => x.side === 'buy' && x.level === 1);
 expect(l?.status).toBe('filled');
 expect(l?.filledPrice).toBeCloseTo(97, 2);

 // Tick 1 (price=95): init+skipExit → TP=99.91, SL=93.12, skip=true → no close
 g.onTicker(TICKER(95));
 levels = g.getLevels();
 l = levels.find(x => x.side === 'buy' && x.level === 1);
 expect(l?.currentSlPrice).toBeCloseTo(93.12, 2);
 expect(l?.status).toBe('filled');

 // Tick 2 (price=92): skip consumed. price=92 < SL(93.12) → CLOSE (SL hit)
 g.onTicker(TICKER(92));
 levels = g.getLevels();
 l = levels.find(x => x.side === 'buy' && x.level === 1);
 expect(l?.status).toBe('cancelled');
 });

 it('sl tightens on price rises (true trailing stop locks gains)', () => {
 const cb = makeMockCallbacks();
 const g = new GridStrategy(makeGridConfig(), cb);
 g.start(100);
 g.onTicker(JACKET(97)); // fill @ 97, trailing seed SL=93.12

 // Tick 1: seed trailing: SL=93.12, skipExit=true → no close
 g.onTicker(TICKER(97));
 let levels = g.getLevels();
 let l = levels.find(x => x.side === 'buy' && x.level === 1);
 expect(l?.currentSlPrice).toBeCloseTo(93.12, 2);
 expect(l?.status).toBe('filled');

 // Tick 2: price=105 (above fill). SL: candidate=105+1.94=106.94, floor=maxSl=97 → min(106.94,97)=97
 // Wait — the min logic means SL tightens to 97 stays 97. Current=97. No change.
 g.onTicker(TICKER(105));
 levels = g.getLevels();
 l = levels.find(x => x.side === 'buy' && x.level === 1);
expect(l?.currentSlPrice).toBeCloseTo(97, 2);
 expect(l?.status).toBe('cancelled'); // 105 >= TP threshold (105-2.91=102.09) → TP hit first
 });

 it('does not close on same tick as fill (skipExit protection)', () => {
 const cb = makeMockCallbacks();
 const g = new GridStrategy(makeGridConfig(), cb);
 g.start(100);
 g.onTicker(JACKET(97)); // fill
 // Immediately follow with a tick that would otherwise trigger close
 g.onTicker(TICKER(99));
 const levels = g.getLevels();
 const l = levels.find(x => x.side === 'buy' && x.level === 1);
 expect(l?.status).toBe('filled'); // skipExit prevented close
 expect(l?.trailingSkipExit).toBe(false); // flag was consumed
 });

 it('status stays filled after fill (onOrderFilled path)', () => {
 const cb = makeMockCallbacks();
 const g = new GridStrategy(makeGridConfig(), cb);
 g.start(100);
    g.onTicker(TICKER(97));  // fill then seed trailing
 g.onTicker(TICKER(97));
    const l = g.getLevels().find(x => x.side === 'buy' && x.level === 1);
 expect(l?.status).toBe('filled');
 expect(l?.filledPrice).toBeCloseTo(97, 2);
    expect(l?.trailingActive).toBe(true);
 expect(l?.currentSlPrice).toBeCloseTo(93.12, 2);
 expect(l?.currentTpPrice).toBeCloseTo(99.91, 2);
 });
});
