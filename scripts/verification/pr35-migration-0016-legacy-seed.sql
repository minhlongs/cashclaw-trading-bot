INSERT INTO users (id,email,display_name,locale,created_at,updated_at)
VALUES
  ('legacy-user-a','legacy-a@example.test','Legacy A','vi',1730000000,1730000000),
  ('legacy-user-b','legacy-b@example.test','Legacy B','en',1730000000,1730000000),
  ('legacy-owner-good','legacy-good@example.test','Legacy paid proof owner','en',1730000000,1730000000),
  ('legacy-owner-none','legacy-none@example.test','Legacy no-proof owner','en',1730000000,1730000000),
  ('legacy-owner-expired','legacy-expired@example.test','Legacy expired-like owner','en',1730000000,1730000000),
  ('legacy-owner-failed','legacy-failed@example.test','Legacy failed-payment owner','en',1730000000,1730000000),
  ('legacy-owner-pending','legacy-pending@example.test','Legacy pending-payment owner','en',1730000000,1730000000),
  ('legacy-owner-basic','legacy-basic@example.test','Legacy BASIC owner','en',1730000000,1730000000);
INSERT INTO user_sessions (id,user_id,expires_at,created_at)
VALUES
  ('legacy-session-a','legacy-user-a',2000000000,1730000000),
  ('legacy-session-b','legacy-user-b',2000000000,1730000000),
  ('legacy-session-orphan-negative-test','legacy-user-missing',2000000000,1730000000);

INSERT INTO bots (id,user_id,name,strategy,pair,exchange,status,config_json,capital_allocated,created_at,updated_at)
VALUES
  ('legacy-bot-a','legacy-user-a','Legacy bot A','grid','BTC/USDT','binance','draft','{}',100,1730000000,1730000000),
  ('legacy-bot-b','legacy-user-b','Legacy bot B','grid','ETH/USDT','binance','stopped','{}',50,1730000000,1730000000);

INSERT INTO saas_workspace_entitlements
  (workspace_id,owner_user_id,tier,max_running_bots,max_walk_forward_windows,monthly_llm_credits,managed_llm_pool_enabled,updated_at_ms)
VALUES
  ('legacy-paid-finished-proof','legacy-owner-good','PREMIUM',5,16,10000,1,1760000000000),
  ('legacy-paid-no-proof','legacy-owner-none','PREMIUM',5,16,10000,1,1760000000000),
  ('legacy-paid-expired-like','legacy-owner-expired','ENTERPRISE',25,64,50000,1,1700000000000),
  ('legacy-paid-failed-payment','legacy-owner-failed','PREMIUM',5,16,10000,1,1760000000000),
  ('legacy-paid-pending-payment','legacy-owner-pending','PREMIUM',5,16,10000,1,1760000000000),
  ('legacy-paid-system-owner','system','MASTER',100,256,250000,1,1760000000000),
  ('legacy-basic','legacy-owner-basic','BASIC',1,4,1000,0,1760000000000),
  ('legacy-orphan-basic-negative-test','legacy-user-missing','BASIC',1,4,1000,0,1760000000000);

INSERT INTO saas_nowpayments_ipn_events
  (payment_id,workspace_id,target_tier,payment_status,pay_amount,pay_currency,signature_verified,processed_at_ms)
VALUES
  ('legacy-payment-good','legacy-paid-finished-proof','PREMIUM','finished',29,'USDT',1,1760000000000),
  ('legacy-payment-expired-like','legacy-paid-expired-like','ENTERPRISE','finished',99,'USDT',1,1700000000000),
  ('legacy-payment-failed','legacy-paid-failed-payment','PREMIUM','failed',29,'USDT',1,1760000000000),
  ('legacy-payment-pending','legacy-paid-pending-payment','PREMIUM','waiting',29,'USDT',1,1760000000000);
