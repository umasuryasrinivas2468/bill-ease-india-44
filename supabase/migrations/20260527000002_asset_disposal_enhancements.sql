-- ════════════════════════════════════════════════════════════════════════════
-- Asset Disposal Enhancements (Module 9)
--
-- Adds:
--   - asset_disposal_requests table for the approval workflow
--   - Output GST + scrap value + disposal type/reason columns on fixed_assets
--
-- The existing assetDisposalService.disposeFixedAsset() is extended to consume
-- the new fields. The disposal flow becomes:
--   1) requestDisposal()  → creates a pending request
--   2) approveDisposal()  → calls disposeFixedAsset() with the request's fields
--      OR rejectDisposal() → marks request rejected, asset unaffected
--   - Direct disposal (skip approval) still supported by calling disposeFixedAsset()
--     directly from the UI.
--
-- No new journal source_types required — disposal still posts via the existing
-- 'asset_disposal' / 'asset_write_off' source types.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Add disposal columns on fixed_assets ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'fixed_assets' AND column_name = 'disposal_reason') THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'fixed_assets' AND column_name = 'disposal_type') THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_type TEXT CHECK (
      disposal_type IS NULL OR disposal_type IN ('sale','scrap','donation','trade_in','write_off','damage')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'fixed_assets' AND column_name = 'scrap_value') THEN
    ALTER TABLE fixed_assets ADD COLUMN scrap_value NUMERIC(18,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'fixed_assets' AND column_name = 'disposal_gst_amount') THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_gst_amount NUMERIC(18,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'fixed_assets' AND column_name = 'disposal_gst_rate') THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_gst_rate NUMERIC(8,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'fixed_assets' AND column_name = 'disposal_buyer_name') THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_buyer_name TEXT;
  END IF;
END $$;


-- ── asset_disposal_requests ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_disposal_requests (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     TEXT NOT NULL,
  asset_id                    UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,

  disposal_type               TEXT NOT NULL CHECK (disposal_type IN (
                                'sale','scrap','donation','trade_in','write_off','damage'
                              )),
  reason                      TEXT NOT NULL,

  -- Proposed values (locked in at approval time)
  proposed_disposal_date      DATE NOT NULL,
  proposed_sale_proceeds      NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (proposed_sale_proceeds >= 0),
  proposed_scrap_value        NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (proposed_scrap_value >= 0),
  proposed_gst_rate           NUMERIC(8,4),
  proposed_gst_amount         NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (proposed_gst_amount >= 0),
  payment_mode                TEXT NOT NULL DEFAULT 'bank' CHECK (payment_mode IN ('bank','cash')),
  buyer_name                  TEXT,
  buyer_gstin                 TEXT,

  -- Workflow
  status                      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                                'pending','approved','rejected','completed','cancelled'
                              )),
  requested_by                TEXT NOT NULL,
  requested_on                DATE NOT NULL,
  approver                    TEXT,
  approved_on                 DATE,
  rejection_reason            TEXT,

  -- Linked post-approval disposal
  disposal_journal_id         UUID,

  document_url                TEXT,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disp_req_user    ON asset_disposal_requests(user_id, requested_on DESC);
CREATE INDEX IF NOT EXISTS idx_disp_req_asset   ON asset_disposal_requests(asset_id);
CREATE INDEX IF NOT EXISTS idx_disp_req_status  ON asset_disposal_requests(user_id, status);

ALTER TABLE asset_disposal_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disp_req_rls ON asset_disposal_requests;
CREATE POLICY disp_req_rls ON asset_disposal_requests
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- updated_at touch
CREATE OR REPLACE FUNCTION touch_disposal_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_disp_req_touch ON asset_disposal_requests;
CREATE TRIGGER trg_disp_req_touch
  BEFORE UPDATE ON asset_disposal_requests
  FOR EACH ROW EXECUTE FUNCTION touch_disposal_request_updated_at();


-- Enriched view (used by the pending-disposals dashboard)
CREATE OR REPLACE VIEW v_disposal_requests_enriched AS
SELECT
  r.*,
  fa.asset_code,
  fa.name           AS asset_name,
  fa.book_value     AS asset_book_value,
  fa.status         AS asset_status
FROM asset_disposal_requests r
JOIN fixed_assets fa ON fa.id = r.asset_id AND fa.user_id = r.user_id;
