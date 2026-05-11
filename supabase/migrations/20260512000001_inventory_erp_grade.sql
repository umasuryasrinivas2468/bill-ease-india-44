-- ════════════════════════════════════════════════════════════════════════════
-- ERP-grade Inventory Closeout
--
-- Adds the missing pieces on top of the existing inventory backbone
-- (inventory, inventory_movements, inventory_batches, warehouses,
--  inventory_alerts, stock_adjustments, refresh_inventory_rollup, etc):
--
--   1. warehouse_transfers + warehouse_transfer_items   — inter-warehouse moves
--   2. stock_adjustment_items                           — normalised lines for
--                                                         the existing stock_adjustments
--                                                         JSONB-blob table
--   3. inventory_forecasts                              — moving-avg reorder
--                                                         suggestions (AI stub)
--   4. inventory_anomalies                              — abnormal-movement +
--                                                         duplicate-item alerts
--   5. Views
--        v_inventory_gl_reconciliation — subledger vs Inventory Asset balance
--        v_hsn_summary                  — outward + inward by HSN (GSTR-1/2 prep)
--        v_inventory_kpi                — per-item KPIs (turnover, GMROI, etc.)
--        v_item_movement_ledger         — drill-down with running balance
--   6. approval_rules.entity_type extended to include
--        'stock_adjustment' and 'warehouse_transfer'
--   7. journals.source_type extended to include
--        'warehouse_transfer' and 'warehouse_transfer_reversal'
--
-- Safe re-runnable. No data backfills required.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. warehouse_transfers ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             TEXT NOT NULL,
  transfer_number     TEXT NOT NULL,
  transfer_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  from_warehouse_id   UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id     UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  from_warehouse_name TEXT,
  to_warehouse_name   TEXT,

  reason              TEXT,
  notes               TEXT,
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_transit', 'received', 'cancelled')),

  -- Totals
  total_quantity      NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_value         NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Cross-GSTIN deemed-supply tag (single-state by default)
  is_interstate       BOOLEAN NOT NULL DEFAULT FALSE,
  same_gstin          BOOLEAN NOT NULL DEFAULT TRUE,

  -- Approval-aware
  approved_at         TIMESTAMPTZ,
  approved_by         TEXT,

  -- Receipt tracking
  received_at         TIMESTAMPTZ,
  received_by         TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_transfers_number
  ON warehouse_transfers(user_id, lower(transfer_number));
CREATE INDEX IF NOT EXISTS idx_wt_status ON warehouse_transfers(user_id, status, transfer_date DESC);
CREATE INDEX IF NOT EXISTS idx_wt_from   ON warehouse_transfers(user_id, from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wt_to     ON warehouse_transfers(user_id, to_warehouse_id);

ALTER TABLE warehouse_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warehouse_transfers_owner" ON warehouse_transfers;
CREATE POLICY "warehouse_transfers_owner" ON warehouse_transfers FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

DROP TRIGGER IF EXISTS update_warehouse_transfers_updated_at ON warehouse_transfers;
CREATE TRIGGER update_warehouse_transfers_updated_at
  BEFORE UPDATE ON warehouse_transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS warehouse_transfer_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT NOT NULL,
  transfer_id     UUID NOT NULL REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  product_name    TEXT NOT NULL,
  quantity        NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit_cost       NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_value     NUMERIC(14,2) NOT NULL DEFAULT 0,
  uom             TEXT DEFAULT 'pcs',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wti_transfer ON warehouse_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_wti_product  ON warehouse_transfer_items(user_id, product_id);

ALTER TABLE warehouse_transfer_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warehouse_transfer_items_owner" ON warehouse_transfer_items;
CREATE POLICY "warehouse_transfer_items_owner" ON warehouse_transfer_items FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- Roll-up totals when items change.
CREATE OR REPLACE FUNCTION roll_warehouse_transfer_totals()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID := COALESCE(NEW.transfer_id, OLD.transfer_id);
  v_qty NUMERIC := 0;
  v_val NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(total_value), 0)
    INTO v_qty, v_val
    FROM warehouse_transfer_items
   WHERE transfer_id = v_id;

  UPDATE warehouse_transfers
     SET total_quantity = v_qty,
         total_value    = ROUND(v_val, 2),
         updated_at     = NOW()
   WHERE id = v_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_roll_warehouse_transfer_totals ON warehouse_transfer_items;
