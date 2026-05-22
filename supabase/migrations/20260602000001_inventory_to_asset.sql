-- ════════════════════════════════════════════════════════════════════════════
-- Inventory → Fixed Asset Conversion (Module 23, Phase 9)
--
-- Sometimes a unit was procured into inventory (intent: resale) but ends up
-- being capitalized (e.g., laptop kept for office use, machinery shifted from
-- stock to production). This migration adds:
--
--   • 'inventory' to fixed_assets.source_type CHECK
--   • Linkage columns on fixed_assets so the conversion is auditable
--   • 'inventory_to_asset' as a valid journals.source_type
--
-- Inventory_movements has no CHECK on source_type (it's free-form TEXT), so
-- no widening needed there.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Extend fixed_assets.source_type CHECK to allow 'inventory' ─────────
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT con.conname INTO v_conname
  FROM   pg_constraint con
  JOIN   pg_class      rel ON rel.oid = con.conrelid
  WHERE  rel.relname = 'fixed_assets'
    AND  con.contype = 'c'
    AND  pg_get_constraintdef(con.oid) ILIKE '%source_type%manual%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE fixed_assets DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE fixed_assets
    ADD CONSTRAINT fixed_assets_source_type_chk
    CHECK (source_type IN ('manual','purchase_bill','expense','import','inventory'));
END $$;

-- ── 2. Linkage + audit columns on fixed_assets ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'fixed_assets' AND column_name = 'source_inventory_item_id'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN source_inventory_item_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'fixed_assets' AND column_name = 'source_inventory_qty'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN source_inventory_qty NUMERIC(14,4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name = 'fixed_assets' AND column_name = 'source_inventory_movement_id'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN source_inventory_movement_id UUID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_source_inventory_item
  ON fixed_assets(user_id, source_inventory_item_id);

-- ── 3. Add 'inventory_to_asset' to journals.source_type CHECK ─────────────
DO $$
DECLARE
  v_conname TEXT;
  v_def     TEXT;
BEGIN
  SELECT con.conname, pg_get_constraintdef(con.oid)
    INTO v_conname, v_def
  FROM   pg_constraint con
  JOIN   pg_class      rel ON rel.oid = con.conrelid
  WHERE  rel.relname = 'journals'
    AND  con.contype = 'c'
    AND  pg_get_constraintdef(con.oid) ILIKE '%asset_capitalization%';

  IF v_conname IS NOT NULL AND v_def NOT ILIKE '%inventory_to_asset%' THEN
    EXECUTE format('ALTER TABLE journals DROP CONSTRAINT %I', v_conname);
    ALTER TABLE journals
      ADD CONSTRAINT journals_source_type_chk CHECK (
        source_type IS NULL OR source_type IN (
          'bill','bill_reversal','expense','expense_reversal',
          'payment','payment_reversal','advance','advance_reversal',
          'advance_adjustment','advance_adjustment_reversal',
          'invoice','invoice_reversal','payment_received','payment_received_reversal',
          'cash_memo','cash_memo_reversal','cogs','cogs_reversal',
          'inventory_adjustment',
          'customer_advance','customer_advance_reversal',
          'customer_advance_adjustment','customer_advance_adjustment_reversal',
          'credit_note','credit_note_reversal',
          'sales_return','sales_return_reversal',
          'debit_note','debit_note_reversal',
          'purchase_return','purchase_return_reversal',
          'payment_link','gst_payment','tds_payment',
          'accrual','accrual_reversal','recurring','opening_balance','manual','reversal',
          'asset_purchase','asset_purchase_reversal','asset_capitalization',
          'depreciation','depreciation_reversal','asset_impairment','asset_transfer',
          'asset_disposal','asset_disposal_reversal','asset_write_off',
          'asset_maintenance','asset_maintenance_reversal',
          'insurance_premium','insurance_premium_reversal',
          'insurance_claim','insurance_claim_reversal',
          'lease_recognition','lease_recognition_reversal',
          'lease_payment','lease_payment_reversal',
          'lease_termination','lease_termination_reversal',
          'lease_interest_accrual',
          'cwip_addition','cwip_addition_reversal','cwip_capitalization',
          'asset_revaluation','asset_revaluation_reversal',
          'inventory_to_asset',
          'loan_disbursement','loan_disbursement_reversal',
          'loan_emi','loan_emi_reversal','loan_interest_accrual','liability_settlement'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN fixed_assets.source_inventory_item_id IS
  'When source_type=inventory, the inventory.id this asset was converted from.';
COMMENT ON COLUMN fixed_assets.source_inventory_qty IS
  'Units transferred from inventory at conversion time.';
COMMENT ON COLUMN fixed_assets.source_inventory_movement_id IS
  'The inventory_movements row recording the outward stock movement (adjustment_out, source_type=asset_conversion).';
