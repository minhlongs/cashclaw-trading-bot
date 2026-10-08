import { ArbitrageOpportunity } from '../models/exchange-types';

export interface ExecutionResult {
    success: boolean;
    reason?: string;
    executedOpportunity: ArbitrageOpportunity;
    txHashDex?: string;
    orderIdCex?: string;
}

export class CrossDomainExecutor {
    private isLocked = false;

    // Simulates an execution of an opportunity
    public async execute(opp: ArbitrageOpportunity): Promise<ExecutionResult> {
        if (this.isLocked) {
            return {
                success: false,
                reason: 'Executor is currently processing another trade.',
                executedOpportunity: opp
            };
        }

        try {
            this.isLocked = true;

            // In a real system, you would submit to CEX first (generally faster and atomic)
            // Then submit to DEX. If DEX fails, you may hedge back on CEX.
            const cexResult = await this.mockCexExecution(opp);
            if (!cexResult.success) {
                return {
                    success: false,
                    reason: 'CEX leg failed',
                    executedOpportunity: opp
                };
            }

            const dexResult = await this.mockDexExecution(opp);
            if (!dexResult.success) {
                // Here we would implement hedging to reverse the CEX trade.
                await this.mockHedgeCex(opp);
                return {
                    success: false,
                    reason: 'DEX leg failed. CEX leg hedged.',
                    executedOpportunity: opp,
                    orderIdCex: cexResult.orderId
                };
            }

            return {
                success: true,
                executedOpportunity: opp,
                orderIdCex: cexResult.orderId,
                txHashDex: dexResult.txHash
            };
        } finally {
            this.isLocked = false;
        }
    }

    private mockCexExecution(_opp: ArbitrageOpportunity): Promise<{ success: boolean; orderId?: string }> {
        return new Promise((resolve) => {
            setTimeout(() => {
                // 99% success rate in simulation
                const isSuccess = Math.random() > 0.01;
                resolve(isSuccess ? { success: true, orderId: 'cex-order-123' } : { success: false });
            }, 10); // 10ms CEX latency
        });
    }

    private mockDexExecution(_opp: ArbitrageOpportunity): Promise<{ success: boolean; txHash?: string }> {
        return new Promise((resolve) => {
            setTimeout(() => {
                // 90% success rate to simulate slippage or gas failures
                const isSuccess = Math.random() > 0.1;
                resolve(isSuccess ? { success: true, txHash: '0xabc123' } : { success: false });
            }, 50); // 50ms broadcast delay simulation
        });
    }

    private mockHedgeCex(_opp: ArbitrageOpportunity): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(() => resolve(), 10);
        });
    }
}
