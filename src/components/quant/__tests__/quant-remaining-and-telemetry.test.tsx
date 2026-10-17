import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CorrelationMatrixHeatmap } from '../correlation-matrix-heatmap';
import { ExecutionLedgerSimulator } from '../execution-ledger-simulator';
import { DataQualityGateInspector } from '../data-quality-gate-inspector';
import { SovereignEnclaveAttestation } from '../sovereign-enclave-attestation';
import { RelativeValueBasisMonitor } from '../relative-value-basis-monitor';
import { PortfolioCvarStressSimulator } from '../portfolio-cvar-stress-simulator';
import { OrderbookImbalanceLobPredictor } from '../orderbook-imbalance-lob-predictor';
import { RoughVolatilityHurstDetector } from '../rough-volatility-hurst-detector';
import CorrelationMatrixPage, { generateStaticParams as genCorrParams } from '@/app/[locale]/(dashboard)/correlation-matrix/page';
import ExecutionLedgerPage, { generateStaticParams as genExecParams } from '@/app/[locale]/(dashboard)/execution-ledger/page';
import DataQualityGatePage, { generateStaticParams as genQualityParams } from '@/app/[locale]/(dashboard)/data-quality-gate/page';
import SovereignEnclavePage, { generateStaticParams as genEnclaveParams } from '@/app/[locale]/(dashboard)/sovereign-enclave/page';
import RelativeValueBasisPage, { generateStaticParams as genBasisParams } from '@/app/[locale]/(dashboard)/relative-value-basis/page';
import PortfolioCvarStressPage, { generateStaticParams as genCvarParams } from '@/app/[locale]/(dashboard)/portfolio-cvar-stress/page';
import OrderbookImbalanceLobPage, { generateStaticParams as genLobParams } from '@/app/[locale]/(dashboard)/orderbook-imbalance-lob/page';
import RoughVolatilityHurstPage, { generateStaticParams as genRoughParams } from '@/app/[locale]/(dashboard)/rough-volatility-hurst/page';
import { computeQuantTelemetrySnapshot } from '@/forest/dashboard/quant-telemetry-service';
import { GET as getQuantTelemetry } from '@/app/api/quant/telemetry/route';

describe('CashClaw Remaining & Wave 2 Stitch Screens + Real Domain Telemetry Engine', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'MONOTONICITY' }));
    expect(screen.getByText('DATA_INVALID')).toBeInTheDocument();
    expect(screen.getByText('FLAT_FENCE_ENGAGED')).toBeInTheDocument();
  });

  it('renders SovereignEnclaveAttestation, RelativeValueBasisMonitor, and PortfolioCvarStressSimulator', () => {
    render(<SovereignEnclaveAttestation />);
    fireEvent.click(screen.getByRole('button', { name: 'Simulate Tamper' }));
    expect(screen.getByText('CHAIN_MISMATCH_HALT')).toBeInTheDocument();

    render(<RelativeValueBasisMonitor />);
    fireEvent.click(screen.getByRole('button', { name: 'MEAN_REVERT' }));
    expect(screen.getByText('SOL-PERP / ETH-PERP')).toBeInTheDocument();

    render(<PortfolioCvarStressSimulator />);
    fireEvent.click(screen.getByRole('button', { name: 'EXCHANGE_OUTAGE' }));
    expect(screen.getByText('HALT_CIRCUIT_OPEN')).toBeInTheDocument();
  });

  it('renders Wave 2 OrderbookImbalanceLobPredictor & RoughVolatilityHurstDetector', () => {
    render(<OrderbookImbalanceLobPredictor />);
    expect(screen.getByRole('region', { name: /L3 Orderbook Queue Imbalance and Hawkes Arrival Intensity Predictor/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /SUPERCRITICAL/i }));
    expect(screen.getByText('HALT_TOXIC_SWEEP')).toBeInTheDocument();

    render(<RoughVolatilityHurstDetector />);
    expect(screen.getByRole('region', { name: /Gatheral Rough Volatility Hurst Exponent and Bipower Jump Detector/i })).toBeInTheDocument();
    expect(screen.getByText('ROUGH_FRACTIONAL (H<0.45)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'SMOOTH_DIFFUSION' }));
    expect(screen.getByText('SMOOTH_BROWNIAN')).toBeInTheDocument();
  });

  it('verifies all App Router pages, GET /api/quant/telemetry, and <= 120 LOC modularization', async () => {
    const expected = [{ locale: 'vi' }, { locale: 'en' }];
    for (const fn of [genCorrParams, genExecParams, genQualityParams, genEnclaveParams, genBasisParams, genCvarParams, genLobParams, genRoughParams]) {
      expect(fn()).toEqual(expected);
    }

    render(<CorrelationMatrixPage />);
    render(<ExecutionLedgerPage />);
    render(<DataQualityGatePage />);
    render(<SovereignEnclavePage />);
    render(<RelativeValueBasisPage />);
    render(<PortfolioCvarStressPage />);
    render(<OrderbookImbalanceLobPage />);
    render(<RoughVolatilityHurstPage />);

    const snapshot = computeQuantTelemetrySnapshot();
    expect(snapshot.paperOnly).toBe(true);
    expect(snapshot.hawkesLob.isStationary).toBe(true);
    expect(snapshot.roughVolatility.isRoughRegime).toBe(true);

    const response = await getQuantTelemetry(
      new Request('http://localhost:3000/api/quant/telemetry?costTier=EXTREME&faultMode=MONOTONICITY&trials=36'),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      paperOnly: boolean;
      hawkesLob: { intensityLambda: number };
      roughVolatility: { hurstExponent: number };
    };
    expect(body.paperOnly).toBe(true);
    expect(body.hawkesLob.intensityLambda).toBeGreaterThan(1);
    expect(body.roughVolatility.hurstExponent).toBeLessThan(0.45);

    const quantDir = path.join(process.cwd(), 'src/components/quant');
    const files = fs.readdirSync(quantDir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(quantDir, file), 'utf8');
      const lineCount = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
      expect(lineCount, `${file} exceeds 120 lines (${lineCount})`).toBeLessThanOrEqual(120);
    }
  });
});