CREATE TRIGGER trg_roll_warehouse_transfer_totals
  AFTER INSERT OR UPDATE OR DELETE ON warehouse_transfer_items
  FOR EACH ROW EXECUTE FUNCTION roll_warehouse_transfer_totals();

-- Period-lock guard.
CREATE OR REPLACE FUNCTION enforce_period_lock_warehouse_transfers()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_date DATE;
  v_user TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user := OLD.user_id; v_date := OLD.transfer_date;
  ELSE
    v_user := NEW.user_id; v_date := NEW.transfer_date;
  END IF;
  IF v_date IS NOT NULL AND is_period_locked(v_user, v_date) THEN
    RAISE EXCEPTION 'Cannot modify warehouse transfer — period covering % is locked.', v_date
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_period_lock_warehouse_transfers ON warehouse_transfers;
CREATE TRIGGER trg_period_lock_warehouse_transfers
  BEFORE INSERT OR UPDATE OR DELETE ON warehouse_transfers
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock_warehouse_transfers();

-- ── 2. stock_adjustment_items (normalised lines) ────────────────────────────
-- The existing stock_adjustments table stores items as a JSONB blob. For
-- approval/reporting/audit we add a proper line table alongside; both can
-- coexist so legacy rows keep working.
CREATE TABLE IF NOT EXISTS stock_adjustment_items (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             TEXT NOT NULL,
  adjustment_id       UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  product_name        TEXT NOT NULL,
  warehouse_id        UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  quantity_delta      NUMERIC(14,4) NOT NULL,        -- signed: + = in, - = out
  unit_cost           NUMERIC(14,4) NOT NULL DEFAULT 0,
  value_delta         NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjustment_type     TEXT NOT NULL DEFAULT 'manual'
    CHECK (adjustment_type IN ('damaged','expired','manual','write_off','found','recount','opening')),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sai_adjustment ON stock_adjustment_items(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_sai_product    ON stock_adjustment_items(user_id, product_id);

ALTER TABLE stock_adjustment_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_adjustment_items_owner" ON stock_adjustment_items;
CREATE POLICY "stock_adjustment_items_owner" ON stock_adjustment_items FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- Extend stock_adjustments with approval / journal linkage columns.
ALTER TABLE stock_adjustments
  ADD COLUMN IF NOT EXISTS total_value_delta NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by       TEXT,
  ADD COLUMN IF NOT EXISTS journal_id        UUID;

-- Refresh totals from items.
CREATE OR REPLACE FUNCTION roll_stock_adjustment_totals()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID := COALESCE(NEW.adjustment_id, OLD.adjustment_id);
  v_val NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(value_delta), 0) INTO v_val
    FROM stock_adjustment_items
   WHERE adjustment_id = v_id;
  UPDATE stock_adjustments
     SET total_value_delta = ROUND(v_val, 2),
         updated_at = NOW()
   WHERE id = v_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_roll_stock_adjustment_totals ON stock_adjustment_items;
CREATE TRIGGER trg_roll_stock_adjustment_totals
  AFTER INSERT OR UPDATE OR DELETE ON stock_adjustment_items
  FOR EACH ROW EXECUTE FUNCTION roll_stock_adjustment_totals();

-- ── 3. inventory_forecasts (AI scaffolding — moving-average reorder) ────────
CREATE TABLE IF NOT EXISTS inventory_forecasts (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             TEXT NOT NULL,
  item_id             UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  forecast_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  method              TEXT NOT NULL DEFAULT 'moving_avg'
    CHECK (method IN ('moving_avg', 'manual', 'ml_v1', 'ml_v2')),
  window_days         INTEGER NOT NULL DEFAULT 30,
  avg_daily_demand    NUMERIC(14,4) NOT NULL DEFAULT 0,
  lead_time_days      INTEGER NOT NULL DEFAULT 7,
  safety_stock        NUMERIC(14,4) NOT NULL DEFAULT 0,
  reorder_point       NUMERIC(14,4) NOT NULL DEFAULT 0,
  suggested_reorder_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
  confidence          NUMERIC(5,2),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, item_id, forecast_date)
);

CREATE INDEX IF NOT EXISTS idx_inv_forecast_user_item
  ON inventory_forecasts(user_id, item_id, forecast_date DESC);

