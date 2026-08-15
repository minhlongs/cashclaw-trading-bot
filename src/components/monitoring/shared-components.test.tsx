import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusDot, MetricRow } from './shared-components';
import { Activity } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  StatusDot                                                          */
/* ------------------------------------------------------------------ */
describe('StatusDot', () => {
  it('renders profit color when ok is true', () => {
    const { container } = render(<StatusDot ok />);
    const dot = container.querySelector('span')!;
    expect(dot.style.background).toBe('var(--color-profit)');
  });

  it('renders loss color when ok is false', () => {
    const { container } = render(<StatusDot ok={false} />);
    const dot = container.querySelector('span')!;
    expect(dot.style.background).toBe('var(--color-loss)');
  });

  it('has a box-shadow when ok', () => {
    const { container } = render(<StatusDot ok />);
    const dot = container.querySelector('span')!;
    expect(dot.style.boxShadow).toContain('rgba(0,212,170,0.5)');
  });

  it('has a red box-shadow when not ok', () => {
    const { container } = render(<StatusDot ok={false} />);
    const dot = container.querySelector('span')!;
    expect(dot.style.boxShadow).toContain('rgba(255,71,87,0.5)');
  });
});

/* ------------------------------------------------------------------ */
/*  MetricRow                                                          */
/* ------------------------------------------------------------------ */
describe('MetricRow', () => {
  it('renders label and value', () => {
    render(<MetricRow icon={Activity} label="Status" value="OK" />);
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('renders numeric value', () => {
    render(<MetricRow icon={Activity} label="Count" value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('uses default text-primary color when no color prop', () => {
    const { container } = render(
      <MetricRow icon={Activity} label="Test" value="val" />,
    );
    const valueSpan = container.querySelector('.mono') as HTMLElement;
    expect(valueSpan.hasAttribute('style')).toBe(true);
  });

  it('uses the provided color prop', () => {
    const { container } = render(
      <MetricRow icon={Activity} label="Test" value="val" color="#FF0000" />,
    );
    const valueSpan = container.querySelector('.mono') as HTMLElement;
    expect(valueSpan.hasAttribute('style')).toBe(true);
  });
});
