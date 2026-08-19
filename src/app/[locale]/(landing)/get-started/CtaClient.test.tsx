'use client';

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import CtaClient from './CtaClient';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const fn = (key: string) => key;
    fn.raw = (key: string) => {
      const arrays: Record<string, any[]> = {
        'whatNext.items': [
          { icon: '🔑', title: 'API keys', desc: 'Connect your exchange' },
          { icon: '🤖', title: 'Create bot', desc: 'Pick a strategy' },
          { icon: '📊', title: 'Monitor', desc: 'Watch performance' },
        ],
        'guarantee.items': ['No credit card', 'Cancel anytime', 'Paper mode first'],
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

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('CtaClient', () => {
  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  it('renders the landing logo in nav', () => {
    render(<CtaClient />);
    expect(screen.getByText('nav.logo')).toBeInTheDocument();
  });

  it('renders the nav back button', () => {
    render(<CtaClient />);
    expect(screen.getByText('nav.back')).toBeInTheDocument();
  });

  it('renders hero icon, title, subtitle, and note', () => {
    render(<CtaClient />);
    expect(screen.getByText('hero.icon')).toBeInTheDocument();
    expect(screen.getByText('hero.title')).toBeInTheDocument();
    expect(screen.getByText('hero.subtitle')).toBeInTheDocument();
    expect(screen.getByText('hero.note')).toBeInTheDocument();
  });

  it('renders the hero create button', () => {
    render(<CtaClient />);
    expect(screen.getByText('hero.createButton')).toBeInTheDocument();
  });

  it('renders the whatNext section title', () => {
    render(<CtaClient />);
    expect(screen.getByText('whatNext.title')).toBeInTheDocument();
  });

  it('renders the guarantee section', () => {
    render(<CtaClient />);
    expect(screen.getByText('guarantee.icon')).toBeInTheDocument();
    expect(screen.getByText('guarantee.title')).toBeInTheDocument();
  });

  it('renders the final CTA section', () => {
    render(<CtaClient />);
    expect(screen.getByRole('button', { name: /cta.button/ })).toBeInTheDocument();
    expect(screen.getByText('cta.note')).toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /* Navigation                                                        */
  /* ---------------------------------------------------------------- */

  it('navigates back to home when nav back button is clicked', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as any);
    render(<CtaClient />);
    fireEvent.click(screen.getByText('nav.back'));
    expect(push).toHaveBeenCalledWith('/vi');
  });

  it('navigates to bots/new when hero create button is clicked', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as any);
    render(<CtaClient />);
    fireEvent.click(screen.getByText('hero.createButton'));
    expect(push).toHaveBeenCalledWith('/vi/bots/new');
  });

  it('navigates to bots/new when final CTA button is clicked', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as any);
    render(<CtaClient />);
    fireEvent.click(screen.getByRole('button', { name: /cta.button/ }));
    expect(push).toHaveBeenCalledWith('/vi/bots/new');
  });
});