ALTER TABLE inventory_forecasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_forecasts_owner" ON inventory_forecasts;
CREATE POLICY "inventory_forecasts_owner" ON inventory_forecasts FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- ── 4. inventory_anomalies (abnormal movement + duplicate-item alerts) ──────
CREATE TABLE IF NOT EXISTS inventory_anomalies (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT NOT NULL,
  item_id         UUID REFERENCES inventory(id) ON DELETE CASCADE,
  anomaly_type    TEXT NOT NULL CHECK (anomaly_type IN (
    'abnormal_movement','duplicate_item','negative_stock','valuation_drift',
    'no_movement','price_spike'
  )),
  severity        TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title           TEXT NOT NULL,
  details         JSONB,
  detected_at     TIMESTAMPTZ DEFAULT NOW(),
  is_resolved     BOOLEAN DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_inv_anomalies_user
  ON inventory_anomalies(user_id, is_resolved, detected_at DESC);

ALTER TABLE inventory_anomalies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_anomalies_owner" ON inventory_anomalies;
CREATE POLICY "inventory_anomalies_owner" ON inventory_anomalies FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- ── 5. Views ────────────────────────────────────────────────────────────────

-- 5a. GL reconciliation — subledger (inventory.stock_value) vs Inventory Asset
-- account closing balance in trial_balance. Difference should be ~0.
CREATE OR REPLACE VIEW v_inventory_gl_reconciliation AS
WITH subledger AS (
  SELECT user_id,
         COALESCE(SUM(stock_value), 0) AS subledger_value,
         COUNT(*) FILTER (WHERE type = 'goods') AS item_count
    FROM inventory
   GROUP BY user_id
),
gl AS (
  SELECT user_id,
         COALESCE(SUM(closing_balance), 0) AS gl_value
    FROM v_trial_balance
   WHERE lower(account_name) IN (
     'inventory asset','inventory','stock'
   ) OR lower(account_name) LIKE 'inventory %'
   GROUP BY user_id
)
SELECT
  COALESCE(s.user_id, g.user_id)            AS user_id,
  s.subledger_value,
  s.item_count,
  g.gl_value,
  COALESCE(s.subledger_value, 0)
    - COALESCE(g.gl_value, 0)              AS variance,
  CASE
    WHEN ABS(COALESCE(s.subledger_value, 0) - COALESCE(g.gl_value, 0)) < 1 THEN 'reconciled'
    WHEN ABS(COALESCE(s.subledger_value, 0) - COALESCE(g.gl_value, 0)) < 100 THEN 'minor_drift'
    ELSE 'investigate'
  END                                       AS status
FROM subledger s
FULL OUTER JOIN gl g ON g.user_id = s.user_id;

-- 5b. HSN-wise summary — outward (sales) and inward (purchase) by HSN code.
-- Drives the HSN summary tile in GSTR-1 / GSTR-2 prep reports.
CREATE OR REPLACE VIEW v_hsn_summary AS
WITH outward AS (
  SELECT
    i.user_id,
    COALESCE(NULLIF(line.value ->> 'hsn_sac', ''), 'UNKNOWN') AS hsn_sac,
    SUM(COALESCE((line.value ->> 'quantity')::numeric, 0))   AS qty_out,
    SUM(COALESCE((line.value ->> 'amount')::numeric, 0))     AS taxable_out,
    SUM(COALESCE((line.value ->> 'amount')::numeric, 0)
      * COALESCE((line.value ->> 'gst_rate')::numeric, COALESCE(i.gst_rate,0)) / 100) AS gst_out
  FROM invoices i
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.items_with_product_id, i.items, '[]'::jsonb)) AS line(value)
  WHERE COALESCE((line.value ->> '__tax_meta')::boolean, FALSE) = FALSE
  GROUP BY i.user_id, hsn_sac
),
inward AS (
  SELECT
    b.user_id,
    COALESCE(NULLIF(line.value ->> 'hsn_sac', ''), 'UNKNOWN') AS hsn_sac,
    SUM(COALESCE((line.value ->> 'quantity')::numeric, 0))   AS qty_in,
    SUM(COALESCE((line.value ->> 'amount')::numeric, 0))     AS taxable_in,
    SUM(COALESCE((line.value ->> 'amount')::numeric, 0)
      * COALESCE((line.value ->> 'gst_rate')::numeric, COALESCE(b.gst_amount,0) / NULLIF((line.value ->> 'amount')::numeric, 0) * 100) / 100) AS gst_in
  FROM purchase_bills b
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.items, '[]'::jsonb)) AS line(value)
  GROUP BY b.user_id, hsn_sac
)
SELECT
  COALESCE(o.user_id, i.user_id)                AS user_id,
  COALESCE(o.hsn_sac, i.hsn_sac)                AS hsn_sac,
  COALESCE(o.qty_out, 0)                        AS qty_out,
  COALESCE(o.taxable_out, 0)                    AS taxable_out,
  COALESCE(o.gst_out, 0)                        AS gst_out,
  COALESCE(i.qty_in, 0)                         AS qty_in,
  COALESCE(i.taxable_in, 0)                     AS taxable_in,
  COALESCE(i.gst_in, 0)                         AS gst_in
