import { NormalizedOrderbook, AMMPool, ArbitrageOpportunity } from '../models/exchange-types';

export class BasisCalculator {
    public calculateAmmOutput(pool: AMMPool, amountIn: number, isBaseToQuote: boolean): number {
        const { reserveBase, reserveQuote, feeTier } = pool;
        const amountInWithFee = amountIn * (1 - feeTier);
        if (isBaseToQuote) {
            return (amountInWithFee * reserveQuote) / (reserveBase + amountInWithFee);
        }
        return (amountInWithFee * reserveBase) / (reserveQuote + amountInWithFee);
    }

    public calculateAmmInput(pool: AMMPool, amountOut: number, isQuoteForBase: boolean): number | null {
        const { reserveBase, reserveQuote, feeTier } = pool;
        if (isQuoteForBase) {
            if (amountOut >= reserveBase) return null;
            return (amountOut * reserveQuote) / ((reserveBase - amountOut) * (1 - feeTier));
        }
        if (amountOut >= reserveQuote) return null;
        return (amountOut * reserveBase) / ((reserveQuote - amountOut) * (1 - feeTier));
    }

    public findBestOpportunity(
        cexOrderbook: NormalizedOrderbook, 
        dexPool: AMMPool, 
        gasCostUSD: number, 
        minProfitUSD: number,
        tradeSizeNative: number
    ): ArbitrageOpportunity | null {
        let bestOpp: ArbitrageOpportunity | null = null;
        let maxProfit = -Infinity;
        const now = Date.now();

        // Evaluate CEX Buy -> DEX Sell
        if (cexOrderbook.asks.length > 0 && cexOrderbook.asks[0].size >= tradeSizeNative) {
            const cexAsk = cexOrderbook.asks[0].price;
            const costToBuyCex = cexAsk * tradeSizeNative * (1 + cexOrderbook.feeTier);
            const dexReceiveQuote = this.calculateAmmOutput(dexPool, tradeSizeNative, true);
            const profitCexToDex = dexReceiveQuote - costToBuyCex - gasCostUSD;

            if (profitCexToDex >= minProfitUSD && profitCexToDex > maxProfit) {
                maxProfit = profitCexToDex;
                bestOpp = {
                    direction: 'CEX_TO_DEX',
                    size: tradeSizeNative,
                    grossProfit: profitCexToDex + gasCostUSD,
                    netProfit: profitCexToDex,
                    executionPriceCex: cexAsk,
                    executionPriceDex: dexReceiveQuote / tradeSizeNative,
                    gasCostUSD,
                    timestamp: now
                };
            }
        }

        // Evaluate DEX Buy -> CEX Sell
        if (cexOrderbook.bids.length > 0 && cexOrderbook.bids[0].size >= tradeSizeNative) {
            const cexBid = cexOrderbook.bids[0].price;
            const costToBuyDexQuote = this.calculateAmmInput(dexPool, tradeSizeNative, true);
            
            if (costToBuyDexQuote !== null) {
                const receiveCexSell = cexBid * tradeSizeNative * (1 - cexOrderbook.feeTier);
                const profitDexToCex = receiveCexSell - costToBuyDexQuote - gasCostUSD;

                if (profitDexToCex >= minProfitUSD && profitDexToCex > maxProfit) {
                    maxProfit = profitDexToCex;
                    bestOpp = {
                        direction: 'DEX_TO_CEX',
                        size: tradeSizeNative,
                        grossProfit: profitDexToCex + gasCostUSD,
                        netProfit: profitDexToCex,
                        executionPriceCex: cexBid,
                        executionPriceDex: costToBuyDexQuote / tradeSizeNative,
                        gasCostUSD,
                        timestamp: now
                    };
                }
            }
        }

        return bestOpp;
    }
}
