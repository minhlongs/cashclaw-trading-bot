export interface OrderbookLevel {
    price: number;
    size: number;
}

export interface NormalizedOrderbook {
    bids: OrderbookLevel[];
    asks: OrderbookLevel[];
    timestamp: number;
    feeTier: number; // e.g., 0.001 for 0.1%
}

export interface AMMPool {
    reserveBase: number;
    reserveQuote: number;
    feeTier: number; // e.g., 0.003 for 0.3%
    timestamp: number;
}

export interface ArbitrageOpportunity {
    direction: 'CEX_TO_DEX' | 'DEX_TO_CEX';
    size: number;
    grossProfit: number;
    netProfit: number;
    executionPriceCex: number;
    executionPriceDex: number;
    gasCostUSD: number;
    timestamp: number;
}
