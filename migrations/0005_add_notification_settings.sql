-- Migration: 0005 — Notification settings for Telegram config

-- Telegram bot token and chat ID for trade notifications
ALTER TABLE settings ADD COLUMN notification_json TEXT DEFAULT '{}';
