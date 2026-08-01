/**
 * The schema, as a string rather than a `.sql` file read at runtime.
 *
 * A `fs.readFileSync` of a `.sql` file works in `next dev` but silently breaks
 * on a bundled/serverless deploy unless the file is added to the output file
 * trace. Keeping it as a module means it is always in the bundle, always in
 * sync, and has exactly one source of truth.
 *
 * Every statement is idempotent (`IF NOT EXISTS`), so `migrate()` can run on
 * every process start rather than needing a migration tool and a versions
 * table. That is the right trade at this size; a real deployment with data to
 * preserve would swap this for versioned migrations.
 */
export const SCHEMA_SQL = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- tenancy --

CREATE TABLE IF NOT EXISTS businesses (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  plan           TEXT NOT NULL DEFAULT 'free',
  credits_used   INTEGER NOT NULL DEFAULT 0,
  credits_limit  INTEGER NOT NULL DEFAULT 500,
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',
  created_at  INTEGER NOT NULL,
  UNIQUE (business_id, email)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  display      TEXT NOT NULL,
  hash         TEXT NOT NULL UNIQUE,
  scopes       TEXT NOT NULL DEFAULT '[]',
  last_used_at INTEGER,
  revoked_at   INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_keys_business ON api_keys (business_id);

-- --------------------------------------------------------------- audience --

CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  domain      TEXT NOT NULL,
  name        TEXT,
  traits      TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (business_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_companies_business ON companies (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS people (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT,
  company_id  TEXT REFERENCES companies(id) ON DELETE SET NULL,
  traits      TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (business_id, email)
);
CREATE INDEX IF NOT EXISTS idx_people_business ON people (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_people_company ON people (company_id);

CREATE TABLE IF NOT EXISTS lists (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL,
  UNIQUE (business_id, slug)
);

CREATE TABLE IF NOT EXISTS list_members (
  list_id   TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  added_at  INTEGER NOT NULL,
  PRIMARY KEY (list_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_list_members_person ON list_members (person_id);

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  person_id   TEXT REFERENCES people(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  props       TEXT NOT NULL DEFAULT '{}',
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_business_ts ON events (business_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_name ON events (business_id, name, ts DESC);

-- ----------------------------------------------------------------- memory --

CREATE TABLE IF NOT EXISTS memories (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  pinned      INTEGER NOT NULL DEFAULT 0,
  is_dir      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (business_id, path)
);
CREATE INDEX IF NOT EXISTS idx_memories_business ON memories (business_id, path);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  mem_id UNINDEXED,
  business_id UNINDEXED,
  title,
  content,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts (mem_id, business_id, title, content)
  VALUES (new.id, new.business_id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  DELETE FROM memories_fts WHERE mem_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  DELETE FROM memories_fts WHERE mem_id = old.id;
  INSERT INTO memories_fts (mem_id, business_id, title, content)
  VALUES (new.id, new.business_id, new.title, new.content);
END;

-- ---------------------------------------------------------------- content --

CREATE TABLE IF NOT EXISTS content (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft',
  title        TEXT NOT NULL,
  slug         TEXT,
  body         TEXT NOT NULL DEFAULT '',
  channel_meta TEXT NOT NULL DEFAULT '{}',
  list_id      TEXT REFERENCES lists(id) ON DELETE SET NULL,
  created_by   TEXT NOT NULL DEFAULT 'human',
  agent_run_id TEXT,
  scheduled_at INTEGER,
  published_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_business ON content (business_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_status ON content (business_id, status, scheduled_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_slug ON content (business_id, slug)
  WHERE slug IS NOT NULL;

-- ------------------------------------------------------------------ flows --

CREATE TABLE IF NOT EXISTS flows (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  trigger     TEXT NOT NULL DEFAULT '{}',
  steps       TEXT NOT NULL DEFAULT '[]',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_flows_business ON flows (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS flow_runs (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  flow_id     TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  person_id   TEXT REFERENCES people(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'running',
  cursor      INTEGER NOT NULL DEFAULT 0,
  log         TEXT NOT NULL DEFAULT '[]',
  error       TEXT,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_flow_runs_flow ON flow_runs (flow_id, started_at DESC);

-- ------------------------------------------------------------------ agent --

CREATE TABLE IF NOT EXISTS agent_runs (
  id             TEXT PRIMARY KEY,
  business_id    TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  goal           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'running',
  mode           TEXT NOT NULL DEFAULT 'live',
  model          TEXT NOT NULL,
  effort         TEXT,
  stop_reason    TEXT,
  error          TEXT,
  input_tokens        INTEGER NOT NULL DEFAULT 0,
  output_tokens       INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd       REAL NOT NULL DEFAULT 0,
  credits        INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  finished_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_business ON agent_runs (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_events (
  id      TEXT PRIMARY KEY,
  run_id  TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq     INTEGER NOT NULL,
  type    TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  ts      INTEGER NOT NULL,
  UNIQUE (run_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_agent_events_run ON agent_events (run_id, seq);

CREATE TABLE IF NOT EXISTS approvals (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tool        TEXT NOT NULL,
  input       TEXT NOT NULL DEFAULT '{}',
  summary     TEXT NOT NULL,
  decision    TEXT,
  reason      TEXT,
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_approvals_run ON approvals (run_id);

-- ------------------------------------------------------------------- jobs --

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  run_at      INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  locked_at   INTEGER,
  status      TEXT NOT NULL DEFAULT 'pending',
  error       TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs (status, run_at);
`;
