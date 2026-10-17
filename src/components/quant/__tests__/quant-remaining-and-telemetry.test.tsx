import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CorrelationMatrixHeatmap } from '../correlation-matrix-heatmap';
import { ExecutionLedgerSimulator } from '../execution-ledger-simulator';
import { DataQualityGateInspector } from '../data-quality-gate-inspector';
import { SovereignEnclaveAttestation } from '../sovereign-enclave-attestation';
import { RelativeValueBasisMonitor } from '../relative-value-basis-monitor';
import { PortfolioCvarStressSimulator } from '../portfolio-cvar-stress-simulator';
import CorrelationMatrixPage, { generateStaticParams as genCorrParams } from '@/app/[locale]/(dashboard)/correlation-matrix/page';
import ExecutionLedgerPage, { generateStaticParams as genExecParams } from '@/app/[locale]/(dashboard)/execution-ledger/page';
import DataQualityGatePage, { generateStaticParams as genQualityParams } from '@/app/[locale]/(dashboard)/data-quality-gate/page';
import SovereignEnclavePage, { generateStaticParams as genEnclaveParams } from '@/app/[locale]/(dashboard)/sovereign-enclave/page';
import RelativeValueBasisPage, { generateStaticParams as genBasisParams } from '@/app/[locale]/(dashboard)/relative-value-basis/page';
import PortfolioCvarStressPage, { generateStaticParams as genCvarParams } from '@/app/[locale]/(dashboard)/portfolio-cvar-stress/page';
import { computeQuantTelemetrySnapshot } from '@/forest/dashboard/quant-telemetry-service';
import { GET as getQuantTelemetry } from '@/app/api/quant/telemetry/route';

describe('CashClaw Remaining 6 Stitch Screens & Real Domain Telemetry Engine', () => {
  it('renders CorrelationMatrixHeatmap and switches 7d/30d/90d lookback windows', () => {
    render(<CorrelationMatrixHeatmap />);
    expect(screen.getByRole('region', { name: /Cross-Sectional Rolling Correlation Heatmap/i })).toBeInTheDocument();
    expect(screen.getByText('BTC/ETH')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    expect(screen.getByText('7D Window')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '90d' }));
    expect(screen.getByText('90D Window')).toBeInTheDocument();
  });

  it('renders ExecutionLedgerSimulator wired to resolveStressConfig and updates depth multiplier', () => {
    render(<ExecutionLedgerSimulator />);
    expect(screen.getByRole('region', { name: /Real-Time Paper Execution Ledger/i })).toBeInTheDocument();
    expect(screen.getByText('PAPER-ORD-901')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'extreme' }));
    expect(screen.getByText('15 bps')).toBeInTheDocument();

    const select = screen.getByLabelText(/Orderbook Depth Slippage Multiplier/i);
    fireEvent.change(select, { target: { value: '2.5' } });
    expect(screen.getByText('+112.5 bps')).toBeInTheDocument();
  });

  it('renders DataQualityGateInspector wired to validateCandleSeries and triggers FLAT_FENCE on fault', () => {
    render(<DataQualityGateInspector />);
    expect(screen.getByRole('region', { name: /OHLCV Data Quality Gate Inspector/i })).toBeInTheDocument();
    expect(screen.getByText('VALID')).toBeInTheDocument();
    expect(screen.getByText('SIGNAL_ALLOWED')).toBeInTheDocument();
    expect(screen.getByText('timestamp_monotonicity')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'MONOTONICITY' }));
    expect(screen.getByText('DATA_INVALID')).toBeInTheDocument();
    expect(screen.getByText('FLAT_FENCE_ENGAGED')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ZERO_VOLUME' }));
    expect(screen.getByText('DATA_INVALID')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'IMPOSSIBLE_OHLC' }));
    expect(screen.getByText('DATA_INVALID')).toBeInTheDocument();
  });

  it('renders SovereignEnclaveAttestation and simulates SHA-256 chain tamper', () => {
    render(<SovereignEnclaveAttestation />);
    expect(screen.getByRole('region', { name: /Sovereign Enclave Cryptographic Attestation/i })).toBeInTheDocument();
    expect(screen.getByText('VERIFIED_INTACT')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Simulate Tamper' }));
    expect(screen.getByText('CHAIN_MISMATCH_HALT')).toBeInTheDocument();
    expect(screen.getByText('deadbeef00000000')).toBeInTheDocument();
  });

  it('renders RelativeValueBasisMonitor and filters CARRY_LONG vs MEAN_REVERT', () => {
    render(<RelativeValueBasisMonitor />);
    expect(screen.getByRole('region', { name: /Cross-Exchange Relative-Value/i })).toBeInTheDocument();
    expect(screen.getByText('BTC-PERP / SPOT')).toBeInTheDocument();
    expect(screen.getByText('SOL-PERP / ETH-PERP')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'MEAN_REVERT' }));
    expect(screen.getByText('SOL-PERP / ETH-PERP')).toBeInTheDocument();
    expect(screen.queryByText('BTC-PERP / SPOT')).toBeNull();
  });

  it('renders PortfolioCvarStressSimulator and switches tail-risk shock scenarios', () => {
    render(<PortfolioCvarStressSimulator />);
    expect(screen.getByRole('region', { name: /Cross-Margin CVaR 99% Tail-Risk/i })).toBeInTheDocument();
    expect(screen.getByText('DELEVERAGE_TRIGGERED')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'EXCHANGE_OUTAGE' }));
    expect(screen.getByText('HALT_CIRCUIT_OPEN')).toBeInTheDocument();
  });

  it('verifies all 6 new App Router pages, generateStaticParams, and GET /api/quant/telemetry', async () => {
    const expected = [{ locale: 'vi' }, { locale: 'en' }];
    expect(genCorrParams()).toEqual(expected);
    expect(genExecParams()).toEqual(expected);
    expect(genQualityParams()).toEqual(expected);
    expect(genEnclaveParams()).toEqual(expected);
    expect(genBasisParams()).toEqual(expected);
    expect(genCvarParams()).toEqual(expected);

    render(<CorrelationMatrixPage />);
    render(<ExecutionLedgerPage />);
    render(<DataQualityGatePage />);
    render(<SovereignEnclavePage />);
    render(<RelativeValueBasisPage />);
    render(<PortfolioCvarStressPage />);

    const snapshot = computeQuantTelemetrySnapshot();
    expect(snapshot.paperOnly).toBe(true);
    expect(snapshot.adrInvariant).toBe('ADR-001');
    expect(snapshot.dataQuality.checkResults.length).toBeGreaterThanOrEqual(8);

    const response = await getQuantTelemetry(
      new Request('http://localhost:3000/api/quant/telemetry?costTier=EXTREME&faultMode=MONOTONICITY&trials=36'),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      paperOnly: boolean;
      regime: { totalFrictionBps: number };
      dataQuality: { status: string };
    };
    expect(body.paperOnly).toBe(true);
    expect(body.regime.totalFrictionBps).toBe(100);
    expect(body.dataQuality.status).toBe('DATA_INVALID');
  });
});
