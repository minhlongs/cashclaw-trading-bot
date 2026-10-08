import { describe, it, expect } from "vitest";
import { AvellanedaStoikovEngine } from "../../src/quant/avellaneda-stoikov";
import { HawkesConnector } from "../../src/integration/v6-hawkes-connector";
import type { MarketParameters, InventoryState } from "../../src/models/inventory-risk";

describe("Avellaneda-Stoikov Inventory Pricing", () => {
  const engine = new AvellanedaStoikovEngine();

  const baseMarket: MarketParameters = {
    midPrice: 100,
    volatility: 1, // 1 dollar vol for simplicity
    executionOrderDensity: 1.5, // k parameter
    liquidityFactor: 140, // A parameter
  };

  const baseInventory: InventoryState = {
    currentPosition: 0,
    riskAversion: 0.1, // gamma
    terminalTime: 1.0,
    currentTime: 0.0,
  };

  it("calculates symmetric spread at zero inventory", () => {
    const result = engine.calculateQuotes(baseMarket, baseInventory);
    
    expect(result.reservationPrice).toBe(100);
    
    expect(result.optimalSpread).toBeCloseTo(1.39077, 4);
    expect(result.optimalBid).toBeCloseTo(100 - (1.39077/2), 4);
    expect(result.optimalAsk).toBeCloseTo(100 + (1.39077/2), 4);
  });

  it("skews bounds negatively for long inventory (q > 0)", () => {
    const longInventory = { ...baseInventory, currentPosition: 10 };
    const result = engine.calculateQuotes(baseMarket, longInventory);
    
    expect(result.reservationPrice).toBe(99);
    expect(result.optimalSpread).toBeCloseTo(1.39077, 4);
    
    expect(result.optimalAsk).toBeCloseTo(99 + (1.39077/2), 4);
    expect(result.optimalBid).toBeCloseTo(99 - (1.39077/2), 4);
  });

  it("handles negative time bounds securely", () => {
    const lateInventory = { ...baseInventory, currentTime: 2.0, terminalTime: 1.0 };
    const result = engine.calculateQuotes(baseMarket, lateInventory);
    
    expect(result.reservationPrice).toBe(100); 
    expect(result.optimalSpread).toBeCloseTo(1.29077, 4);
  });
});

describe("Hawkes Toxicity Integration", () => {
  const connector = new HawkesConnector();
  
  const baseMarket: MarketParameters = {
    midPrice: 100,
    volatility: 1,
    executionOrderDensity: 1.5,
    liquidityFactor: 140,
  };

  const baseInventory = {
    currentPosition: 5,
    terminalTime: 1.0,
    currentTime: 0.0,
  };

  it("adjusts risk aversion minimally for low toxicity", () => {
    const resultNormal = connector.calculateAdjustedQuotes(
      { toxicityIndicator: 0.1, baseRiskAversion: 0.1 },
      baseMarket,
      baseInventory
    );

    const resultLowToxic = connector.calculateAdjustedQuotes(
      { toxicityIndicator: 0.5, baseRiskAversion: 0.1 },
      baseMarket,
      baseInventory
    );
    
    expect(resultLowToxic.optimalSpread).toBeGreaterThan(resultNormal.optimalSpread);
  });

  it("severely widens spreads and skews when toxicity spikes above 0.8", () => {
    const resultNormal = connector.calculateAdjustedQuotes(
      { toxicityIndicator: 0.7, baseRiskAversion: 0.1 },
      baseMarket,
      baseInventory
    );

    const resultSpike = connector.calculateAdjustedQuotes(
      { toxicityIndicator: 0.9, baseRiskAversion: 0.1 },
      baseMarket,
      baseInventory
    );

    expect(resultSpike.optimalSpread).toBeGreaterThan(resultNormal.optimalSpread * 1.08); // Spread widens demonstrably
    expect(resultSpike.reservationPrice).toBeLessThan(resultNormal.reservationPrice); // Skew becomes more defensive
  });
});
