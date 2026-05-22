-- ════════════════════════════════════════════════════════════════════════════
-- AP → Asset Auto-Capitalization (Module 21 of the Asset/Liability ERP build)
--
-- Purchase bills already tag asset-classified lines via `__classification` in
-- the items JSONB and roll the total into `purchase_bills.asset_amount`. The
-- existing journal posts the asset leg to a generic "Fixed Assets" account.
-- This migration adds the plumbing to auto-create per-line `fixed_assets`
-- register rows from those bills, with a reclassification journal that moves
-- the debit from the generic account to per-asset leaf accounts.
--
-- Idempotency is on (source_bill_id, source_bill_line_id) → a given bill line
-- can only become one asset.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Track capitalization state on the bill ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_bills' AND column_name = 'capitalization_status'
  ) THEN
    ALTER TABLE purchase_bills
      ADD COLUMN capitalization_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (capitalization_status IN ('not_applicable','pending','partial','capitalized','skipped'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_bills' AND column_name = 'capitalized_at'
  ) THEN
    ALTER TABLE purchase_bills ADD COLUMN capitalized_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_bills' AND column_name = 'capitalized_by'
  ) THEN
    ALTER TABLE purchase_bills ADD COLUMN capitalized_by TEXT;
  END IF;
END $$;

-- Backfill: bills without an asset_amount stay 'not_applicable' so they don't
-- pollute the queue.
UPDATE purchase_bills
   SET capitalization_status = 'not_applicable'
 WHERE COALESCE(asset_amount, 0) = 0
   AND capitalization_status = 'pending';

-- ── 2. Track bill line → asset linkage on the asset side ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'source_bill_id'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN source_bill_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'source_bill_line_id'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN source_bill_line_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'reclassification_journal_id'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN reclassification_journal_id UUID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_source_bill
  ON fixed_assets(user_id, source_bill_id);

-- Prevent the same bill line being capitalized twice.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fixed_assets_unique_source_bill_line'
  ) THEN
    ALTER TABLE fixed_assets
      ADD CONSTRAINT fixed_assets_unique_source_bill_line
        UNIQUE (user_id, source_bill_id, source_bill_line_id);
  END IF;
END $$;

-- ── 3. View: bills with asset lines awaiting capitalization ────────────────
DROP VIEW IF EXISTS v_uncapitalized_asset_bills CASCADE;
CREATE OR REPLACE VIEW v_uncapitalized_asset_bills AS
SELECT
  b.id                                                                  AS bill_id,
  b.user_id,
  b.bill_number,
  b.bill_date,
  b.vendor_id,
  b.vendor_name,
  b.amount,
  b.gst_amount,
  b.total_amount,
  b.asset_amount,
  b.cgst_amount,
  b.sgst_amount,
  b.igst_amount,
  b.gst_amount                                                          AS total_gst,
  b.classification,
  b.itc_eligible,
  b.cost_center_id,
  b.branch_id,
  b.project_id,
  b.items,
  COALESCE(b.capitalization_status, 'pending')                          AS capitalization_status,
  b.capitalized_at,
  b.capitalized_by,
  (SELECT COUNT(*) FROM fixed_assets fa
    WHERE fa.user_id = b.user_id
      AND fa.source_bill_id = b.id)                                     AS assets_created_count
FROM purchase_bills b
WHERE COALESCE(b.asset_amount, 0) > 0
  AND COALESCE(b.capitalization_status, 'pending') IN ('pending','partial');

COMMENT ON VIEW v_uncapitalized_asset_bills IS
  'Purchase bills with asset_amount > 0 that have not been fully capitalized into the fixed_assets register.';

-- ── 4. View: extracted asset lines from bill.items JSONB ───────────────────
DROP VIEW IF EXISTS v_bill_asset_lines CASCADE;
CREATE OR REPLACE VIEW v_bill_asset_lines AS
SELECT
  b.user_id,
  b.id                                                                       AS bill_id,
  b.bill_number,
  b.bill_date,
  b.vendor_id,
  b.vendor_name,
  COALESCE(line.value->>'id', (line.ordinality - 1)::text)                   AS line_id,
  (line.ordinality - 1)::integer                                             AS line_index,
  COALESCE(
    NULLIF(line.value->>'description',''),
    NULLIF(line.value->>'item_details',''),
    NULLIF(line.value->>'product_name',''),
    'Asset line ' || line.ordinality::text
  )                                                                          AS description,
  line.value->>'hsn_sac'                                                     AS hsn_sac,
  line.value->>'product_id'                                                  AS product_id,
  COALESCE(NULLIF(line.value->>'quantity','')::numeric, 1)                   AS quantity,
  NULLIF(line.value->>'rate','')::numeric                                    AS rate,
  COALESCE(NULLIF(line.value->>'amount','')::numeric, 0)                     AS amount,
  NULLIF(line.value->>'tax','')::numeric                                     AS tax_rate,
  EXISTS (
    SELECT 1 FROM fixed_assets fa
     WHERE fa.user_id = b.user_id
       AND fa.source_bill_id = b.id
       AND fa.source_bill_line_id = COALESCE(line.value->>'id', (line.ordinality - 1)::text)
  )                                                                          AS already_capitalized
