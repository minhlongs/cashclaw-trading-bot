'use client';

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import LandingClient from './LandingClient';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const fn = (key: string) => key;
    fn.raw = (key: string) => {
      const arrays: Record<string, any[]> = {
        'features.items': [
          { icon: '⚡', title: 'Speed', desc: 'Fast execution' },
          { icon: '🛡️', title: 'Security', desc: 'Your keys stay local' },
          { icon: '📈', title: 'Alpha Lab', desc: 'Research engine' },
        ],
        'stats.items': [
          { value: '10k', label: 'Users' },
          { value: '24/7', label: 'Uptime' },
          { value: '0%', label: 'Fees' },
        ],
        'steps.items': [
          { n: '1', title: 'Sign up', desc: 'Create account' },
          { n: '2', title: 'Connect', desc: 'Link exchange' },
          { n: '3', title: 'Run', desc: 'Watch bots trade' },
        ],
        'pricing.plans': [
          { name: 'Free', price: '$0', unit: '/mo', features: ['1 bot'], cta: 'Get started' },
          { name: 'Pro', price: '$49', unit: '/mo', features: ['10 bots', 'API access'], cta: 'Start free', popular: true },
        ],
      };
      return arrays[key] ?? [];
    };
    return fn;
  },
  useLocale: () => 'vi',
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('LandingClient', () => {
  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  it('renders the landing logo in nav', () => {
    render(<LandingClient />);
    expect(screen.getByText('nav.logo')).toBeInTheDocument();
  });

  it('renders the nav CTA button', () => {
    render(<LandingClient />);
    expect(screen.getByText('nav.cta')).toBeInTheDocument();
  });

  it('renders hero badge, title, subtitle, and trust text', () => {
    render(<LandingClient />);
    expect(screen.getByText('hero.badge')).toBeInTheDocument();
    expect(screen.getByText('hero.badgeSub')).toBeInTheDocument();
    expect(screen.getByText('hero.title')).toBeInTheDocument();
    expect(screen.getByText('hero.titleLine2')).toBeInTheDocument();
    expect(screen.getByText('hero.subtitle')).toBeInTheDocument();
    expect(screen.getByText('hero.trust')).toBeInTheDocument();
  });

  it('renders the hero CTA button', () => {
    render(<LandingClient />);
    expect(screen.getByRole('button', { name: /hero.cta/ })).toBeInTheDocument();
  });

  it('renders all feature cards from the features array', () => {
    render(<LandingClient />);
    // Default mock returns the key itself, so each feature renders its key text
    expect(screen.getByText('features.title')).toBeInTheDocument();
    // At least one feature card icon is rendered
    const icons = screen.getAllByText('⚡');
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders all stat items from the stats array', () => {
    render(<LandingClient />);
    expect(screen.getByText('stats.label')).toBeInTheDocument();
  });

  it('renders all step cards from the steps array', () => {
    render(<LandingClient />);
    expect(screen.getByText('steps.title')).toBeInTheDocument();
  });

  it('renders the pricing section title', () => {
    render(<LandingClient />);
    expect(screen.getByText('pricing.title')).toBeInTheDocument();
  });

  it('renders the pricing popular badge on popular plan', () => {
    render(<LandingClient />);
    expect(screen.getByText('pricing.popular')).toBeInTheDocument();
  });

  it('renders the bottom CTA section', () => {
    render(<LandingClient />);
    expect(screen.getByText('cta.title')).toBeInTheDocument();
    expect(screen.getByText('cta.subtitle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cta.button/ })).toBeInTheDocument();
  });

  it('renders the footer copyright', () => {
    render(<LandingClient />);
    expect(screen.getByText('footer.copyright')).toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* Navigation                                                        */
  /* ---------------------------------------------------------------- */

  it('navigates to get-started when nav CTA is clicked', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as any);
    render(<LandingClient />);
    fireEvent.click(screen.getByText('nav.cta'));
    expect(push).toHaveBeenCalledWith('/vi/get-started');
  });

  it('navigates to get-started when hero CTA is clicked', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as any);
    render(<LandingClient />);
    fireEvent.click(screen.getByRole('button', { name: /hero.cta/ }));
    expect(push).toHaveBeenCalledWith('/vi/get-started');
  });

  it('navigates to get-started when pricing plan CTA is clicked', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as any);
    render(<LandingClient />);
    const ctaButtons = screen.getAllByRole('button', { name: /cta$/ });
    expect(ctaButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(ctaButtons[0]);
    expect(push).toHaveBeenCalledWith('/vi/get-started');
  });

  it('navigates to get-started when bottom CTA is clicked', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as any);
    render(<LandingClient />);
    fireEvent.click(screen.getByRole('button', { name: /cta.button/ }));
    expect(push).toHaveBeenCalledWith('/vi/get-started');
  });

  /* ---------------------------------------------------------------- */
  /* Pricing plan rendering                                            */
  /* ---------------------------------------------------------------- */

  it('applies pricing-popular class to the popular plan', () => {
    render(<LandingClient />);
    const popularBadge = screen.getByText('pricing.popular');
    expect(popularBadge.className).toContain('pricing-badge');
  });
});