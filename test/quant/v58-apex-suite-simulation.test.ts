import { describe, it, expect } from 'vitest';
import { ObizhaevaResilientLobEngine } from '../../src/tree/quantlib/execution/obizhaeva-resilient-lob-engine';
import { GrossmanStiglitzEngine } from '../../src/tree/quantlib/microstructure/grossman-stiglitz-engine';
import { AdmatiPfleidererEngine } from '../../src/tree/quantlib/microstructure/admati-pfleiderer-engine';
import { OharaOldfieldInventoryEngine } from '../../src/tree/quantlib/microstructure/ohara-oldfield-inventory-engine';

describe('Triad v58 Golden Apex Multi-Domain Quantitative Simulation', () => {
  it('runs cross-domain macro-microstructure simulation pipeline', () => {
    // 1. Grossman-Stiglitz information environment
    const infoEquilibrium = GrossmanStiglitzEngine.calculateEquilibrium({
      privateSignalCost: 0.05,
      riskTolerance: 2.0,
      fundamentalVariance: 1.5,
      noiseTradingVariance: 0.8,
    });
    expect(infoEquilibrium.priceInformativeness).toBeGreaterThan(0);

    // 2. Admati-Pfleiderer intraday volume & liquidity profile
    const volumeProfile = AdmatiPfleidererEngine.analyzeIntradayClustering({
      fundamentalVolatility: Math.sqrt(1.5),
      fixedExecutionCost: 0.002,
      sunshineDisclosureBonus: 0.0005,
      periods: [
        { periodIndex: 1, nondiscretionaryVolume: 1000, discretionaryTraders: 10, informedTraders: 2 },
        { periodIndex: 2, nondiscretionaryVolume: 4000, discretionaryTraders: 80, informedTraders: 15 },
        { periodIndex: 3, nondiscretionaryVolume: 1200, discretionaryTraders: 15, informedTraders: 3 },
      ],
    });
    expect(volumeProfile.highestLiquidityPeriod).toBe(2);

    // 3. Obizhaeva-Wang optimal liquidation across the clustered period
    const liquidation = ObizhaevaResilientLobEngine.calculateTrajectory({
      initialInventory: 500,
      horizon: 5,
      resilienceRate: 0.8,
      impactFactor: 0.005,
      steps: 5,
    });
    expect(liquidation.initialJump).toBeGreaterThan(0);
    expect(liquidation.terminalJump).toBeGreaterThan(0);
    expect(liquidation.schedule.length).toBe(6);

    // 4. O'Hara-Oldfield inventory quotes for counterparty market maker
    const quotes = OharaOldfieldInventoryEngine.calculateQuotes({
      midPrice: 150.0,
      inventory: 25,
      inventoryTarget: 0,
      carryingCostRate: 0.02,
      riskAversion: 0.05,
      assetVariance: 1.5,
      baselineSpread: 0.25,
    });
    expect(quotes.bidPrice).toBeLessThan(quotes.reservationPrice);
    expect(quotes.askPrice).toBeGreaterThan(quotes.reservationPrice);
    expect(quotes.inventorySkew).toBeGreaterThan(0);
  });
});
