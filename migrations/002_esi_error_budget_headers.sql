ALTER TABLE source_responses
  ADD COLUMN IF NOT EXISTS error_limit_remain text,
  ADD COLUMN IF NOT EXISTS error_limit_reset text;