FROM outward o
FULL OUTER JOIN inward i ON i.user_id = o.user_id AND i.hsn_sac = o.hsn_sac;

-- 5c. Per-item KPI dashboard.
-- Stock turnover, days-of-inventory, revenue, COGS, gross margin, GMROI.
CREATE OR REPLACE VIEW v_inventory_kpi AS
WITH movement_window AS (
  SELECT
    user_id,
    item_id,
    SUM(value_out)            AS cogs_last_90,
    SUM(quantity_out)         AS qty_out_last_90,
    SUM(quantity_in)          AS qty_in_last_90,
    MAX(movement_date)        AS last_movement_date
  FROM inventory_movements
  WHERE movement_date >= CURRENT_DATE - 90
  GROUP BY user_id, item_id
),
revenue AS (
  SELECT
    i.user_id,
    (line.value ->> 'product_id')::uuid           AS item_id,
    SUM(COALESCE((line.value ->> 'amount')::numeric, 0)) AS revenue_last_90
  FROM invoices i
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.items_with_product_id, i.items, '[]'::jsonb)) AS line(value)
  WHERE i.invoice_date >= CURRENT_DATE - 90
    AND COALESCE((line.value ->> '__tax_meta')::boolean, FALSE) = FALSE
    AND line.value ? 'product_id'
  GROUP BY i.user_id, (line.value ->> 'product_id')::uuid
)
SELECT
  inv.user_id,
  inv.id                                                  AS item_id,
  inv.product_name,
  inv.sku,
  inv.category,
  inv.stock_quantity,
  inv.average_cost,
  inv.stock_value,
  inv.reorder_level,
  COALESCE(mv.cogs_last_90, 0)                            AS cogs_last_90,
  COALESCE(mv.qty_out_last_90, 0)                         AS qty_sold_last_90,
  COALESCE(rev.revenue_last_90, 0)                        AS revenue_last_90,
  COALESCE(rev.revenue_last_90, 0)
    - COALESCE(mv.cogs_last_90, 0)                        AS gross_margin_last_90,
  CASE WHEN COALESCE(inv.stock_value, 0) > 0
       THEN (COALESCE(rev.revenue_last_90, 0)
             - COALESCE(mv.cogs_last_90, 0))
            / inv.stock_value
       ELSE NULL END                                      AS gmroi_last_90,
  CASE WHEN COALESCE(mv.qty_out_last_90, 0) > 0
       THEN COALESCE(inv.stock_quantity, 0)
            / (mv.qty_out_last_90 / 90.0)
       ELSE NULL END                                      AS days_of_inventory,
  CASE WHEN COALESCE(inv.stock_value, 0) > 0
       THEN COALESCE(mv.cogs_last_90, 0)
            / inv.stock_value
       ELSE NULL END                                      AS turnover_last_90,
  mv.last_movement_date,
  CASE
    WHEN mv.last_movement_date IS NULL THEN 'dead'
    WHEN mv.last_movement_date < CURRENT_DATE - 60 THEN 'slow'
    WHEN mv.qty_out_last_90 / NULLIF(90, 0) > 1 THEN 'fast'
    ELSE 'normal'
  END                                                     AS movement_class
FROM inventory inv
LEFT JOIN movement_window mv ON mv.user_id = inv.user_id AND mv.item_id = inv.id
LEFT JOIN revenue rev        ON rev.user_id = inv.user_id AND rev.item_id = inv.id
WHERE inv.type = 'goods';