FROM purchase_bills b
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.items, '[]'::jsonb))
                   WITH ORDINALITY AS line(value, ordinality)
WHERE COALESCE(b.asset_amount, 0) > 0
  AND line.value->>'__classification' = 'asset';

COMMENT ON VIEW v_bill_asset_lines IS
  'Per-line asset entries extracted from purchase_bills.items where __classification = asset.';

-- ── 5. Function: refresh bill capitalization_status from asset count ──────
-- Trigger keeps purchase_bills.capitalization_status in sync as fixed_assets
-- rows are created/deleted against the bill. The status moves:
--   pending  → partial   (some lines capitalized)
--   partial  → capitalized (all asset lines capitalized)
--   capitalized → partial (an asset got deleted)
CREATE OR REPLACE FUNCTION refresh_bill_capitalization_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_bill_id           UUID;
  v_user_id           TEXT;
  v_asset_lines_count INTEGER;
  v_created_count     INTEGER;
  v_new_status        TEXT;
BEGIN
  v_bill_id  := COALESCE(NEW.source_bill_id, OLD.source_bill_id);
  v_user_id  := COALESCE(NEW.user_id,        OLD.user_id);
  IF v_bill_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_asset_lines_count
    FROM v_bill_asset_lines
   WHERE user_id = v_user_id AND bill_id = v_bill_id;

  SELECT COUNT(*) INTO v_created_count
    FROM fixed_assets
   WHERE user_id = v_user_id AND source_bill_id = v_bill_id;

  IF v_created_count = 0 THEN
    v_new_status := 'pending';
  ELSIF v_created_count >= v_asset_lines_count THEN
    v_new_status := 'capitalized';
  ELSE
    v_new_status := 'partial';
  END IF;

  UPDATE purchase_bills
     SET capitalization_status = v_new_status,
         capitalized_at        = CASE WHEN v_new_status = 'capitalized' THEN NOW() ELSE capitalized_at END
   WHERE id = v_bill_id AND user_id = v_user_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_bill_capitalization_status         ON fixed_assets;
DROP TRIGGER IF EXISTS trg_refresh_bill_capitalization_status_ins     ON fixed_assets;
DROP TRIGGER IF EXISTS trg_refresh_bill_capitalization_status_del     ON fixed_assets;

CREATE TRIGGER trg_refresh_bill_capitalization_status_ins
  AFTER INSERT ON fixed_assets
  FOR EACH ROW
  WHEN (NEW.source_bill_id IS NOT NULL)
  EXECUTE FUNCTION refresh_bill_capitalization_status();

CREATE TRIGGER trg_refresh_bill_capitalization_status_del
  AFTER DELETE ON fixed_assets
  FOR EACH ROW
  WHEN (OLD.source_bill_id IS NOT NULL)
  EXECUTE FUNCTION refresh_bill_capitalization_status();

-- ── 6. RLS — views inherit from base tables; no explicit policies needed ──
-- v_uncapitalized_asset_bills + v_bill_asset_lines are SELECT-only views over
-- purchase_bills + fixed_assets, both of which have RLS policies in place.

COMMENT ON COLUMN purchase_bills.capitalization_status IS
  'Lifecycle of asset capitalization for this bill: not_applicable | pending | partial | capitalized | skipped.';
COMMENT ON COLUMN fixed_assets.source_bill_id IS
  'When source_type=purchase_bill, the originating purchase_bills.id. Set by assetCapitalizationService.';
COMMENT ON COLUMN fixed_assets.source_bill_line_id IS
  'Bill line identifier (items[*].id or its ordinal index) — uniquely identifies which line on the bill became this asset.';
COMMENT ON COLUMN fixed_assets.reclassification_journal_id IS
  'Journal that moves the debit from the generic Fixed Assets account to this asset''s leaf account.';
