import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotDetailClient } from './bot-detail-client';
import type { BotDetailData, TradeRow } from '@/forest/dashboard/actions';

vi.mock('lucide-react', () => {
  const Icon = (p: React.SVGProps<SVGSVGElement>) => <svg data-testid="icon" {...p} />;
  return {
    ArrowLeft: Icon, Play: Icon, Pause: Icon, RotateCcw: Icon, Settings2: Icon,
    TrendingUp: Icon, TrendingDown: Icon, ArrowUp: Icon, ArrowDown: Icon,
    Loader2: (p: React.SVGProps<SVGSVGElement>) => <svg data-testid="loader-icon" {...p} />,
  };
});
vi.mock('next/link', () => ({
  default: ({ children, href, ...p }: { children: React.ReactNode; href: string }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock('./pair-price-badge', () => ({ PairPriceBadge: () => <div data-testid="pair-price-badge" /> }));
vi.mock('next-intl', () => {
  const m: Record<string, string> = {
    'botDetail.resume': 'Resume', 'botDetail.pause': 'Pause', 'botDetail.reset': 'Reset',
    'botDetail.config': 'Config', 'botDetail.actionFailed': 'Action failed',
    'botDetail.totalPnl': 'Total P&L', 'botDetail.winRate': 'Win Rate',
    'botDetail.capitalUsed': 'Capital Used', 'botDetail.maxDrawdown': 'Max Drawdown',
    'botDetail.maxDrawdownLimit': '20% limit', 'botDetail.saveConfig': 'Save Config',
    'botDetail.saving': 'Saving...', 'botDetail.configSaved': 'Configuration updated successfully',
  };
  return {
    useTranslations: (ns?: string) => (k: string) => m[ns ? `${ns}.${k}` : k] ?? (ns ? `${ns}.${k}` : k),
    useLocale: () => 'vi',
  };
});

function makeBot(o: Partial<BotDetailData> = {}): BotDetailData {
  return {
    id: 'bot-1', name: 'Grid Bot', strategy: 'grid', pair: 'BTC/USDT', exchange: 'binance',
    botStatus: 'live_running', totalPnl: 150.75, winCount: 10, lossCount: 3, capitalAllocated: 5000,
    capitalUsed: 3000, maxDrawdownPct: 5.2, startedAt: 1700000000000, updatedAt: 1700100000000,
    config: { levels: 10, capital_per_level_pct: 20 }, ...o,
  };
}

describe('BotDetailClient', () => {
  const bot = makeBot();
  const trades: TradeRow[] = [
    { id: 't1', side: 'buy', price: 42000, quantity: 0.5, pnl: 120.5, status: 'filled', openedAt: 1700000000000 },
    { id: 't2', side: 'sell', price: 43000, quantity: 0.5, pnl: -50, status: 'filled', openedAt: 1700010000000 },
  ];
  beforeEach(() => { vi.restoreAllMocks(); });

  it('renders bot metadata, status variants, badges, and back link', () => {
    const { container, unmount } = render(<BotDetailClient bot={bot} trades={trades} />);
    expect(screen.getByRole('heading', { name: 'Grid Bot' })).toBeInTheDocument();
    expect(screen.getAllByText('live_running').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('grid')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to bots/i })).toHaveAttribute('href', '/bots');
    expect(container.querySelector('.badge-running')).toBeInTheDocument();
    unmount();
    const { container: cPaused } = render(<BotDetailClient bot={makeBot({ botStatus: 'paused' })} />);
    expect(cPaused.querySelector('.badge-paused')).toBeInTheDocument();
    const { container: cDraft } = render(<BotDetailClient bot={makeBot({ botStatus: 'draft' })} />);
    expect(cDraft.querySelector('.badge-neutral')).toBeInTheDocument();
  });

  it('renders all three tabs and allows switching content views', async () => {
    const user = userEvent.setup();
    render(<BotDetailClient bot={bot} trades={trades} />);
    const tabs = document.body.querySelector<HTMLElement>('.tabs')!;
    expect(within(tabs).getByRole('button', { name: 'Overview' })).toBeInTheDocument();
    expect(within(tabs).getByRole('button', { name: 'Trade History' })).toBeInTheDocument();
    expect(within(tabs).getByRole('button', { name: 'Config' })).toBeInTheDocument();
    expect(within(tabs).getByRole('button', { name: 'Overview' }).className).toContain('active');
    await user.click(within(tabs).getByRole('button', { name: 'Trade History' }));
    expect(within(tabs).getByRole('button', { name: 'Trade History' }).className).toContain('active');
    expect(screen.getByText('buy')).toBeInTheDocument();
    await user.click(within(tabs).getByRole('button', { name: 'Config' }));
    expect(within(tabs).getByRole('button', { name: 'Config' }).className).toContain('active');
    expect(screen.getByText('levels')).toBeInTheDocument();
    await user.click(within(tabs).getByRole('button', { name: 'Overview' }));
    expect(within(tabs).getByRole('button', { name: 'Overview' }).className).toContain('active');
  });

  it('renders KPI metrics and handles empty trades list', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BotDetailClient bot={bot} trades={trades} />);
    expect(screen.getByText('Total P&L')).toBeInTheDocument();
    expect(screen.getByText('Win Rate')).toBeInTheDocument();
    unmount();
    render(<BotDetailClient bot={bot} trades={[]} />);
    const tabs = document.body.querySelector<HTMLElement>('.tabs')!;
    await user.click(within(tabs).getByRole('button', { name: 'Trade History' }));
    expect(screen.getByText('No trades yet')).toBeInTheDocument();
  });

  it('renders control buttons and switches to config tab on Config click', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(<BotDetailClient bot={bot} trades={trades} />);
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /config/i }).length).toBeGreaterThanOrEqual(2);
    await user.click(screen.getAllByRole('button', { name: /config/i })[0]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByText('levels')).toBeInTheDocument();
  });

  it('triggers POST resume/pause/stop and updates status reactively', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true })))
    );
    const { unmount } = render(<BotDetailClient bot={makeBot({ botStatus: 'paused' })} />);
    await user.click(screen.getByRole('button', { name: /resume/i }));
    expect(fetchSpy).toHaveBeenCalledWith('/api/bots/bot-1', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ action: 'resume' }),
    }));
    expect(screen.getAllByText('live_running').length).toBeGreaterThanOrEqual(1);
    unmount();
    render(<BotDetailClient bot={bot} />);
    await user.click(screen.getByRole('button', { name: /pause/i }));
    expect(fetchSpy).toHaveBeenCalledWith('/api/bots/bot-1', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ action: 'pause' }),
    }));
    expect(screen.getAllByText('paused').length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(fetchSpy).toHaveBeenCalledWith('/api/bots/bot-1', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ action: 'stop' }),
    }));
    expect(screen.getAllByText('stopped').length).toBeGreaterThanOrEqual(1);
  });

  it('disables buttons during in-flight action and displays error alert on failure', async () => {
    const user = userEvent.setup();
    let resolvePromise: (v: Response) => void;
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise<Response>((r) => { resolvePromise = r; }));
    const { unmount } = render(<BotDetailClient bot={bot} />);
    await user.click(screen.getByRole('button', { name: /pause/i }));
    expect(screen.getByRole('button', { name: /resume/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /pause/i })).toBeDisabled();
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    resolvePromise!(new Response(JSON.stringify({ ok: true })));
    unmount();
    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'Killswitch halted' }), { status: 400 }))
    );
    render(<BotDetailClient bot={bot} />);
    await user.click(screen.getByRole('button', { name: /pause/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Killswitch halted');
    await user.click(screen.getByRole('button', { name: /dismiss error/i }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('passes botId and updates config state when onConfigSaved is invoked', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true, data: { config: { levels: 25 } } })))
    );
    render(<BotDetailClient bot={bot} />);
    const tabs = document.body.querySelector<HTMLElement>('.tabs')!;
    await user.click(within(tabs).getByRole('button', { name: 'Config' }));

    const input = screen.getAllByRole('spinbutton')[0];
    await user.clear(input);
    await user.type(input, '25');
    await user.click(screen.getByRole('button', { name: /save config/i }));

    expect(fetchSpy).toHaveBeenCalledWith('/api/bots/bot-1', expect.objectContaining({
      method: 'PATCH',
    }));
  });
});
