import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { L2DepthLadder } from './l2-depth-ladder';

describe('L2DepthLadder', () => {
  it('renders orderbook depth ladder with spread and price levels', () => {
    render(
      <L2DepthLadder
        data={{
          spreadUsd: 0.15,
          asks: [{ price: 100.1, size: 2.5, total: 2.5 }],
          bids: [{ price: 99.95, size: 3.0, total: 3.0 }],
        }}
      />,
    );

    expect(screen.getByTestId('l2-depth-ladder')).toBeInTheDocument();
    expect(screen.getByText('$0.15')).toBeInTheDocument();
    expect(screen.getByText('100.10')).toBeInTheDocument();
    expect(screen.getByText('99.95')).toBeInTheDocument();
  });
});
