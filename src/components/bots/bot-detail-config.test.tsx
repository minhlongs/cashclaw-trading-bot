import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotDetailConfig } from './bot-detail-config';

describe('BotDetailConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering and layout', () => {
    it('renders save button and input for each config entry with grid layout', () => {
      const { container } = render(<BotDetailConfig config={{ levels: 10, risk: 5 }} />);
      expect(screen.getByRole('button', { name: /save config/i })).toBeInTheDocument();
      expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
      expect(screen.getByText('levels')).toBeInTheDocument();
      expect(screen.getByText('risk')).toBeInTheDocument();
      expect(container.firstElementChild).toHaveClass('config-grid');
    });

    it('sets initial values and step attribute correctly', () => {
      render(<BotDetailConfig config={{ levels: 10, rate: 0.5, drawdown: 0 }} />);
      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs[0]).toHaveValue(10);
      expect(inputs[0]).toHaveAttribute('step', '0.1');
      expect(inputs[1]).toHaveValue(0.5);
      expect(inputs[2]).toHaveValue(0);
    });

    it('renders empty config with only save button', () => {
      render(<BotDetailConfig config={{}} />);
      expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
      expect(screen.getByRole('button', { name: /save config/i })).toBeInTheDocument();
    });
  });

  describe('input editing', () => {
    it('updates input value on user typing', async () => {
      const user = userEvent.setup();
      render(<BotDetailConfig config={{ levels: 10 }} />);
      const input = screen.getByRole('spinbutton');
      await user.clear(input);
      await user.type(input, '15');
      expect(input).toHaveValue(15);
    });
  });

  describe('save handling and async state', () => {
    it('saves successfully via PATCH and invokes onConfigSaved', async () => {
      const user = userEvent.setup();
      const onConfigSaved = vi.fn();
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: { config: { levels: 12 } } }), { status: 200 }),
      );

      render(<BotDetailConfig config={{ levels: 10 }} botId="bot-1" onConfigSaved={onConfigSaved} />);
      const input = screen.getByRole('spinbutton');
      await user.clear(input);
      await user.type(input, '12');

      await user.click(screen.getByRole('button', { name: /save config/i }));

      expect(fetchSpy).toHaveBeenCalledWith('/api/bots/bot-1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ config: { levels: 12 } }),
      }));
      expect(onConfigSaved).toHaveBeenCalledWith({ levels: 12 });
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Dismiss alert
      await user.click(screen.getByRole('button', { name: /dismiss message/i }));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('handles save error from API and displays error alert', async () => {
      const user = userEvent.setup();
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: 'Database locked' }), { status: 400 }),
      );

      render(<BotDetailConfig config={{ levels: 10 }} botId="bot-1" />);
      await user.click(screen.getByRole('button', { name: /save config/i }));

      const alert = await screen.findByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Database locked');
    });

    it('disables button and inputs while save is in flight', async () => {
      const user = userEvent.setup();
      let resolvePromise: (v: Response) => void;
      vi.spyOn(global, 'fetch').mockReturnValue(new Promise((resolve) => {
        resolvePromise = resolve;
      }));

      render(<BotDetailConfig config={{ levels: 10 }} botId="bot-1" />);
      await user.click(screen.getByRole('button', { name: /save config/i }));

      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
      expect(screen.getByRole('spinbutton')).toBeDisabled();

      resolvePromise!(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await screen.findByRole('alert');
      expect(screen.getByRole('button', { name: /save config/i })).not.toBeDisabled();
    });

    it('saves directly without fetch when botId is not provided', async () => {
      const user = userEvent.setup();
      const onConfigSaved = vi.fn();
      const fetchSpy = vi.spyOn(global, 'fetch');

      render(<BotDetailConfig config={{ levels: 10 }} onConfigSaved={onConfigSaved} />);
      await user.click(screen.getByRole('button', { name: /save config/i }));

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(onConfigSaved).toHaveBeenCalledWith({ levels: 10 });
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
