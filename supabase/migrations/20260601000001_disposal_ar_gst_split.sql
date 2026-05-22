-- ════════════════════════════════════════════════════════════════════════════
-- Asset Disposal — AR routing + GST output split (Module 22, Phase 9)
--
-- Previously disposeFixedAsset() always settled in Bank/Cash and rolled GST
-- into a single 'Output GST' liability. This migration:
--
--   1. Adds 'credit' to the disposal payment_mode CHECK so disposals can
--      settle through AR (sale on credit; buyer to pay later).
--   2. Stores the buyer state / place-of-supply / customer_id so we can
--      compute CGST+SGST (intra) vs IGST (inter) at journal time.
--   3. Adds disposal_cgst/sgst/igst split columns on both fixed_assets
--      (terminal state) and asset_disposal_requests (proposed values).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Widen the disposal payment_mode CHECK on the request table ─────────
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT con.conname INTO v_conname
  FROM   pg_constraint con
  JOIN   pg_class      rel ON rel.oid = con.conrelid
  WHERE  rel.relname = 'asset_disposal_requests'
    AND  con.contype = 'c'
    AND  pg_get_constraintdef(con.oid) ILIKE '%payment_mode%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE asset_disposal_requests DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE asset_disposal_requests
    ADD CONSTRAINT asset_disposal_requests_payment_mode_chk
    CHECK (payment_mode IN ('bank','cash','credit'));
END $$;

-- ── 2. Buyer / place-of-supply / customer linkage on the request ──────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'asset_disposal_requests' AND column_name = 'buyer_state'
  ) THEN
    ALTER TABLE asset_disposal_requests ADD COLUMN buyer_state TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'asset_disposal_requests' AND column_name = 'place_of_supply'
  ) THEN
    ALTER TABLE asset_disposal_requests ADD COLUMN place_of_supply TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'asset_disposal_requests' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE asset_disposal_requests ADD COLUMN customer_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'asset_disposal_requests' AND column_name = 'proposed_intra_state'
  ) THEN
    ALTER TABLE asset_disposal_requests ADD COLUMN proposed_intra_state BOOLEAN;
  END IF;

  -- Split GST proposal so the approver sees exactly what will post.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'asset_disposal_requests' AND column_name = 'proposed_cgst_amount'
  ) THEN
    ALTER TABLE asset_disposal_requests ADD COLUMN proposed_cgst_amount NUMERIC(18,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'asset_disposal_requests' AND column_name = 'proposed_sgst_amount'
  ) THEN
    ALTER TABLE asset_disposal_requests ADD COLUMN proposed_sgst_amount NUMERIC(18,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'asset_disposal_requests' AND column_name = 'proposed_igst_amount'
  ) THEN
    ALTER TABLE asset_disposal_requests ADD COLUMN proposed_igst_amount NUMERIC(18,2) DEFAULT 0;
  END IF;
END $$;

-- ── 3. Terminal-state GST split + buyer linkage on fixed_assets ───────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'fixed_assets' AND column_name = 'disposal_cgst_amount'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_cgst_amount NUMERIC(18,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'fixed_assets' AND column_name = 'disposal_sgst_amount'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_sgst_amount NUMERIC(18,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'fixed_assets' AND column_name = 'disposal_igst_amount'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_igst_amount NUMERIC(18,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'fixed_assets' AND column_name = 'disposal_customer_id'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_customer_id UUID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'fixed_assets' AND column_name = 'disposal_buyer_gstin'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_buyer_gstin TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'fixed_assets' AND column_name = 'disposal_place_of_supply'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_place_of_supply TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'fixed_assets' AND column_name = 'disposal_payment_mode'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_payment_mode TEXT
      CHECK (disposal_payment_mode IN ('bank','cash','credit'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'fixed_assets' AND column_name = 'disposal_intra_state'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN disposal_intra_state BOOLEAN;
  END IF;
END $$;

-- ── 4. Refresh the enriched view to surface the new columns ───────────────
-- The view picks up *all* columns of the underlying tables via SELECT *,
-- but we recreate to ensure dropped/renamed columns don't haunt cached
-- definitions on existing environments.
DROP VIEW IF EXISTS v_disposal_requests_enriched CASCADE;
CREATE OR REPLACE VIEW v_disposal_requests_enriched AS
SELECT
  r.*,
  fa.asset_code,
  fa.name                AS asset_name,
  fa.book_value          AS asset_book_value,
  fa.status              AS asset_status
FROM asset_disposal_requests r
LEFT JOIN fixed_assets fa
  ON fa.id = r.asset_id AND fa.user_id = r.user_id;

COMMENT ON COLUMN asset_disposal_requests.customer_id IS
  'When a registered customer is buying the asset, link to clients table so the AR sub-ledger routes to their account.';
COMMENT ON COLUMN asset_disposal_requests.buyer_state IS
  'Buyer state / place-of-supply name used for intra-vs-inter-state GST classification when no buyer_gstin is provided.';
COMMENT ON COLUMN fixed_assets.disposal_intra_state IS
  'True if disposal was intra-state (CGST+SGST), false if inter-state (IGST), NULL if non-GST disposal.';
