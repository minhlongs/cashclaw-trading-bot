import { NextResponse } from 'next/server';
import { type BacktestRunInput } from '@/forest/backtest/actions';
import { runBacktest } from '@/forest/backtest/engine';
import { fetchOHLCV } from '@/forest/backtest/data-fetcher';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BacktestRunInput;

    if (!body.botId || !body.exchange || !body.symbol || !body.config) {
      return NextResponse.json({ success: false, error: 'Missing required fields', candlesFetched: 0 }, { status: 400 });
    }

    const startMs = new Date(body.startDate).getTime();
    const endMs = new Date(body.endDate).getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      return NextResponse.json({ success: false, error: 'Invalid dates', candlesFetched: 0 }, { status: 400 });
    }

    const interval = body.interval ?? '1h';
    const candles = await fetchOHLCV(body.exchange, body.symbol, interval, startMs, endMs);

    if (candles.length < 2) {
      return NextResponse.json({ success: false, error: `Insufficient data: ${candles.length} candles`, candlesFetched: candles.length }, { status: 400 });
    }

    const result = runBacktest({
      config: body.config,
      candles,
      feePct: body.feePct ?? 0.1,
      slippagePct: body.slippagePct ?? 0.05,
      initialCapital: body.initialCapital ?? body.config.capital,
      botId: body.botId,
    });

    return NextResponse.json({ success: true, result, candlesFetched: candles.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: message, candlesFetched: 0 }, { status: 500 });
  }
}
