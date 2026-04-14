-- Single-row-per-reconciliation table
-- Stores the full parsed statement + reconciliation results as JSONB
CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       TEXT NOT NULL,

  -- File metadata
  file_name     TEXT NOT NULL,
  bank_name     TEXT,
  reconciled_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),

  -- Summary numbers (queryable)
  total_transactions  INTEGER NOT NULL DEFAULT 0,
  total_deposits      DECIMAL(14,2) DEFAULT 0,
  total_withdrawals   DECIMAL(14,2) DEFAULT 0,
  matched_count       INTEGER NOT NULL DEFAULT 0,
  unmatched_bank_count INTEGER NOT NULL DEFAULT 0,
  unmatched_ledger_count INTEGER NOT NULL DEFAULT 0,
  bank_balance        DECIMAL(14,2) DEFAULT 0,
  ledger_balance      DECIMAL(14,2) DEFAULT 0,
  difference          DECIMAL(14,2) DEFAULT 0,
  status              TEXT DEFAULT 'partial' CHECK (status IN ('matched', 'partial')),

  -- Full data stored as JSON (one row holds everything)
  bank_transactions   JSONB NOT NULL DEFAULT '[]'::jsonb,   -- all parsed BankTx[]
  matched             JSONB NOT NULL DEFAULT '[]'::jsonb,   -- matched pairs
  unmatched_bank      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- unmatched bank items
  unmatched_ledger    JSONB NOT NULL DEFAULT '[]'::jsonb,   -- unmatched ledger items
  detected_columns    JSONB,                                 -- AI column mapping

  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- RLS
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own reconciliations"
  ON bank_reconciliations FOR ALL
  USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Index
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_user ON bank_reconciliations(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_date ON bank_reconciliations(reconciled_at DESC);
