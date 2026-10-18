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
import { LeadlagHayashiYoshidaMatrix } from '../leadlag-hayashi-yoshida-matrix';
import { OptimalExecutionAlmgrenChrissCockpit } from '../optimal-execution-almgren-chriss-cockpit';
import CorrelationMatrixPage, { generateStaticParams as genCorrParams } from '@/app/[locale]/(dashboard)/correlation-matrix/page';
import ExecutionLedgerPage, { generateStaticParams as genExecParams } from '@/app/[locale]/(dashboard)/execution-ledger/page';
import DataQualityGatePage, { generateStaticParams as genQualityParams } from '@/app/[locale]/(dashboard)/data-quality-gate/page';
import SovereignEnclavePage, { generateStaticParams as genEnclaveParams } from '@/app/[locale]/(dashboard)/sovereign-enclave/page';
import RelativeValueBasisPage, { generateStaticParams as genBasisParams } from '@/app/[locale]/(dashboard)/relative-value-basis/page';
import PortfolioCvarStressPage, { generateStaticParams as genCvarParams } from '@/app/[locale]/(dashboard)/portfolio-cvar-stress/page';
import OrderbookImbalanceLobPage, { generateStaticParams as genLobParams } from '@/app/[locale]/(dashboard)/orderbook-imbalance-lob/page';
import RoughVolatilityHurstPage, { generateStaticParams as genRoughParams } from '@/app/[locale]/(dashboard)/rough-volatility-hurst/page';
import LeadlagHayashiYoshidaPage, { generateStaticParams as genLeadlagParams } from '@/app/[locale]/(dashboard)/leadlag-hayashi-yoshida/page';
import OptimalExecutionAlmgrenChrissPage, { generateStaticParams as genAcParams } from '@/app/[locale]/(dashboard)/optimal-execution-almgren-chriss/page';
import { computeQuantTelemetrySnapshot } from '@/forest/dashboard/quant-telemetry-service';
import { GET as getQuantTelemetry } from '@/app/api/quant/telemetry/route';

describe('CashClaw Remaining, Wave 2 & Wave 3 Stitch Screens + Real Domain Telemetry Engine', () => {
  it('renders CorrelationMatrixHeatmap, ExecutionLedgerSimulator, and DataQualityGateInspector', () => {
    render(<CorrelationMatrixHeatmap />);
    fireEvent.click(screen.getByRole('button', { name: '90d' }));
    expect(screen.getByText('90D Window')).toBeInTheDocument();

    render(<ExecutionLedgerSimulator />);
    fireEvent.click(screen.getByRole('button', { name: 'extreme' }));
    expect(screen.getByText('15 bps')).toBeInTheDocument();

    render(<DataQualityGateInspector />);
    fireEvent.click(screen.getByRole('button', { name: 'MONOTONICITY' }));
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

  it('renders Wave 2 & Wave 3 quant screens (Hawkes LOB, Rough Volatility, Hayashi-Yoshida, Almgren-Chriss)', () => {
    render(<OrderbookImbalanceLobPredictor />);
    fireEvent.click(screen.getByRole('button', { name: /SUPERCRITICAL/i }));
    expect(screen.getByText('HALT_TOXIC_SWEEP')).toBeInTheDocument();

    render(<RoughVolatilityHurstDetector />);
    fireEvent.click(screen.getByRole('button', { name: 'SMOOTH_DIFFUSION' }));
    expect(screen.getByText('SMOOTH_BROWNIAN')).toBeInTheDocument();

    render(<LeadlagHayashiYoshidaMatrix />);
    expect(screen.getByRole('region', { name: /Hayashi-Yoshida Asynchronous Lead-Lag Cross-Asset Matrix/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'SOL_PERP->AVAX_SPOT' }));
    expect(screen.getByText('SYNCHRONOUS_NO_LAG')).toBeInTheDocument();

    render(<OptimalExecutionAlmgrenChrissCockpit />);
    expect(screen.getByRole('region', { name: /Almgren-Chriss Optimal Execution Trajectory and Shortfall Cockpit/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'URGENT_LIQUIDATION' }));
    expect(screen.getByText('URGENT_FRONT_LOADED')).toBeInTheDocument();
  });

  it('verifies all App Router pages, GET /api/quant/telemetry Wave 3 fields, and <= 120 LOC limit', async () => {
    const expected = [{ locale: 'vi' }, { locale: 'en' }];
    for (const fn of [genCorrParams, genExecParams, genQualityParams, genEnclaveParams, genBasisParams, genCvarParams, genLobParams, genRoughParams, genLeadlagParams, genAcParams]) {
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
    render(<LeadlagHayashiYoshidaPage />);
    render(<OptimalExecutionAlmgrenChrissPage />);

    const snapshot = computeQuantTelemetrySnapshot();
    expect(snapshot.paperOnly).toBe(true);
    expect(snapshot.leadLagHayashiYoshida.optimalLagMs).toBeGreaterThan(0);
    expect(snapshot.almgrenChrissExecution.trajectory).toHaveLength(6);

    const response = await getQuantTelemetry(
      new Request('http://localhost:3000/api/quant/telemetry?costTier=EXTREME&faultMode=MONOTONICITY&trials=36'),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      paperOnly: boolean;
      leadLagHayashiYoshida: { optimalLagMs: number; isLeader: boolean };
      almgrenChrissExecution: { urgencyKappa: number; strategyClass: string };
    };
    expect(body.paperOnly).toBe(true);
    expect(body.leadLagHayashiYoshida.isLeader).toBe(true);
    expect(body.almgrenChrissExecution.urgencyKappa).toBeGreaterThan(0);
    expect(body.almgrenChrissExecution.strategyClass).toBe('BALANCED_AC_TRAJECTORY');

    for (const dir of ['src/components/quant', 'src/forest/dashboard']) {
      const fullDir = path.join(process.cwd(), dir);
      const files = fs.readdirSync(fullDir).filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));
      for (const file of files) {
        if (dir === 'src/forest/dashboard' && !file.startsWith('quant-')) continue;
        const content = fs.readFileSync(path.join(fullDir, file), 'utf8');
        const lineCount = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
        expect(lineCount, `${dir}/${file} exceeds 100 lines (${lineCount})`).toBeLessThanOrEqual(100);
      }
    }
  });
});
