import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeliberationTheater } from './deliberation-theater';

describe('DeliberationTheater — Gate G12 Governance & Negative-ROI Notice', () => {
  it('renders prominent G12 read-only critic banner and -$89.68 ablation verdict', () => {
    render(<DeliberationTheater />);
    const notice = screen.getByRole('note', { name: /Gate G12 Governance Notice/i });
    expect(notice).toHaveTextContent('READ-ONLY STRATEGY CRITIC — ZERO ORDER AUTHORITY');
    expect(notice).toHaveTextContent(
      'MULTI_AGENT_DEBATE NET ROI NEGATIVE (-$89.68 net drag — DISABLE_NEGATIVE_NET_ROI)',
    );
    expect(screen.getByText('DISABLE_NEGATIVE_NET_ROI')).toBeInTheDocument();
    expect(screen.queryByText('PROMOTED_TO_PAPER_SHADOW')).not.toBeInTheDocument();
  });

  it('supports stage filtering and risk veto toggling', () => {
    render(<DeliberationTheater />);
    fireEvent.click(screen.getByRole('button', { name: 'RISK_AUDIT' }));
    expect(screen.getByText('RISK_MANAGER')).toBeInTheDocument();
    expect(screen.queryByText('BULL_RESEARCHER')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Trigger Veto/i }));
    expect(screen.getByText('KILLED_BY_RISK_VETO')).toBeInTheDocument();
  });
});
