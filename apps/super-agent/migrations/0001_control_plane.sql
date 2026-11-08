CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'review',
  priority TEXT NOT NULL DEFAULT 'normal',
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN
    ('pending','triaging','waiting_approval','ready','running','review','resolved','failed')),
  draft TEXT,
  report TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX cases_dispatch ON cases(state, updated_at);
CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  received_at INTEGER NOT NULL
);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id = 1), paused INTEGER NOT NULL DEFAULT 0);
INSERT INTO settings(id) VALUES (1);
CREATE TABLE usage_ledger (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  month TEXT NOT NULL,
  model TEXT NOT NULL,
  agent TEXT NOT NULL,
  reserved_micro_usd INTEGER NOT NULL CHECK(reserved_micro_usd > 0),
  charged_micro_usd INTEGER NOT NULL CHECK(charged_micro_usd >= 0),
  status TEXT NOT NULL CHECK(status IN ('reserved','completed','uncertain')),
  input_tokens INTEGER,
  cache_hit_tokens INTEGER,
  output_tokens INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX usage_month ON usage_ledger(month);
CREATE INDEX usage_case ON usage_ledger(case_id);
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
