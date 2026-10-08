import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MicrostructureToxicityGauge } from './microstructure-toxicity-gauge';

describe('MicrostructureToxicityGauge', () => {
  it('renders VPIN toxicity and OFI gauge values with status badge', () => {
    render(
      <MicrostructureToxicityGauge
        data={{
          ofiSignal: 0.42,
          vpinToxicity: 0.28,
          status: 'HEALTHY',
        }}
      />,
    );

    expect(screen.getByTestId('microstructure-toxicity-gauge')).toBeInTheDocument();
    expect(screen.getByText('HEALTHY')).toBeInTheDocument();
    expect(screen.getByText('28.0%')).toBeInTheDocument();
    expect(screen.getByText('+0.42')).toBeInTheDocument();
  });
});
