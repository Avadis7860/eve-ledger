CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY,
  corporation_id numeric(20, 0) NOT NULL,
  division smallint NOT NULL CHECK (division = 1),
  source text NOT NULL CHECK (source IN ('transactions', 'journal', 'balance', 'wallet')),
  status text NOT NULL CHECK (status IN ('started', 'running', 'completed', 'partial', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  record_count bigint NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  error_summary text
);

CREATE TABLE IF NOT EXISTS source_responses (
  id bigserial PRIMARY KEY,
  sync_run_id uuid NOT NULL REFERENCES sync_runs(id),
  source text NOT NULL CHECK (source IN ('transactions', 'journal', 'balance')),
  endpoint text NOT NULL,
  request_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_number integer,
  cursor_value text,
  http_status smallint NOT NULL,
  retrieved_at timestamptz NOT NULL,
  etag text,
  last_modified text,
  expires_at timestamptz,
  x_pages integer,
  response_sha256 char(64) NOT NULL,
  response_body text NOT NULL,
  record_count integer NOT NULL CHECK (record_count >= 0),
  CHECK (page_number IS NULL OR page_number > 0)
);

CREATE INDEX IF NOT EXISTS source_responses_run_idx
  ON source_responses (sync_run_id, source, page_number);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  corporation_id numeric(20, 0) NOT NULL,
  division smallint NOT NULL CHECK (division = 1),
  transaction_id numeric(30, 0) NOT NULL,
  journal_ref_id numeric(30, 0),
  transaction_date timestamptz NOT NULL,
  is_buy boolean NOT NULL,
  client_id numeric(20, 0) NOT NULL,
  location_id numeric(20, 0) NOT NULL,
  quantity numeric(30, 0) NOT NULL,
  type_id integer NOT NULL,
  unit_price numeric(38, 12) NOT NULL,
  record_sha256 char(64) NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_raw_response_id bigint NOT NULL REFERENCES source_responses(id),
  PRIMARY KEY (corporation_id, division, transaction_id)
);

CREATE INDEX IF NOT EXISTS wallet_transactions_date_idx
  ON wallet_transactions (corporation_id, division, transaction_date DESC);

CREATE TABLE IF NOT EXISTS wallet_journal_entries (
  corporation_id numeric(20, 0) NOT NULL,
  division smallint NOT NULL CHECK (division = 1),
  journal_entry_id numeric(30, 0) NOT NULL,
  journal_date timestamptz NOT NULL,
  ref_type text NOT NULL,
  first_party_id numeric(20, 0),
  second_party_id numeric(20, 0),
  amount numeric(38, 12),
  balance numeric(38, 12) NOT NULL,
  reason text,
  context_id numeric(30, 0),
  context_id_type text,
  description text,
  record_sha256 char(64) NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_raw_response_id bigint NOT NULL REFERENCES source_responses(id),
  PRIMARY KEY (corporation_id, division, journal_entry_id)
);

CREATE INDEX IF NOT EXISTS wallet_journal_date_idx
  ON wallet_journal_entries (corporation_id, division, journal_date DESC);

CREATE TABLE IF NOT EXISTS wallet_balance_snapshots (
  id bigserial PRIMARY KEY,
  corporation_id numeric(20, 0) NOT NULL,
  division smallint NOT NULL CHECK (division = 1),
  balance numeric(38, 12) NOT NULL,
  retrieved_at timestamptz NOT NULL,
  raw_response_id bigint NOT NULL REFERENCES source_responses(id),
  UNIQUE (raw_response_id, division)
);

CREATE INDEX IF NOT EXISTS wallet_balance_snapshots_date_idx
  ON wallet_balance_snapshots (corporation_id, division, retrieved_at DESC);

CREATE TABLE IF NOT EXISTS sync_checkpoints (
  corporation_id numeric(20, 0) NOT NULL,
  division smallint NOT NULL CHECK (division = 1),
  source text NOT NULL CHECK (source IN ('transactions', 'journal', 'balance')),
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corporation_id, division, source)
);

CREATE TABLE IF NOT EXISTS secure_tokens (
  token_name text PRIMARY KEY,
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL,
  auth_tag bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_source_response_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'source_responses is append-only; mutation is forbidden';
END;
$$;

DROP TRIGGER IF EXISTS source_responses_immutable ON source_responses;
CREATE TRIGGER source_responses_immutable
  BEFORE UPDATE OR DELETE ON source_responses
  FOR EACH ROW EXECUTE FUNCTION prevent_source_response_mutation();
