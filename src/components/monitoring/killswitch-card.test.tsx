import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KillswitchCard } from './killswitch-card';
import type { KillswitchResponse } from './monitoring-types';

vi.mock('next-intl', () => {
  const map: Record<string, string> = {
    'monitoring.killswitch.title': 'Killswitch',
    'monitoring.killswitch.halted': 'Da kich hoat',
    'monitoring.killswitch.armed': 'San sang',
    'monitoring.killswitch.disabled': 'Tat',
    'monitoring.killswitch.haltedStatus': 'DA KICH HOAT',
    'monitoring.killswitch.armedStatus': 'Binh thuong',
    'monitoring.killswitch.disabledStatus': 'Tat',
    'monitoring.killswitch.status': 'Trang thai',
    'monitoring.killswitch.reason': 'Ly do: ',
    'monitoring.killswitch.haltedAt': 'Thoi gian kich hoat',
    'monitoring.killswitch.dailyPnl': 'PnL ngay',
    'monitoring.killswitch.consecutiveLosses': 'Lo lien tiep',
    'monitoring.killswitch.drawdown': 'Drawdown'
  };
  const resolve = (ns: string, key: string) => map[ns ? `${ns}.${key}` : key] ?? (ns ? `${ns}.${key}` : key);
  return {
    useLocale: () => 'vi',
    useTranslations: (ns?: string) => {
      const t = (key: string) => resolve(ns ?? '', key);
      t.raw = (key: string) => resolve(ns ?? '', key);
      return t;
    },
  };
});


