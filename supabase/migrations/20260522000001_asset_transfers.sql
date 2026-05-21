-- ════════════════════════════════════════════════════════════════════════════
-- Asset Transfer Management (Module 3)
--
-- Captures branch-to-branch, department, location, and custodian transfers
-- of fixed assets. Adds a transfer request with optional approval flow.
-- When a transfer is marked 'completed', the service layer:
--   1) updates fixed_assets.{branch_id, location, custodian, cost_center_id, department}
--   2) inserts an asset_transactions row (transaction_type='transfer')
--   3) inserts an asset_audit_log row
--   4) optionally posts a memorandum journal (source_type='asset_transfer')
--
-- No new journals.source_type entries are required — 'asset_transfer' was
-- already added in the Module 1 / fixed_assets migration.
-- ════════════════════════════════════════════════════════════════════════════

-- Add a 'department' column to fixed_assets so the transfer can carry it.
-- Existing assets keep NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'department'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN department TEXT;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- asset_transfers
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS asset_transfers (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  asset_id               UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,

  transfer_type          TEXT NOT NULL CHECK (transfer_type IN (
                           'branch',       -- branch-to-branch
                           'department',   -- department reassignment
                           'employee',     -- custodian change
                           'location',     -- physical relocation only
                           'cost_center'   -- cost-center reassignment
                         )),

  -- From (snapshotted at transfer time so audit trail survives later edits)
  from_branch_id         TEXT,
  from_location          TEXT,
  from_custodian         TEXT,
  from_cost_center_id    UUID,
  from_department        TEXT,

  -- To
  to_branch_id           TEXT,
  to_location            TEXT,
  to_custodian           TEXT,
  to_cost_center_id      UUID,
  to_department          TEXT,

  -- Workflow
  transfer_date          DATE NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'completed' CHECK (status IN (
                           'draft','pending_approval','approved','completed','rejected','reverted'
                         )),
  requested_by           TEXT,
  approved_by            TEXT,
  approved_on            DATE,
  rejected_reason        TEXT,

  -- Reversal chain (when a completed transfer is undone, the reversal points
  -- back to the original; the original's status becomes 'reverted')
  reverts_transfer_id    UUID REFERENCES asset_transfers(id) ON DELETE SET NULL,

  reason                 TEXT,
  notes                  TEXT,
  document_url           TEXT,

  -- Optional memorandum journal (cost-center reallocation, branch reassign)
  journal_id             UUID,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             TEXT
);

CREATE INDEX IF NOT EXISTS idx_xfer_user      ON asset_transfers(user_id, transfer_date DESC);
CREATE INDEX IF NOT EXISTS idx_xfer_asset     ON asset_transfers(asset_id, transfer_date DESC);
CREATE INDEX IF NOT EXISTS idx_xfer_status    ON asset_transfers(user_id, status);
CREATE INDEX IF NOT EXISTS idx_xfer_type      ON asset_transfers(user_id, transfer_type);
CREATE INDEX IF NOT EXISTS idx_xfer_journal   ON asset_transfers(journal_id);

ALTER TABLE asset_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS xfer_rls ON asset_transfers;
CREATE POLICY xfer_rls ON asset_transfers
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- updated_at touch trigger (reuses existing function if present, else creates)
CREATE OR REPLACE FUNCTION touch_asset_transfer_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_xfer_touch ON asset_transfers;
CREATE TRIGGER trg_xfer_touch
  BEFORE UPDATE ON asset_transfers
  FOR EACH ROW EXECUTE FUNCTION touch_asset_transfer_updated_at();


-- ── transfer summary view (for the cross-asset log) ─────────────────────────
CREATE OR REPLACE VIEW v_asset_transfers_enriched AS
SELECT
  t.*,
  fa.asset_code,
  fa.name           AS asset_name,
  fa.book_value     AS current_book_value
FROM asset_transfers t
JOIN fixed_assets fa ON fa.id = t.asset_id AND fa.user_id = t.user_id;
