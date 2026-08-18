#!/usr/bin/env npx tsx
// Hypothesis #18 — Funding Rate Momentum Decay
// Funding rate ROC predicts next-period price: LONG when ROC > threshold, SHORT when ROC < -threshold.
// Exit: maxHold bars OR |ROC| reverts near zero. Signal decays over time.
// Usage: npx tsx src/forest/backtest/funding-momentum-decay.ts
import { resolveStressConfig, applyCosts } from './cost-model';
import type { CostConfig } from './cost-model';
import type { Candle } from './ohlcv';
type Side = 'long' | 'short';
interface FP { ts: number; rate: number }
interface Config { rocPeriod: number; longTh: number; shortTh: number; maxHold: number }
interface Trade { entryTs: number; exitTs: number; side: Side; entryPx: number; exitPx: number; pnl: number; bars: number; exit: string }
interface Metrics { pnl: number; n: number; wr: number; exp: number; sharpe: number; ciLo: number; ciHi: number; pf: number; mdd: number }
interface SR { cfg: Config; all: Metrics; train: Metrics; test: Metrics }
const CAP = 10_000, H8 = 8 * 3600_000, NRESAMP = 1000, TRAIN_FRAC = 0.65, ZBAND = 5e-6;
const END_MS = new Date('2025-09-19T00:00:00Z').getTime(), DAYS = 730;
const NM: Metrics = { pnl: 0, n: 0, wr: 0, exp: 0, sharpe: 0, ciLo: 0, ciHi: 0, pf: 0, mdd: 0 };
async function fetchFunding(sym: string): Promise<FP[]> {
  const all: FP[] = [], from = END_MS - DAYS * 86_400_000;
  let cur = END_MS;
  while (cur > from) {
    const p = new URLSearchParams({ symbol: sym, startTime: String(Math.max(from, cur - 1000 * H8)), endTime: String(cur), limit: '1000' });
    const r = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?${p}`);
    if (!r.ok) throw new Error(`[${r.status}] funding`);
    const d = await r.json() as Array<{ fundingTime: number; fundingRate: string }>;
    if (!d.length) break;
    for (const x of d) all.unshift({ ts: x.fundingTime, rate: parseFloat(x.fundingRate) });
    cur = d[0].fundingTime - 1;
    await new Promise(r => setTimeout(r, 120));
  }
  return all;
}
async function fetchCandles(sym: string): Promise<Candle[]> {
  const all: Candle[] = [], from = END_MS - DAYS * 86_400_000;
  let cur = END_MS;
  while (cur > from) {
    const s = Math.max(from, cur - 1000 * H8);
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=8h&startTime=${s}&endTime=${cur}&limit=1000`);
    if (!r.ok) throw new Error(`[${r.status}] candles`);
    const d = await r.json() as Array<[number, string, string, string, string, string]>;
    if (!d.length) break;
    for (const k of d) all.unshift({ timestamp: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] });
    cur = d[0][0] - 1;
    await new Promise(r => setTimeout(r, 120));
  }
  return all;
}
/** Synthetic SOLUSDT-like data when Binance is unreachable (offline validation). */
function syntheticData(): { funding: FP[]; candles: Candle[] } {
  const periods = DAYS * 3;
  let price = 150;
  const funding: FP[] = [];
  const candles: Candle[] = [];
  let regime: 'pos' | 'neg' | 'neutral' = 'neutral';
  let cd = 0;
  for (let i = 0; i < periods; i++) {
    const ts = END_MS - (periods - i) * H8;
    cd--;
    if (cd <= 0) {
      const r = Math.random();
      if (r < 0.45) { regime = 'pos'; cd = 5 + Math.floor(Math.random() * 15); }
      else if (r < 0.75) { regime = 'neg'; cd = 3 + Math.floor(Math.random() * 10); }
      else { regime = 'neutral'; cd = 2 + Math.floor(Math.random() * 8); }
    }
    let rate: number;
    if (regime === 'pos') rate = 0.0001 + Math.random() * 0.0008;
    else if (regime === 'neg') rate = -(0.0001 + Math.random() * 0.0006);
    else rate = (Math.random() - 0.5) * 0.0002;
    funding.push({ ts, rate });
    price *= 1 + (Math.random() - 0.498) * 0.015;
    price = Math.max(10, price);
    candles.push({ timestamp: ts, open: price, high: price * 1.01, low: price * 0.99, close: price, volume: 0 });
  }
  return { funding, candles };
}
function roc(fp: FP[], period: number): number[] {
  const r = new Array(fp.length).fill(0);
  for (let i = period; i < fp.length; i++) r[i] = fp[i].rate - fp[i - period].rate;
  return r;
}
function bt(fp: FP[], rc: number[], cands: Candle[], cfg: Config, cc: CostConfig): Trade[] {
  const cm = new Map<number, Candle>(cands.map(c => [c.timestamp, c]));
  const trades: Trade[] = [];
  let pos: { side: Side; px: number; idx: number } | null = null;
  for (let i = Math.max(cfg.rocPeriod, 1); i < fp.length; i++) {
    const px = cm.get(fp[i].ts)?.close;
    if (px === undefined) continue;
    if (pos) {
      const h = i - pos.idx;
      let ex: string | null = h >= cfg.maxHold ? 'maxhold' : Math.abs(rc[i]) < ZBAND ? 'roc_zero' : null;
      if (ex) {
        const q = CAP / pos.px;
        const g = pos.side === 'long' ? (px - pos.px) * q : (pos.px - px) * q;
        trades.push({ entryTs: fp[pos.idx].ts, exitTs: fp[i].ts, side: pos.side, entryPx: pos.px, exitPx: px, pnl: applyCosts(g, px * q, cc).netPnl, bars: h, exit: ex });
        pos = null;
      }
    }
    if (!pos) {
      if (rc[i] > cfg.longTh) pos = { side: 'long', px, idx: i };
      else if (rc[i] < cfg.shortTh) pos = { side: 'short', px, idx: i };
    }
  }
  if (pos) {
    const lp = cm.get(fp[fp.length - 1].ts)?.close ?? 0;
    const q = CAP / pos.px;
    const g = pos.side === 'long' ? (lp - pos.px) * q : (pos.px - lp) * q;
    trades.push({ entryTs: fp[pos.idx].ts, exitTs: fp[fp.length - 1].ts, side: pos.side, entryPx: pos.px, exitPx: lp, pnl: applyCosts(g, lp * q, cc).netPnl, bars: fp.length - 1 - pos.idx, exit: 'eod' });
  }
  return trades;
}
// ── Metrics ────────────────────────────────────────────────────────────────
function bci(s: number[]): { lo: number; hi: number } { if (s.length < 3) return { lo: 0, hi: 0 }; const m: number[] = []; for (let r = 0; r < NRESAMP; r++) { let sm = 0; for (let i = 0; i < s.length; i++) sm += s[Math.floor(Math.random() * s.length)]; m.push(sm / s.length); } m.sort((a, b) => a - b); return { lo: m[Math.floor(NRESAMP * 0.025)], hi: m[Math.floor(NRESAMP * 0.975)] }; }
function metrics(ts: Trade[]): Metrics {
  if (!ts.length) return NM;
  const pn = ts.map(t => t.pnl), pnl = pn.reduce((a, b) => a + b, 0);
  const w = ts.filter(t => t.pnl > 0), l = ts.filter(t => t.pnl <= 0);
  const wr = w.length / ts.length, gw = w.reduce((s, t) => s + t.pnl, 0), gl = Math.abs(l.reduce((s, t) => s + t.pnl, 0));
  const mu = pnl / ts.length, sd = Math.sqrt(pn.reduce((s, v) => s + (v - mu) ** 2, 0) / pn.length);
  const ah = (ts.reduce((s, t) => s + t.bars, 0) / ts.length) * 8, tpy = ah > 0 ? (365.25 * 24) / ah : 0;
  const sh = sd === 0 || tpy === 0 ? 0 : (mu / sd) * Math.sqrt(tpy), ci = bci(pn);
  let pk = 0, eq = CAP, mdd = 0;
  for (const t of ts) { eq += t.pnl; pk = Math.max(pk, eq); mdd = Math.max(mdd, (pk - eq) / pk); }
  return { pnl, n: ts.length, wr, exp: mu, sharpe: sh, ciLo: ci.lo, ciHi: ci.hi, pf: gl === 0 ? (gw > 0 ? Infinity : 0) : gw / gl, mdd };
}
function oos(ts: Trade[]): { train: Trade[]; test: Trade[] } {
  const i = Math.floor(ts.length * TRAIN_FRAC);
  return { train: ts.slice(0, i), test: ts.slice(i) };
}
// ── Configs ────────────────────────────────────────────────────────────────
function configs(): Config[] {
  const cs: Config[] = [];
  for (const rp of [1, 3, 6]) for (const lt of [0.00001, 0.00005, 0.0001]) for (const st of [-0.00005, -0.00001]) for (const mh of [6, 12, 24]) cs.push({ rocPeriod: rp, longTh: lt, shortTh: st, maxHold: mh });
  return cs;
}
// ── Report ─────────────────────────────────────────────────────────────────
function report(fp: FP[], res: SR[]): string {
  const md: string[] = [];
  const rates = fp.map(f => f.rate);
  const mu = rates.reduce((a, b) => a + b, 0) / rates.length;
  const sd = Math.sqrt(rates.reduce((s, v) => s + (v - mu) ** 2, 0) / rates.length);
  const pos = rates.filter(r => r > 0).length, neg = rates.filter(r => r < 0).length;
  const fmt = (v: number) => `${(v * 100).toFixed(4)}%`;
  md.push('# Hypothesis #18 — Funding Rate Momentum Decay\n');
  md.push('Funding rate ROC predicts next-period price: LONG on positive ROC, SHORT on negative. Signal decays.\n');
  md.push('## Funding Rate Statistics\n| Metric | Value |\n|--------|-------|');
  md.push(`| Periods | ${fp.length} |`);
  md.push(`| Mean | ${fmt(mu)} |`);
  md.push(`| Std | ${fmt(sd)} |`);
  md.push(`| Min | ${fmt(Math.min(...rates))} |`);
  md.push(`| Max | ${fmt(Math.max(...rates))} |`);
  md.push(`| Positive | ${pos} (${(pos / rates.length * 100).toFixed(1)}%) |`);
  md.push(`| Negative | ${neg} (${(neg / rates.length * 100).toFixed(1)}%) |`);
  const s1 = [...res].sort((a, b) => b.all.pnl - a.all.pnl);
  md.push('## Full Period Results (Top 10 by PnL)\n| rocP | longTh | shortTh | maxH | Trades | PnL | WR | Sharpe | PF | MDD |');
  md.push('|------|--------|---------|------|--------|-----|----|--------|----|-----|');
  for (const r of s1.slice(0, 10)) md.push(`| ${r.cfg.rocPeriod} | ${r.cfg.longTh} | ${r.cfg.shortTh} | ${r.cfg.maxHold} | ${r.all.n} | $${r.all.pnl.toFixed(2)} | ${(r.all.wr * 100).toFixed(1)}% | ${r.all.sharpe.toFixed(2)} | ${r.all.pf.toFixed(2)} | ${(r.all.mdd * 100).toFixed(1)}% |`);
  const s2 = [...res].sort((a, b) => b.test.exp - a.test.exp);
  md.push('\n## OOS Results (All)\n| rocP | longTh | shortTh | maxH | Train | Test | TSharpe | TstSharpe | CI Lo | CI Hi |');
  md.push('|------|--------|---------|------|-------|------|---------|-----------|-------|-------|');
  for (const r of s2) md.push(`| ${r.cfg.rocPeriod} | ${r.cfg.longTh} | ${r.cfg.shortTh} | ${r.cfg.maxHold} | $${r.train.exp.toFixed(2)} | $${r.test.exp.toFixed(2)} | ${r.train.sharpe.toFixed(2)} | ${r.test.sharpe.toFixed(2)} | $${r.test.ciLo.toFixed(2)} | $${r.test.ciHi.toFixed(2)} |`);
  md.push('\n## Verdict\n');
  const posOOS = s2.filter(r => r.test.exp > 0 && r.test.n >= 5);
  const sig = posOOS.filter(r => r.test.ciLo > 0);
  if (sig.length) { const b = sig[0]; md.push(`**${sig.length}/${res.length} statistically significant.** Best: rocP=${b.cfg.rocPeriod} longTh=${b.cfg.longTh} shortTh=${b.cfg.shortTh} maxH=${b.cfg.maxHold}`); md.push(`Test: $${b.test.exp.toFixed(2)}/trade Sharpe ${b.test.sharpe.toFixed(2)} CI [${b.test.ciLo.toFixed(2)}, ${b.test.ciHi.toFixed(2)}]`); }
  else if (posOOS.length) md.push(`**${posOOS.length}/${res.length} positive OOS, none significant.** REJECTED.`);
  else md.push(`**0/${res.length} positive OOS.** REJECTED.`);
  return md.join('\n');
}
// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const cc: CostConfig = resolveStressConfig('conservative');
  const useSynthetic = process.argv.includes('--synthetic');
  console.log('=== Funding Rate Momentum Decay Backtest ===');
  console.log(`Symbol: SOLUSDT | Days: 730 | End: 2025-09-19 ${useSynthetic ? '| SYNTHETIC' : ''}\n`);
  let fp: FP[], candles: Candle[];
  if (useSynthetic) {
    console.log('Generating synthetic data...');
    const s = syntheticData();
    fp = s.funding;
    candles = s.candles;
  } else {
    console.log('Fetching funding...');
    fp = await fetchFunding('SOLUSDT');
    console.log(`  ${fp.length} periods`);
    console.log('Fetching 8h candles...');
    candles = await fetchCandles('SOLUSDT');
  }
  console.log(`  ${fp.length} funding periods | ${candles.length} candles`);
  if (fp.length < 50) { console.error('Insufficient data.'); process.exit(1); }
  const cfgs = configs();
  console.log(`Running ${cfgs.length} configs...\n`);
  const res: SR[] = [];
  for (const c of cfgs) {
    const rc = roc(fp, c.rocPeriod);
    const ts = bt(fp, rc, candles, c, cc);
    const am = metrics(ts);
    const { train, test } = oos(ts);
    res.push({ cfg: c, all: am, train: metrics(train), test: metrics(test) });
    console.log(`  rocP=${c.rocPeriod} longTh=${c.longTh} shortTh=${c.shortTh} maxH=${c.maxHold} → ${ts.length} trades | $${am.pnl.toFixed(2)} (${(am.wr * 100).toFixed(1)}% WR) | test: $${metrics(test).pnl.toFixed(2)}`);
  }
  const sorted = [...res].sort((a, b) => b.test.exp - a.test.exp);
  const pos = sorted.filter(r => r.test.exp > 0 && r.test.n >= 5);
  const sig = pos.filter(r => r.test.ciLo > 0);
  console.log(`\nOOS: ${pos.length} positive | ${sig.length} significant`);
  const rpt = report(fp, res);
  const { mkdirSync, writeFileSync } = await import('fs');
  const { resolve, dirname } = await import('path');
  const p = resolve(process.cwd(), 'plans/reports/funding-momentum-decay.md');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, rpt, 'utf-8');
  console.log(`\nReport: ${p}`);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });