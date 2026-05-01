-- ============================================================================
-- Real-time inventory ledger, valuation, warehouses, batches, and alerts
-- ============================================================================

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS average_cost DECIMAL(14,4) DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS stock_value DECIMAL(14,2) DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS valuation_method TEXT DEFAULT 'average'
  CHECK (valuation_method IN ('average', 'fifo'));
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS negative_stock_policy TEXT DEFAULT 'block'
  CHECK (negative_stock_policy IN ('block', 'warn', 'allow'));
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS track_batch BOOLEAN DEFAULT FALSE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS track_serial BOOLEAN DEFAULT FALSE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS base_uom TEXT DEFAULT 'pcs';

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, code)
);

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS default_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS inventory_settings (
  user_id TEXT PRIMARY KEY,
  valuation_method TEXT DEFAULT 'average' CHECK (valuation_method IN ('average', 'fifo')),
  negative_stock_policy TEXT DEFAULT 'block' CHECK (negative_stock_policy IN ('block', 'warn', 'allow')),
  auto_post_journals BOOLEAN DEFAULT TRUE,
  enable_batches BOOLEAN DEFAULT FALSE,
  enable_multi_warehouse BOOLEAN DEFAULT FALSE,
  dead_stock_days INTEGER DEFAULT 90,
  fast_moving_days INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  batch_number TEXT,
  serial_number TEXT,
  expiry_date DATE,
  received_date DATE DEFAULT CURRENT_DATE,
  quantity_on_hand DECIMAL(14,4) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0,
  remaining_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  source_type TEXT,
  source_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN (
      'opening', 'purchase', 'sale', 'sales_return', 'purchase_return',
      'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out'
    )
  ),
  source_type TEXT NOT NULL,
  source_id UUID,
  source_number TEXT,
  party_id UUID,
  party_name TEXT,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity_in DECIMAL(14,4) NOT NULL DEFAULT 0,
  quantity_out DECIMAL(14,4) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0,
  value_in DECIMAL(14,2) NOT NULL DEFAULT 0,
  value_out DECIMAL(14,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  cogs_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  valuation_method TEXT DEFAULT 'average' CHECK (valuation_method IN ('average', 'fifo')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS inventory_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('low_stock', 'dead_stock', 'fast_moving', 'expiry')),
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS unit_conversions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  from_uom TEXT NOT NULL,
  to_uom TEXT NOT NULL,
  factor DECIMAL(14,6) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, item_id, from_uom, to_uom)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_user_item_date
  ON inventory_movements(user_id, item_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_source
  ON inventory_movements(user_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_user_item_fifo
  ON inventory_batches(user_id, item_id, received_date, created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_user_unresolved
  ON inventory_alerts(user_id, is_resolved, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_warehouses_user
  ON warehouses(user_id, is_active);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_conversions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'warehouses' AND policyname = 'Users can manage their own warehouses') THEN
    CREATE POLICY "Users can manage their own warehouses" ON warehouses FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_settings' AND policyname = 'Users can manage their own inventory settings') THEN
    CREATE POLICY "Users can manage their own inventory settings" ON inventory_settings FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_batches' AND policyname = 'Users can manage their own inventory batches') THEN
    CREATE POLICY "Users can manage their own inventory batches" ON inventory_batches FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_movements' AND policyname = 'Users can manage their own inventory movements') THEN
    CREATE POLICY "Users can manage their own inventory movements" ON inventory_movements FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_alerts' AND policyname = 'Users can manage their own inventory alerts') THEN
    CREATE POLICY "Users can manage their own inventory alerts" ON inventory_alerts FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unit_conversions' AND policyname = 'Users can manage their own unit conversions') THEN
    CREATE POLICY "Users can manage their own unit conversions" ON unit_conversions FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION ensure_default_warehouse(p_user_id TEXT)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM warehouses
  WHERE user_id = p_user_id AND is_default = TRUE
  ORDER BY created_at
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO warehouses(user_id, name, code, is_default)
    VALUES (p_user_id, 'Main Warehouse', 'MAIN', TRUE)
    ON CONFLICT (user_id, code) DO UPDATE SET is_default = TRUE
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_inventory_rollup()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id UUID := COALESCE(NEW.item_id, OLD.item_id);
  v_user_id TEXT := COALESCE(NEW.user_id, OLD.user_id);
  v_qty DECIMAL(14,4);
  v_value DECIMAL(14,2);
BEGIN
  SELECT
    COALESCE(SUM(quantity_in - quantity_out), 0),
    COALESCE(SUM(value_in - value_out), 0)
  INTO v_qty, v_value
  FROM inventory_movements
  WHERE user_id = v_user_id AND item_id = v_item_id;

  UPDATE inventory
  SET
    stock_quantity = v_qty,
    stock_value = ROUND(v_value, 2),
    average_cost = CASE WHEN v_qty > 0 THEN ROUND(v_value / v_qty, 4) ELSE 0 END,
    updated_at = TIMEZONE('utc', NOW())
  WHERE id = v_item_id AND user_id = v_user_id;

  INSERT INTO inventory_alerts(user_id, item_id, alert_type, severity, title, message)
  SELECT
    i.user_id,
    i.id,
    'low_stock',
    CASE WHEN COALESCE(i.stock_quantity, 0) <= 0 THEN 'critical' ELSE 'warning' END,
    'Low stock: ' || i.product_name,
    i.product_name || ' is at ' || COALESCE(i.stock_quantity, 0)::TEXT || ' ' || COALESCE(i.uom, 'pcs') ||
      ', reorder level ' || COALESCE(i.reorder_level, 0)::TEXT
  FROM inventory i
  WHERE i.id = v_item_id
    AND i.user_id = v_user_id
    AND i.type = 'goods'
    AND COALESCE(i.reorder_level, 0) >= 0
    AND COALESCE(i.stock_quantity, 0) <= COALESCE(i.reorder_level, 0)
    AND NOT EXISTS (
      SELECT 1 FROM inventory_alerts a
      WHERE a.user_id = i.user_id
        AND a.item_id = i.id
        AND a.alert_type = 'low_stock'
        AND a.is_resolved = FALSE
    );

  UPDATE inventory_alerts
  SET is_resolved = TRUE, resolved_at = TIMEZONE('utc', NOW())
  WHERE user_id = v_user_id
    AND item_id = v_item_id
    AND alert_type = 'low_stock'
    AND is_resolved = FALSE
    AND EXISTS (
      SELECT 1 FROM inventory i
      WHERE i.id = v_item_id
        AND COALESCE(i.stock_quantity, 0) > COALESCE(i.reorder_level, 0)
    );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_movement_refresh_rollup ON inventory_movements;
CREATE TRIGGER inventory_movement_refresh_rollup
  AFTER INSERT OR UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION refresh_inventory_rollup();

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  adjustment_number TEXT NOT NULL,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  status TEXT DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'void')),
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, adjustment_number)
);

ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_adjustments' AND policyname = 'Users can manage their own stock adjustments') THEN
    CREATE POLICY "Users can manage their own stock adjustments" ON stock_adjustments FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_user_date
  ON stock_adjustments(user_id, adjustment_date DESC);

CREATE OR REPLACE VIEW vw_stock_summary AS
SELECT
  i.user_id,
  i.id AS item_id,
  i.product_name,
  i.sku,
  i.category,
  i.type,
  i.uom,
  i.stock_quantity,
  i.reorder_level,
  i.average_cost,
  i.stock_value,
  i.valuation_method,
  CASE
    WHEN i.type = 'goods' AND COALESCE(i.stock_quantity, 0) <= COALESCE(i.reorder_level, 0) THEN TRUE
    ELSE FALSE
  END AS is_low_stock
FROM inventory i;

CREATE OR REPLACE VIEW vw_inventory_valuation AS
SELECT
  user_id,
  category,
  valuation_method,
  COUNT(*) FILTER (WHERE type = 'goods') AS item_count,
  SUM(COALESCE(stock_quantity, 0)) FILTER (WHERE type = 'goods') AS total_quantity,
  SUM(COALESCE(stock_value, 0)) FILTER (WHERE type = 'goods') AS total_value
FROM inventory
GROUP BY user_id, category, valuation_method;

CREATE OR REPLACE VIEW vw_cogs_report AS
SELECT
  user_id,
  movement_date,
  source_type,
  source_number,
  party_name,
  item_id,
  SUM(quantity_out) AS quantity_sold,
  SUM(cogs_amount) AS cogs_amount
FROM inventory_movements
WHERE movement_type IN ('sale', 'purchase_return', 'adjustment_out')
GROUP BY user_id, movement_date, source_type, source_number, party_name, item_id;

CREATE OR REPLACE VIEW vw_item_profitability AS
WITH sales_lines AS (
  SELECT
    i.user_id,
    i.invoice_number,
    i.invoice_date,
    i.client_name,
    line.value->>'product_id' AS item_id,
    COALESCE((line.value->>'quantity')::NUMERIC, 0) AS quantity,
    COALESCE((line.value->>'amount')::NUMERIC, 0) AS revenue
  FROM invoices i
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.items_with_product_id, i.items, '[]'::jsonb)) AS line(value)
  WHERE COALESCE((line.value->>'__tax_meta')::BOOLEAN, FALSE) = FALSE
    AND line.value ? 'product_id'
),
cogs AS (
  SELECT user_id, source_number, item_id::TEXT, SUM(cogs_amount) AS cogs_amount
  FROM inventory_movements
  WHERE movement_type = 'sale'
  GROUP BY user_id, source_number, item_id
)
SELECT
  s.user_id,
  s.item_id::UUID AS item_id,
  inv.product_name,
  SUM(s.quantity) AS quantity_sold,
  SUM(s.revenue) AS revenue,
  COALESCE(SUM(c.cogs_amount), 0) AS cogs_amount,
  SUM(s.revenue) - COALESCE(SUM(c.cogs_amount), 0) AS gross_profit
FROM sales_lines s
LEFT JOIN cogs c
  ON c.user_id = s.user_id
  AND c.source_number = s.invoice_number
  AND c.item_id = s.item_id
LEFT JOIN inventory inv ON inv.id = s.item_id::UUID
WHERE s.item_id IS NOT NULL AND s.item_id <> ''
GROUP BY s.user_id, s.item_id, inv.product_name;

CREATE OR REPLACE VIEW vw_stock_aging AS
SELECT
  b.user_id,
  b.item_id,
  i.product_name,
  b.warehouse_id,
  w.name AS warehouse_name,
  b.batch_number,
  b.expiry_date,
  b.received_date,
  CURRENT_DATE - b.received_date AS age_days,
  b.quantity_on_hand,
  b.remaining_value
FROM inventory_batches b
JOIN inventory i ON i.id = b.item_id
LEFT JOIN warehouses w ON w.id = b.warehouse_id
WHERE b.quantity_on_hand > 0;

CREATE OR REPLACE VIEW vw_purchase_sales_trend AS
SELECT
  user_id,
  date_trunc('month', movement_date)::DATE AS month,
  SUM(value_in) FILTER (WHERE movement_type IN ('purchase', 'sales_return', 'adjustment_in', 'opening')) AS purchase_value,
  SUM(value_out) FILTER (WHERE movement_type IN ('sale', 'purchase_return', 'adjustment_out')) AS issue_value,
  SUM(quantity_in) AS quantity_in,
  SUM(quantity_out) AS quantity_out
FROM inventory_movements
GROUP BY user_id, date_trunc('month', movement_date)::DATE;

CREATE OR REPLACE VIEW vw_warehouse_stock AS
SELECT
  m.user_id,
  m.warehouse_id,
  COALESCE(w.name, 'Unassigned') AS warehouse_name,
  m.item_id,
  i.product_name,
  SUM(m.quantity_in - m.quantity_out) AS quantity_on_hand,
  SUM(m.value_in - m.value_out) AS stock_value
FROM inventory_movements m
JOIN inventory i ON i.id = m.item_id
LEFT JOIN warehouses w ON w.id = m.warehouse_id
GROUP BY m.user_id, m.warehouse_id, w.name, m.item_id, i.product_name;
