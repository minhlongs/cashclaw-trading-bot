-- Migration: 0006 — Persist killswitch daily state across Workers restarts

-- Stores dailyPnl, consecutiveLosses, peakCapital, dailyStartTime
-- so killswitch thresholds survive Cloudflare Workers cold starts.
ALTER TABLE settings ADD COLUMN killswitch_daily_json TEXT DEFAULT '{}';
