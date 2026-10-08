import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FleetRiskRadarCard } from './fleet-risk-radar-card';

describe('FleetRiskRadarCard', () => {
  it('renders HRP allocation, Kelly leverage and circuit breaker status', () => {
    render(
      <FleetRiskRadarCard
        data={{
          fractionalKellyLeverage: 1.45,
          circuitBreakerDrawdownPct: 0.04,
          circuitBreakerMaxPct: 0.15,
          isTriggered: false,
          strategyWeights: [
            { strategy: 'Funding Arb', weightPct: 60 },
            { strategy: 'Grid Scalper', weightPct: 40 },
          ],
        }}
      />,
    );

    expect(screen.getByTestId('fleet-risk-radar-card')).toBeInTheDocument();
    expect(screen.getByText('NORMAL')).toBeInTheDocument();
    expect(screen.getByText('1.45x')).toBeInTheDocument();
    expect(screen.getByText('Funding Arb')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
  });
});
