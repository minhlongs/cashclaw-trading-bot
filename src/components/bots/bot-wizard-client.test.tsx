import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotWizardClient } from './bot-wizard-client';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next-intl', () => {
  const map: Record<string, string> = {
    'botWizard.next': 'Next',
    'botWizard.back': 'Back',
    'botWizard.createBot': 'Create Bot',
    'botWizard.title.basic': 'Basic Info',
    'botWizard.title.strategy': 'Choose Strategy',
    'botWizard.title.gridConfig': 'Grid Config',
    'botWizard.title.meanRevConfig': 'Mean Reversion Config',
    'botWizard.title.review': 'Review',
    'botWizard.strategies.grid.label': 'Grid Trading',
    'botWizard.strategies.grid.desc': 'Multi-level limit orders',
    'botWizard.strategies.mean_reversion.label': 'Mean Reversion',
    'botWizard.strategies.mean_reversion.desc': 'Bollinger Bands + RSI',
  };
  return {
    useLocale: () => 'en',
    useTranslations: (ns?: string) => {
      const t = (key: string) => map[ns ? `${ns}.${key}` : key] ?? (ns ? `${ns}.${key}` : key);
      t.raw = (key: string) => map[ns ? `${ns}.${key}` : key] ?? (ns ? `${ns}.${key}` : key);
      return t;
    },
  };
});

const originalFetch = global.fetch;
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn();
  global.fetch = fetchSpy as unknown as typeof fetch;
});
afterEach(() => { global.fetch = originalFetch; });

async function fillBasic(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByPlaceholderText('BTC Grid v2'), 'Grid Bot');
  await user.selectOptions(screen.getAllByRole('combobox')[0], 'BTC/USDT');
  await user.selectOptions(screen.getAllByRole('combobox')[1], 'binance');
}

describe('BotWizardClient', () => {
  it('renders step 1 header with progress', () => {
    render(<BotWizardClient />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('/ 4')).toBeInTheDocument();
  });

  it('next button is disabled when basic fields are empty', () => {
    render(<BotWizardClient />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('advances to strategy step once basic fields are set', async () => {
    const user = userEvent.setup();
    render(<BotWizardClient />);
    await fillBasic(user);
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/choose strategy/i)).toBeInTheDocument();
  });

  it('goes back from strategy step to basic step', async () => {
    const user = userEvent.setup();
    render(<BotWizardClient />);
    await fillBasic(user);
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByPlaceholderText('BTC Grid v2')).toBeInTheDocument();
  });

  it('walks through all steps to review', async () => {
    const user = userEvent.setup();
    render(<BotWizardClient />);
    await fillBasic(user);
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByText('Grid Trading'));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: /review/i })).toBeInTheDocument();
  });
});
