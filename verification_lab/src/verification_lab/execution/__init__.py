"""Execution-cost model (G6): venue fees, spread, slippage and impact.

Separate from `strategies` on purpose. The strategy modules answer "would this
book have made money"; everything here answers "at what cost, on which schedule,
and how much of that cost is measured rather than assumed". Keeping the two apart
is what lets the same book and the same price path be re-priced under a different
cost model without any risk of the signal being rebuilt differently.
"""