-- 5d. Per-item movement ledger with running balance.
CREATE OR REPLACE VIEW v_item_movement_ledger AS
SELECT
  m.id,
  m.user_id,
  m.item_id,
  inv.product_name,
  m.movement_date,
  m.movement_type,
  m.source_type,
  m.source_id,
  m.source_number,
  m.party_name,
  m.quantity_in,
  m.quantity_out,
  m.value_in,
  m.value_out,
  m.cogs_amount,
  m.unit_cost,
  w.name                              AS warehouse_name,
  m.notes,
  SUM(m.quantity_in - m.quantity_out)
    OVER (PARTITION BY m.user_id, m.item_id
          ORDER BY m.movement_date, m.created_at
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_qty,
  SUM(m.value_in - m.value_out)
    OVER (PARTITION BY m.user_id, m.item_id
          ORDER BY m.movement_date, m.created_at
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_value
FROM inventory_movements m
JOIN inventory inv ON inv.id = m.item_id
LEFT JOIN warehouses w ON w.id = m.warehouse_id;

-- ── 6. Approval rules — extend entity_type for stock ops ────────────────────
DO $$
BEGIN
  PERFORM 1 FROM pg_constraint
   WHERE conrelid = 'approval_rules'::regclass AND contype = 'c'
     AND conname = 'approval_rules_entity_type_check';
  IF FOUND THEN
    ALTER TABLE approval_rules DROP CONSTRAINT approval_rules_entity_type_check;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='approval_rules') THEN
    BEGIN
      ALTER TABLE approval_rules
        ADD CONSTRAINT approval_rules_entity_type_check CHECK (
          entity_type IN (
            'bill','expense','payment','advance','journal',
            'invoice','credit_note','payment_received','customer_advance',
            'stock_adjustment','warehouse_transfer'
          )
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ── 7. journals.source_type — add 'warehouse_transfer' ─────────────────────
-- (Same dance as previous migrations — drop + re-add with new entry.)
DO $$
BEGIN
  PERFORM 1 FROM pg_constraint
   WHERE conrelid = 'journals'::regclass AND contype = 'c' AND conname = 'journals_source_type_chk';
  IF FOUND THEN
    ALTER TABLE journals DROP CONSTRAINT journals_source_type_chk;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journals') THEN
    BEGIN
      ALTER TABLE journals
        ADD CONSTRAINT journals_source_type_chk CHECK (
          source_type IS NULL OR source_type IN (
            'bill', 'bill_reversal',
            'expense', 'expense_reversal',
            'payment', 'payment_reversal',
            'advance', 'advance_reversal',
            'advance_adjustment', 'advance_adjustment_reversal',
            'invoice', 'invoice_reversal',
            'payment_received', 'payment_received_reversal',
            'cash_memo', 'cash_memo_reversal',
            'cogs', 'cogs_reversal',
            'inventory_adjustment',
            'customer_advance', 'customer_advance_reversal',
            'customer_advance_adjustment', 'customer_advance_adjustment_reversal',
            'credit_note', 'credit_note_reversal',
            'sales_return', 'sales_return_reversal',
            'debit_note', 'debit_note_reversal',
            'purchase_return', 'purchase_return_reversal',
            'warehouse_transfer', 'warehouse_transfer_reversal',
            'payment_link',
            'gst_payment',
            'tds_payment',
            'accrual', 'accrual_reversal',
            'recurring',
            'opening_balance',
            'manual',
            'reversal'
          )
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ── 8. PostgREST schema reload ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE warehouse_transfers IS
  'Inter-warehouse stock transfer headers. No P&L impact for same-GSTIN transfers; cross-GSTIN flagged via same_gstin=false for deemed-supply treatment.';
COMMENT ON TABLE stock_adjustment_items IS
  'Normalised line items for stock_adjustments. Coexists with the legacy items JSONB column.';
COMMENT ON TABLE inventory_forecasts IS
  'Per-item reorder forecasts (moving avg today, ML-pluggable). One row per (item, date).';
COMMENT ON TABLE inventory_anomalies IS
  'Detector output for abnormal stock movements, duplicate items, valuation drift, etc.';
COMMENT ON VIEW v_inventory_gl_reconciliation IS
  'Sums inventory.stock_value vs Inventory Asset closing balance in trial_balance. variance≈0 = healthy.';
COMMENT ON VIEW v_hsn_summary IS
  'HSN-wise outward (invoice) and inward (bill) summary. Drives GSTR-1 HSN section.';
COMMENT ON VIEW v_inventory_kpi IS
  'Per-item KPI: revenue 90d, COGS 90d, margin, GMROI, days-of-inventory, turnover, movement_class.';
COMMENT ON VIEW v_item_movement_ledger IS
  'Per-item movement drill-down with running quantity + running value.';
