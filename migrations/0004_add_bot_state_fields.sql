-- Migration: 0004 — Add missing BotState fields for D1 hydration
-- CashClaw Trading Bot Platform

-- Add columns that BotState tracks but were missing from the bots table
ALTER TABLE bots ADD COLUMN total_trades INTEGER DEFAULT 0;
ALTER TABLE bots ADD COLUMN started_at INTEGER;
ALTER TABLE bots ADD COLUMN stopped_at INTEGER;
ALTER TABLE bots ADD COLUMN last_error TEXT;
ALTER TABLE bots ADD COLUMN last_tick_at INTEGER;
ALTER TABLE bots ADD COLUMN last_order_at INTEGER;
ALTER TABLE bots ADD COLUMN current_drawdown REAL DEFAULT 0;
