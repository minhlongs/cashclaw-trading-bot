import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BotDetailConfig } from './bot-detail-config';

describe('BotDetailConfig', () => {
  describe('rendering', () => {
    it('renders save button', () => {
      render(<BotDetailConfig config={{ levels: 10 }} />);
      expect(screen.getByRole('button', { name: /save config/i })).toBeInTheDocument();
    });

    it('renders input for each config entry', () => {
      render(<BotDetailConfig config={{ levels: 10, capital_per_level_pct: 20 }} />);
      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs).toHaveLength(2);
    });

    it('renders config key as label', () => {
      render(<BotDetailConfig config={{ levels: 10 }} />);
      expect(screen.getByText('levels')).toBeInTheDocument();
    });

    it('renders multiple config keys', () => {
      render(<BotDetailConfig config={{ levels: 10, risk: 5, capital: 1000 }} />);
      expect(screen.getByText('levels')).toBeInTheDocument();
      expect(screen.getByText('risk')).toBeInTheDocument();
      expect(screen.getByText('capital')).toBeInTheDocument();
    });
  });

  describe('input values', () => {
    it('sets defaultValue from config value', () => {
      render(<BotDetailConfig config={{ levels: 10 }} />);
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveValue(10);
    });

    it('sets step to 0.1', () => {
      render(<BotDetailConfig config={{ levels: 10 }} />);
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveAttribute('step', '0.1');
    });

    it('handles zero values', () => {
      render(<BotDetailConfig config={{ drawdown: 0 }} />);
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveValue(0);
    });

    it('handles decimal values', () => {
      render(<BotDetailConfig config={{ rate: 0.5 }} />);
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveValue(0.5);
    });

    it('handles large values', () => {
      render(<BotDetailConfig config={{ capital: 999999 }} />);
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveValue(999999);
    });
  });

  describe('empty config', () => {
    it('renders only save button with empty config', () => {
      render(<BotDetailConfig config={{}} />);
      const inputs = screen.queryAllByRole('spinbutton');
      expect(inputs).toHaveLength(0);
      expect(screen.getByRole('button', { name: /save config/i })).toBeInTheDocument();
    });
  });

  describe('layout', () => {
    it('has grid layout with correct max width', () => {
      const { container } = render(<BotDetailConfig config={{ levels: 10 }} />);
      const grid = container.firstElementChild;
      expect(grid).toHaveClass('config-grid');
    });
  });
});
