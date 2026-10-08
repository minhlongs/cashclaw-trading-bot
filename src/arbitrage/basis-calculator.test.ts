import { describe, it, expect, vi } from 'vitest';
import { BasisCalculator } from './basis-calculator';
import { CrossDomainExecutor } from '../execution/cross-domain-executor';
import { NormalizedOrderbook, AMMPool, ArbitrageOpportunity } from '../models/exchange-types';

describe('BasisCalculator', () => {
    const calculator = new BasisCalculator();

    const cexOrderbook: NormalizedOrderbook = {
        bids: [{ price: 99, size: 10 }], // CEX willing to buy at 99
        asks: [{ price: 101, size: 10 }], // CEX willing to sell at 101
        timestamp: Date.now(),
        feeTier: 0.001 // 0.1%
    };

    const dexPool: AMMPool = {
        reserveBase: 1000,
        reserveQuote: 100000, // Implied price ~ 100
        feeTier: 0.003, // 0.3%
        timestamp: Date.now()
    };

    it('should find CEX_TO_DEX opportunity when profitable', () => {
        // CEX ask is 90 (we buy at 90)
        const skewedCexBook: NormalizedOrderbook = {
            ...cexOrderbook,
            asks: [{ price: 90, size: 10 }]
        };
        const opp = calculator.findBestOpportunity(skewedCexBook, dexPool, 5, 2, 1);
        
        expect(opp).not.toBeNull();
        expect(opp?.direction).toBe('CEX_TO_DEX');
        expect(opp?.netProfit).toBeGreaterThan(2); 
    });

    it('should find DEX_TO_CEX opportunity when profitable', () => {
        // CEX bid is 110 (we sell at 110)
        const skewedCexBook: NormalizedOrderbook = {
            ...cexOrderbook,
            bids: [{ price: 110, size: 10 }]
        };
        
        const opp = calculator.findBestOpportunity(skewedCexBook, dexPool, 5, 2, 1);
        
        expect(opp).not.toBeNull();
        expect(opp?.direction).toBe('DEX_TO_CEX');
        expect(opp?.netProfit).toBeGreaterThan(2);
    });

    it('should return null when gas cost destroys profit', () => {
        const skewedCexBook: NormalizedOrderbook = {
            ...cexOrderbook,
            asks: [{ price: 99.5, size: 10 }] // marginal difference
        };
        
        const opp = calculator.findBestOpportunity(skewedCexBook, dexPool, 10, 1, 1); // high gas
        expect(opp).toBeNull();
    });

    it('should return null when min profit is not met', () => {
        const skewedCexBook: NormalizedOrderbook = {
            ...cexOrderbook,
            asks: [{ price: 95, size: 10 }] 
        };
        
        // Huge minimum profit requirement
        const opp = calculator.findBestOpportunity(skewedCexBook, dexPool, 2, 10, 1); 
        expect(opp).toBeNull();
    });

    it('should calculate AMM output correctly', () => {
        // x * y = 100,000,000
        // fee = 0
        const noFeePool: AMMPool = { ...dexPool, feeTier: 0 };
        const amountOut = calculator.calculateAmmOutput(noFeePool, 10, true);
        
        expect(amountOut).toBeCloseTo(990.099, 2);
    });

    it('should calculate AMM input correctly', () => {
        const noFeePool: AMMPool = { ...dexPool, feeTier: 0 };
        const amountIn = calculator.calculateAmmInput(noFeePool, 10, true);
        
        expect(amountIn).toBeCloseTo(1010.101, 2);
    });
});

describe('CrossDomainExecutor', () => {
    type TestableExecutor = {
        mockCexExecution: (opp: ArbitrageOpportunity) => Promise<{ success: boolean; orderId?: string }>;
        mockDexExecution: (opp: ArbitrageOpportunity) => Promise<{ success: boolean; txHash?: string }>;
        mockHedgeCex: (opp: ArbitrageOpportunity) => Promise<void>;
    };

    it('should execute opportunity successfully', async () => {
        const executor = new CrossDomainExecutor();
        const testable = executor as unknown as TestableExecutor;
        vi.spyOn(testable, 'mockCexExecution').mockResolvedValue({ success: true, orderId: 'mock-cex-id' });
        vi.spyOn(testable, 'mockDexExecution').mockResolvedValue({ success: true, txHash: '0xmockhash' });

        const opp = { direction: 'CEX_TO_DEX', size: 1 } as ArbitrageOpportunity;
        const result = await executor.execute(opp);

        expect(result.success).toBe(true);
        expect(result.orderIdCex).toBe('mock-cex-id');
        expect(result.txHashDex).toBe('0xmockhash');
    });

    it('should handle CEX leg failure', async () => {
        const executor = new CrossDomainExecutor();
        const testable = executor as unknown as TestableExecutor;
        vi.spyOn(testable, 'mockCexExecution').mockResolvedValue({ success: false });

        const opp = { direction: 'CEX_TO_DEX', size: 1 } as ArbitrageOpportunity;
        const result = await executor.execute(opp);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('CEX leg failed');
    });

    it('should handle DEX leg failure and trigger hedge', async () => {
        const executor = new CrossDomainExecutor();
        const testable = executor as unknown as TestableExecutor;
        vi.spyOn(testable, 'mockCexExecution').mockResolvedValue({ success: true, orderId: 'mock-cex-id' });
        vi.spyOn(testable, 'mockDexExecution').mockResolvedValue({ success: false });
        const mockHedge = vi.spyOn(testable, 'mockHedgeCex').mockResolvedValue(undefined);

        const opp = { direction: 'CEX_TO_DEX', size: 1 } as ArbitrageOpportunity;
        const result = await executor.execute(opp);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('DEX leg failed. CEX leg hedged.');
        expect(mockHedge).toHaveBeenCalledWith(opp);
    });

    it('should return error when executor is locked', async () => {
        const executor = new CrossDomainExecutor();
        const testable = executor as unknown as TestableExecutor;

        vi.spyOn(testable, 'mockCexExecution').mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100)));
        
        const opp = { direction: 'CEX_TO_DEX', size: 1 } as ArbitrageOpportunity;
        
        const exec1 = executor.execute(opp);
        const result2 = await executor.execute(opp);
        
        expect(result2.success).toBe(false);
        expect(result2.reason).toBe('Executor is currently processing another trade.');
        
        await exec1; 
    });
});