vi.mock('lucide-react', () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon" {...props} />
  );
  return { Shield: Icon, Activity: Icon, TrendingDown: Icon, AlertTriangle: Icon };
});

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */
function makeKillswitch(overrides: Partial<KillswitchResponse> = {}): KillswitchResponse {
  return {
    enabled: true,
    halted: false,
    haltReason: null,
    haltedAt: null,
    dailyPnl: 50.25,
    consecutiveLosses: 1,
    currentDrawdown: 3.5,
    timestamp: Date.now(),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Badge state — halted takes precedence over enabled                 */
/* ------------------------------------------------------------------ */
describe('KillswitchCard badge state', () => {
  it('shows "San sang" with badge-profit when enabled and not halted', () => {
    render(<KillswitchCard killswitch={makeKillswitch({ enabled: true, halted: false })} />);
    expect(screen.getByText('San sang')).toHaveClass('badge-profit');
  });

  it('shows "Da kich hoat" with badge-error when halted', () => {
    render(<KillswitchCard killswitch={makeKillswitch({ enabled: true, halted: true })} />);
    expect(screen.getByText('Da kich hoat')).toHaveClass('badge-error');
  });

  it('shows "Tat" with badge-neutral when disabled', () => {
    render(<KillswitchCard killswitch={makeKillswitch({ enabled: false, halted: false })} />);
    // 'Tat' appears twice: the header badge and the "Trang thai" metric row.
    const badge = screen
      .getAllByText('Tat')
      .find((el) => el.className.includes('badge'))!;
    expect(badge).toHaveClass('badge-neutral');
  });

  it('prioritizes halted over disabled in the badge', () => {
    render(<KillswitchCard killswitch={makeKillswitch({ enabled: false, halted: true })} />);
    expect(screen.getByText('Da kich hoat')).toHaveClass('badge-error');
  });
});

/* ------------------------------------------------------------------ */
/*  Status row                                                         */
/* ------------------------------------------------------------------ */
describe('KillswitchCard status row', () => {
  it('renders "Binh thuong" status when enabled and not halted', () => {
    render(<KillswitchCard killswitch={makeKillswitch({ enabled: true, halted: false })} />);
    expect(screen.getByText('Trang thai')).toBeInTheDocument();
    expect(screen.getByText('Binh thuong')).toBeInTheDocument();
  });

  it('renders "DA KICH HOAT" status when halted', () => {
    render(<KillswitchCard killswitch={makeKillswitch({ halted: true })} />);
    expect(screen.getByText('DA KICH HOAT')).toBeInTheDocument();
  });

  it('renders "Tat" status when disabled', () => {
    render(<KillswitchCard killswitch={makeKillswitch({ enabled: false, halted: false })} />);
    const statusValue = screen
      .getAllByText('Tat')
      .find((el) => el.className.includes('mono'))!;
    expect(statusValue).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Halt reason — conditional block                                    */
/* ------------------------------------------------------------------ */
describe('KillswitchCard halt reason', () => {
  it('renders halt reason when halted with a reason', () => {
    const { container } = render(
      <KillswitchCard
        killswitch={makeKillswitch({ halted: true, haltReason: 'Too many losses' })}
      />,
    );
    expect(container.textContent).toContain('Ly do: Too many losses');
  });

  it('does not render halt reason when not halted', () => {
    const { container } = render(
      <KillswitchCard
        killswitch={makeKillswitch({ halted: false, haltReason: 'stale reason' })}
      />,
    );
    expect(container.textContent).not.toContain('Ly do:');
  });

  it('does not render halt reason when halted but reason is null', () => {
    const { container } = render(
      <KillswitchCard killswitch={makeKillswitch({ halted: true, haltReason: null })} />,
    );
    expect(container.textContent).not.toContain('Ly do:');
  });
});

/* ------------------------------------------------------------------ */
/*  Halted-at timestamp — conditional block                            */
/* ------------------------------------------------------------------ */
describe('KillswitchCard halted-at timestamp', () => {
  it('renders the halt time when halted with haltedAt set', () => {
    render(
      <KillswitchCard
        killswitch={makeKillswitch({
          halted: true,
          haltedAt: new Date('2026-08-15T14:30:45Z').getTime(),
        })}
      />,
    );
    expect(screen.getByText('Thoi gian kich hoat')).toBeInTheDocument();
  });

  it('omits the halt time when haltedAt is null', () => {
    render(<KillswitchCard killswitch={makeKillswitch({ halted: true, haltedAt: null })} />);
    expect(screen.queryByText('Thoi gian kich hoat')).not.toBeInTheDocument();
  });

  it('omits the halt time when not halted even if haltedAt is set', () => {
    render(
      <KillswitchCard
        killswitch={makeKillswitch({ halted: false, haltedAt: Date.now() })}
      />,
    );
    expect(screen.queryByText('Thoi gian kich hoat')).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Metrics                                                            */
/* ------------------------------------------------------------------ */
describe('KillswitchCard metrics', () => {
  it('renders positive daily PnL with a plus sign', () => {
    render(<KillswitchCard killswitch={makeKillswitch({ dailyPnl: 50.25 })} />);
    expect(screen.getByText('PnL ngay')).toBeInTheDocument();
    expect(screen.getByText('+$50.25')).toBeInTheDocument();
  });

  // NOTE: formatPnl drops the minus sign for negatives — a loss renders as "$120.50".
  it('renders negative daily PnL without a minus sign', () => {
    render(<KillswitchCard killswitch={makeKillswitch({ dailyPnl: -120.5 })} />);
    expect(screen.getByText('$120.50')).toBeInTheDocument();
  });

  it('renders consecutive losses', () => {
    render(<KillswitchCard killswitch={makeKillswitch({ consecutiveLosses: 5 })} />);
    expect(screen.getByText('Lo lien tiep')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('highlights consecutive losses at the warning threshold of 3', () => {
    const { container } = render(
      <KillswitchCard killswitch={makeKillswitch({ consecutiveLosses: 3 })} />,
    );
    const value = Array.from(container.querySelectorAll('.mono')).find(
      (el) => el.textContent === '3',
    ) as HTMLElement;
    expect(value).toHaveClass('text-warning');
  });

  it('does not highlight consecutive losses below the threshold', () => {
    const { container } = render(
      <KillswitchCard killswitch={makeKillswitch({ consecutiveLosses: 2 })} />,
    );
    const value = Array.from(container.querySelectorAll('.mono')).find(
      (el) => el.textContent === '2',
    ) as HTMLElement;
    expect(value).toHaveClass('text-primary');
  });

  it('renders drawdown to one decimal place', () => {
    render(<KillswitchCard killswitch={makeKillswitch({ currentDrawdown: 3.456 })} />);
    expect(screen.getByText('Drawdown')).toBeInTheDocument();
    expect(screen.getByText('3.5%')).toBeInTheDocument();
  });

  it('highlights drawdown above 10 percent', () => {
    const { container } = render(
      <KillswitchCard killswitch={makeKillswitch({ currentDrawdown: 15.3 })} />,
    );
    const value = Array.from(container.querySelectorAll('.mono')).find(
      (el) => el.textContent === '15.3%',
    ) as HTMLElement;
    expect(value).toHaveClass('text-loss');
  });

  it('does not highlight drawdown at exactly 10 percent', () => {
    const { container } = render(
      <KillswitchCard killswitch={makeKillswitch({ currentDrawdown: 10 })} />,
    );
    const value = Array.from(container.querySelectorAll('.mono')).find(
      (el) => el.textContent === '10.0%',
    ) as HTMLElement;
    expect(value).toHaveClass('text-primary');
  });
});
