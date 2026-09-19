// SQL statements for research queue D1 persistence.

export const SQL_APPEND_JOB = `INSERT INTO research_queue_jobs
  (job_id, hypothesis, rationale, features_json, dataset, regime,
   universe_json, costs_json, slippage_json, seed, parent_hypothesis,
   generated_by, timestamp, git_sha, status, config_hash, result_json, created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export const SQL_APPEND_EVENT = `INSERT INTO research_queue_events
  (event_id, job_id, from_status, to_status, "trigger", payload_json, created_at)
  VALUES (?,?,?,?,?,?,?)`;

export const SQL_LIST_JOBS = `SELECT job_id, hypothesis, rationale, features_json, dataset, regime,
  universe_json, costs_json, slippage_json, seed, parent_hypothesis,
  generated_by, timestamp, git_sha, status, config_hash, result_json, created_at
  FROM research_queue_jobs ORDER BY created_at DESC`;

export const SQL_LOAD_EVENTS = `SELECT event_id, job_id, from_status, to_status, "trigger", payload_json, created_at
  FROM research_queue_events WHERE job_id = ? ORDER BY created_at ASC`;

export const SQL_APPEND_COUNTER = `INSERT INTO research_testing_counters (snapshot_id, counters_json, created_at)
  VALUES (?,?,?)`;
