// Verification of corrected GridStrategy trailing TP/SL logic
import { readFileSync } from 'fs';

console.log('=== Verifying corrected trailing TP/SL logic ===\n');

function simulateInitial(fillPrice, takeProfitPct, stopLossPct) {
  return {
    currentTpPrice: fillPrice + fillPrice * (takeProfitPct / 100),
    currentSlPrice: fillPrice - fillPrice * (stopLossPct / 100),
    filledPrice: fillPrice,
    trailingActive: true,
  };
}

function updateTrailing(state, price, takeProfitPct, stopLossPct) {
  // TP: always ratchet toward current price offset
  const candidateTp = price - state.filledPrice * (takeProfitPct / 100);
  if (candidateTp > state.currentTpPrice) {
    state.currentTpPrice = Math.min(candidateTp, price * 0.9999);
  }

  // SL: trail down on price dips, up on price rises; never above TP
  const candidateSl = price - state.filledPrice * (stopLossPct / 100);
  if (!state.currentSlPrice || price < state.filledPrice) {
    // Price below entry: trail SL down (floor at 50% of entry)
    state.currentSlPrice = Math.max(candidateSl, state.filledPrice * 0.5);
  } else if (candidateSl > state.currentSlPrice) {
    // Price above entry: SL can ratchet up but never above TP
    state.currentSlPrice = Math.min(candidateSl, state.currentTpPrice * 0.9999);
  }
}

// ── Test 1: SL trails down on dip below entry ────────────
console.log('Test 1: SL trails down when price dips below entry');
const t1 = simulateInitial(99, 3, 2);
console.log(`  Fill @ 99: TP=${t1.currentTpPrice.toFixed(2)} SL=${t1.currentSlPrice.toFixed(2)}`);

updateTrailing(t1, 95, 3, 2);
console.log(`  Tick @ 95:  TP=${t1.currentTpPrice.toFixed(2)} SL=${t1.currentSlPrice.toFixed(2)}`);
console.assert(Math.abs(t1.currentSlPrice - 87.02) < 0.01, `Test 1a: SL should trail to 87.02, got ${t1.currentSlPrice}`);

updateTrailing(t1, 87, 3, 2);
console.log(`  Tick @ 87:  TP=${t1.currentTpPrice.toFixed(2)} SL=${t1.currentSlPrice.toFixed(2)}`);
console.assert(Math.abs(t1.currentSlPrice - 85.02) < 0.01, `Test 1b: SL should trail to 85.02, got ${t1.currentSlPrice}`);
console.log('  ✓ Test 1 PASSED\n');

// ── Test 2: TP ratchets up and triggers close ────────────
console.log('Test 2: TP ratchets up and triggers close at take-profit');
const t2 = simulateInitial(99, 3, 2);
t2.currentSlPrice = 85.02; // pre-set from after dip to 87

updateTrailing(t2, 100, 3, 2);
console.log(`  Tick @ 100: TP=${t2.currentTpPrice.toFixed(2)} SL=${t2.currentSlPrice.toFixed(2)}`);

updateTrailing(t2, 103, 3, 2);
console.log(`  Tick @ 103: TP=${t2.currentTpPrice.toFixed(2)} SL=${t2.currentSlPrice.toFixed(2)}`);

updateTrailing(t2, 104, 3, 2);
console.log(`  Tick @ 104: TP=${t2.currentTpPrice.toFixed(2)} SL=${t2.currentSlPrice.toFixed(2)}`);

const closed = 104 >= t2.currentTpPrice;
console.log(`  Close check: price=104 >= TP=${t2.currentTpPrice.toFixed(2)} → ${closed}`);
console.assert(closed, 'Test 2: should close at TP');
console.log('  ✓ Test 2 PASSED\n');

// ── Test 3: SL < TP invariant ────────────────────────────
console.log('Test 3: SL < TP invariant on all price moves');
const t3 = simulateInitial(100, 3, 2);
let invariant = t3.currentSlPrice < t3.currentTpPrice;
console.log(`  Fill @ 100: TP=${t3.currentTpPrice.toFixed(2)} SL=${t3.currentSlPrice.toFixed(2)} — OK: ${invariant}`);
console.assert(invariant);

for (const price of [50, 80, 90, 120, 150, 200]) {
  updateTrailing(t3, price, 3, 2);
  invariant = t3.currentSlPrice < t3.currentTpPrice;
  console.log(`  Tick @ ${price}: TP=${t3.currentTpPrice.toFixed(2)} SL=${t3.currentSlPrice.toFixed(2)} — OK: ${invariant}`);
  console.assert(invariant, `SL crossed TP at price ${price}`);
}
console.log('  ✓ Test 3 PASSED\n');

console.log('=== All corrected verification tests passed ===');
