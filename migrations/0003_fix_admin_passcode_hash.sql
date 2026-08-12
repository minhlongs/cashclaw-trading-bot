-- Migration: 0003 — Fix admin passcode to use SHA-256 hash (replaces plaintext).
-- The hash was pre-computed: SHA-256("admin@cashclaw.app:cashclaw2026") + ":admin@cashclaw.app"
UPDATE users
SET passcode_hash = '74be90edbcf3fe38027d7827de8ef1eeb949aac658607e78bb798774ca3e23a7:admin@cashclaw.app'
WHERE email = 'admin@cashclaw.app';
