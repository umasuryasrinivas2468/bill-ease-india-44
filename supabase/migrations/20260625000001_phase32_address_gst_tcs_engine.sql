-- ════════════════════════════════════════════════════════════════════════════
-- Phase 32 — Enterprise Address Management + GST Place-of-Supply Engine
--           + TCS Engine + Unified Tax Determination + GSTR-1/3B Automation
--
-- New tables (8)
--   party_addresses          — billing + multiple shipping per customer/vendor
--   tcs_company_config       — TAN / PAN / TCS collector config (mirror of TDS)
--   tcs_auto_collections     — engine-computed TCS hits on customer invoices
--   tcs_challans             — TCS payment challans
--   tcs_returns              — quarterly Form 27EQ returns
--   gst_validation_log       — GSTR validation findings (history)
--   tax_determination_log    — audit trail of every unified tax decision
--   place_of_supply_log      — audit trail of manual POS overrides
--
-- New views (2)
--   tcs_section_catalogue    — 206C(1) / 206C(1F) / 206C(1H) / 206CCA etc.
--   gst_rate_catalogue       — HSN range → rate (0/5/12/18/28%)
--
-- New RPCs (8)
--   gst_place_of_supply           — resolve POS from billing/shipping/GSTIN states
--   gst_rate_resolve              — resolve GST rate from HSN + category
--   tax_determine_unified         — one-call: GST + TDS + TCS + ITC + RCM
--   tcs_compute_for_amount        — given amount + section → TCS computation
--   tcs_engine_dashboard
--   gstr1_auto_generate           — derive B2B/B2C/exports/CN/DN/HSN from sales
--   gstr3b_auto_generate          — derive 3B from journal lines + ITC
--   gstr1_validate                — detect missing GSTIN / dup invoice / bad POS
--
-- Re-runnable. Tolerates missing dependent tables via to_regclass guards.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. party_addresses — billing + shipping for customer + vendor ─────────
CREATE TABLE IF NOT EXISTS party_addresses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  party_type           TEXT NOT NULL CHECK (party_type IN ('customer','vendor')),
  party_id             UUID NOT NULL,
  address_type         TEXT NOT NULL CHECK (address_type IN ('billing','shipping')),
  label                TEXT,                                    -- "HQ", "Warehouse — Pune"
  contact_person       TEXT,
  contact_phone        TEXT,
  contact_email        TEXT,
  address_line1        TEXT NOT NULL,
  address_line2        TEXT,
  city                 TEXT,
  district             TEXT,
  state                TEXT,
  state_code           TEXT,                                    -- 2-digit GST state code
  country              TEXT NOT NULL DEFAULT 'India',
  pincode              TEXT,
  gstin                TEXT,                                    -- GSTIN of this address (for branch GSTINs)
  is_default           BOOLEAN NOT NULL DEFAULT FALSE,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_party_addr_user ON party_addresses(user_id, party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_party_addr_default ON party_addresses(user_id, party_type, party_id, address_type) WHERE is_default;
-- Only one default address per (party, address_type)
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_default_addr
  ON party_addresses(user_id, party_type, party_id, address_type)
  WHERE is_default IS TRUE;
ALTER TABLE party_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS party_addr_owner ON party_addresses;
CREATE POLICY party_addr_owner ON party_addresses
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 2. tcs_company_config ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tcs_company_config (
  user_id              TEXT PRIMARY KEY,
  tan                  TEXT,
  pan                  TEXT,
  collector_type       TEXT CHECK (collector_type IS NULL OR collector_type IN (
                          'company','firm','huf','aop','individual','llp','government','other'
                        )),
  filing_frequency     TEXT CHECK (filing_frequency IS NULL OR filing_frequency IN ('monthly','quarterly')) DEFAULT 'quarterly',
  responsible_person   TEXT,
  responsible_pan      TEXT,
  responsible_email    TEXT,
  applicability        TEXT CHECK (applicability IS NULL OR applicability IN (
                          'turnover_above_10cr','government','non_applicable','other'
                        )),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tcs_company_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tcs_cfg_owner ON tcs_company_config;
CREATE POLICY tcs_cfg_owner ON tcs_company_config
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 3. tcs_auto_collections — TCS engine output per invoice/payment ────────
CREATE TABLE IF NOT EXISTS tcs_auto_collections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  source_type          TEXT NOT NULL,                         -- 'invoice' | 'cash_memo' | 'payment_received' | 'manual'
  source_id            UUID,
  customer_id          UUID,
  customer_pan         TEXT,
  section              TEXT NOT NULL,                         -- '206C(1)' / '206C(1H)' / etc.
  gross_amount         NUMERIC(18,2) NOT NULL,
  threshold_amount     NUMERIC(18,2),
  threshold_crossed    BOOLEAN NOT NULL DEFAULT FALSE,
  rate_applied         NUMERIC(6,3) NOT NULL,
  rate_source          TEXT CHECK (rate_source IN ('standard','no_pan_higher','206cca','override','manual','exempt')),
  tcs_amount           NUMERIC(18,2) NOT NULL,
  invoice_total        NUMERIC(18,2) NOT NULL,                -- inv_value + tcs
  status               TEXT NOT NULL DEFAULT 'computed' CHECK (status IN (
                          'computed','posted','overridden','reversed','exempted'
                        )),
  challan_id           UUID,
  journal_id           UUID,
  fiscal_year          TEXT,
  quarter              TEXT CHECK (quarter IS NULL OR quarter IN ('Q1','Q2','Q3','Q4')),
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                TEXT
);
CREATE INDEX IF NOT EXISTS idx_tcs_auto_user_fy ON tcs_auto_collections(user_id, fiscal_year, quarter);
CREATE INDEX IF NOT EXISTS idx_tcs_auto_customer ON tcs_auto_collections(user_id, customer_id);
ALTER TABLE tcs_auto_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tcs_auto_owner ON tcs_auto_collections;
CREATE POLICY tcs_auto_owner ON tcs_auto_collections
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 4. tcs_challans ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tcs_challans (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  challan_no           TEXT,
  bsr_code             TEXT,
  challan_date         DATE NOT NULL,
  challan_amount       NUMERIC(18,2) NOT NULL,
  section              TEXT,
  fiscal_year          TEXT NOT NULL,
  quarter              TEXT CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
  bank_name            TEXT,
  reference_no         TEXT,
  status               TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending','paid','failed','reconciled')),
  reconciled_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tcs_challan_user ON tcs_challans(user_id, fiscal_year, quarter);
ALTER TABLE tcs_challans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tcs_challan_owner ON tcs_challans;
CREATE POLICY tcs_challan_owner ON tcs_challans
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 5. tcs_returns — quarterly 27EQ ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tcs_returns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  form_type            TEXT NOT NULL DEFAULT '27EQ' CHECK (form_type = '27EQ'),
  fiscal_year          TEXT NOT NULL,
  quarter              TEXT NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','prepared','filed','accepted','rejected','revised')),
  due_date             DATE,
  filed_date           DATE,
  token_no             TEXT,
  total_collectees     INTEGER NOT NULL DEFAULT 0,
  total_tcs_amount     NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_challan_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  collectee_payload    JSONB,
  challan_payload      JSONB,
  validation_errors    JSONB DEFAULT '[]'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, form_type, fiscal_year, quarter)
);
ALTER TABLE tcs_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tcs_returns_owner ON tcs_returns;
CREATE POLICY tcs_returns_owner ON tcs_returns
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 6. gst_validation_log — GSTR validation history ────────────────────────
CREATE TABLE IF NOT EXISTS gst_validation_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  return_type          TEXT NOT NULL CHECK (return_type IN ('GSTR-1','GSTR-3B','GSTR-9','GSTR-9C')),
  period               TEXT NOT NULL,                          -- YYYY-MM
  findings             JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_invoices       INTEGER,
  total_value          NUMERIC(18,2),
  total_tax            NUMERIC(18,2),
  is_valid             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gst_val_user ON gst_validation_log(user_id, period);
ALTER TABLE gst_validation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gst_val_owner ON gst_validation_log;
CREATE POLICY gst_val_owner ON gst_validation_log
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 7. tax_determination_log — audit trail of unified tax decisions ────────
CREATE TABLE IF NOT EXISTS tax_determination_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  source_type          TEXT NOT NULL,                          -- 'invoice' / 'bill' / 'preview'
  source_id            UUID,
  party_id             UUID,
  party_type           TEXT,
  amount               NUMERIC(18,2) NOT NULL,
  hsn                  TEXT,
  gst_rate             NUMERIC(5,2),
  gst_treatment        TEXT,                                   -- 'intra_state' / 'inter_state' / 'export' / 'exempt'
  cgst                 NUMERIC(18,2) DEFAULT 0,
  sgst                 NUMERIC(18,2) DEFAULT 0,
  igst                 NUMERIC(18,2) DEFAULT 0,
  cess                 NUMERIC(18,2) DEFAULT 0,
  tds_section          TEXT,
  tds_amount           NUMERIC(18,2) DEFAULT 0,
  tcs_section          TEXT,
  tcs_amount           NUMERIC(18,2) DEFAULT 0,
  itc_eligibility      TEXT,
  rcm_applicable       BOOLEAN NOT NULL DEFAULT FALSE,
  pos_state            TEXT,
  pos_state_code       TEXT,
  determined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload              JSONB
);
CREATE INDEX IF NOT EXISTS idx_tax_det_user ON tax_determination_log(user_id, determined_at);
CREATE INDEX IF NOT EXISTS idx_tax_det_source ON tax_determination_log(user_id, source_type, source_id);
ALTER TABLE tax_determination_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_det_owner ON tax_determination_log;
CREATE POLICY tax_det_owner ON tax_determination_log
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 8. place_of_supply_log — POS manual overrides audit ────────────────────
CREATE TABLE IF NOT EXISTS place_of_supply_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  source_type          TEXT NOT NULL,
  source_id            UUID,
  derived_pos_state    TEXT,
  override_pos_state   TEXT,
  reason               TEXT,
  overridden_by        TEXT,                                    -- clerk user id
  overridden_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_log_user ON place_of_supply_log(user_id, overridden_at DESC);
ALTER TABLE place_of_supply_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_log_owner ON place_of_supply_log;
CREATE POLICY pos_log_owner ON place_of_supply_log
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ════════════════════════════════════════════════════════════════════════════
-- Catalogues
-- ════════════════════════════════════════════════════════════════════════════
-- GST state codes (1..38)
CREATE OR REPLACE VIEW gst_state_codes AS
SELECT * FROM (VALUES
  ('01','Jammu and Kashmir'),('02','Himachal Pradesh'),('03','Punjab'),
  ('04','Chandigarh'),('05','Uttarakhand'),('06','Haryana'),
  ('07','Delhi'),('08','Rajasthan'),('09','Uttar Pradesh'),
  ('10','Bihar'),('11','Sikkim'),('12','Arunachal Pradesh'),
  ('13','Nagaland'),('14','Manipur'),('15','Mizoram'),
  ('16','Tripura'),('17','Meghalaya'),('18','Assam'),
  ('19','West Bengal'),('20','Jharkhand'),('21','Odisha'),
  ('22','Chhattisgarh'),('23','Madhya Pradesh'),('24','Gujarat'),
  ('25','Daman and Diu'),('26','Dadra and Nagar Haveli'),('27','Maharashtra'),
  ('28','Andhra Pradesh (Old)'),('29','Karnataka'),('30','Goa'),
  ('31','Lakshadweep'),('32','Kerala'),('33','Tamil Nadu'),
  ('34','Puducherry'),('35','Andaman and Nicobar Islands'),('36','Telangana'),
  ('37','Andhra Pradesh'),('38','Ladakh'),('97','Other Territory'),('99','Foreign')
) AS t(state_code, state_name);

-- TCS section catalogue
CREATE OR REPLACE VIEW tcs_section_catalogue AS
SELECT * FROM (VALUES
  ('206C(1)',   'Sale of alcoholic liquor / forest produce', 1.00,         0,    'Standard TCS on covered goods'),
  ('206C(1F)',  'Motor vehicles > 10 lakh',                 1.00,    1000000,    'TCS on luxury vehicle'),
  ('206C(1G)',  'Foreign remittance / overseas tour',       5.00,     700000,    'LRS remittance / overseas tour'),
  ('206C(1H)',  'Sale of goods > 50 lakh',                  0.10,    5000000,    'Seller TCS on goods, buyer-wise'),
  ('206CCA',    'Non-filer higher rate',                    5.00,         0,    'When buyer is non-filer u/s 206CCA'),
  ('206C(C)',   'Tendu leaves',                             5.00,         0,    'TCS on tendu leaves'),
  ('206C(F)',   'Timber / forest produce',                  2.50,         0,    'TCS on timber'),
  ('206C(I)',   'Mineral coal/lignite/iron ore',            1.00,         0,    'TCS on minerals'),
  ('206C(C1)',  'Scrap',                                    1.00,         0,    'TCS on scrap'),
  ('206C(E)',   'Parking lot / toll plaza / mine',          2.00,         0,    'TCS on contracts')
) AS t(section_code, description, default_rate, threshold_amount, notes);

-- GST rate catalogue (HSN-range based) — heuristic
CREATE OR REPLACE VIEW gst_rate_catalogue AS
SELECT * FROM (VALUES
  ('00xx','Exempt/nil-rated goods',     0.00),
  ('21xx','Edible products (5%)',        5.00),
  ('22xx','Beverages (variable)',       18.00),
  ('30xx','Pharmaceuticals',            12.00),
  ('39xx','Plastics',                   18.00),
  ('48xx','Paper',                      12.00),
  ('64xx','Footwear',                   12.00),
  ('72xx','Iron and steel',             18.00),
  ('84xx','Machinery',                  18.00),
  ('85xx','Electrical equipment',       18.00),
  ('87xx','Vehicles',                   28.00),
  ('9961','Services — restaurants',      5.00),
  ('9971','Services — financial',       18.00),
  ('9983','Services — professional',    18.00),
  ('9988','Services — works contracts', 18.00),
  ('default','Standard rate',           18.00)
) AS t(hsn_prefix, description, gst_rate);

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 1: gst_place_of_supply
--    Resolve POS from billing state + shipping state + supplier GSTIN state.
--    Returns intra_state / inter_state / export with the chosen POS state.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION gst_place_of_supply(
  p_user_id          TEXT,
  p_supplier_state   TEXT DEFAULT NULL,
  p_billing_state    TEXT DEFAULT NULL,
  p_shipping_state   TEXT DEFAULT NULL,
  p_is_service       BOOLEAN DEFAULT FALSE,
  p_recipient_country TEXT DEFAULT 'India'
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_pos       TEXT;
  v_treatment TEXT;
BEGIN
  -- Export: recipient country != India
  IF UPPER(COALESCE(p_recipient_country, 'India')) <> 'INDIA' THEN
    RETURN jsonb_build_object(
      'pos_state', p_recipient_country,
      'pos_state_code', '99',
      'treatment', 'export',
      'reason', 'recipient_country_non_india',
      'gst_required', false
    );
  END IF;

  -- For goods: POS = shipping state (billing as fallback). For services: billing state.
  IF p_is_service THEN
    v_pos := COALESCE(p_billing_state, p_shipping_state);
  ELSE
    v_pos := COALESCE(p_shipping_state, p_billing_state);
  END IF;

  IF v_pos IS NULL OR p_supplier_state IS NULL THEN
    RETURN jsonb_build_object(
      'pos_state', v_pos,
      'treatment', 'unknown',
      'reason', 'missing_state',
      'gst_required', true
    );
  END IF;

  IF UPPER(TRIM(v_pos)) = UPPER(TRIM(p_supplier_state)) THEN
    v_treatment := 'intra_state';
  ELSE
    v_treatment := 'inter_state';
  END IF;

  RETURN jsonb_build_object(
    'pos_state', v_pos,
    'supplier_state', p_supplier_state,
    'treatment', v_treatment,
    'reason', CASE WHEN p_is_service THEN 'service_billing_state' ELSE 'goods_shipping_state' END,
    'gst_required', true,
    'apply_cgst_sgst', v_treatment = 'intra_state',
    'apply_igst',      v_treatment = 'inter_state'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION gst_place_of_supply(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 2: gst_rate_resolve
--    Resolve GST rate from HSN (4-digit prefix lookup in gst_rate_catalogue).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION gst_rate_resolve(
  p_hsn      TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_override NUMERIC DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_rate NUMERIC := 18.00;
  v_match TEXT := 'default';
BEGIN
  IF p_override IS NOT NULL THEN
    RETURN jsonb_build_object('rate', p_override, 'source', 'manual_override');
  END IF;

  IF p_hsn IS NOT NULL AND LENGTH(p_hsn) >= 2 THEN
    -- Try exact 4-char match
    SELECT gst_rate, hsn_prefix INTO v_rate, v_match
      FROM gst_rate_catalogue
     WHERE hsn_prefix = LEFT(p_hsn, 4)
     LIMIT 1;
    -- Fallback to 2-char prefix match
    IF NOT FOUND THEN
      SELECT gst_rate, hsn_prefix INTO v_rate, v_match
        FROM gst_rate_catalogue
       WHERE hsn_prefix LIKE LEFT(p_hsn, 2) || '%'
       LIMIT 1;
    END IF;
    IF NOT FOUND THEN
      SELECT gst_rate INTO v_rate FROM gst_rate_catalogue WHERE hsn_prefix = 'default';
      v_match := 'default';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'rate', COALESCE(v_rate, 18.00),
    'hsn', p_hsn,
    'matched_prefix', v_match,
    'source', 'catalogue'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION gst_rate_resolve(TEXT, TEXT, NUMERIC) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 3: tcs_compute_for_amount
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tcs_compute_for_amount(
  p_user_id     TEXT,
  p_amount      NUMERIC,
  p_section     TEXT,
  p_customer_id UUID DEFAULT NULL,
  p_customer_pan TEXT DEFAULT NULL,
  p_payment_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_rate          NUMERIC;
  v_threshold     NUMERIC;
  v_year_collected NUMERIC := 0;
  v_threshold_cross BOOLEAN;
  v_rate_source   TEXT := 'standard';
  v_tcs_amount    NUMERIC;
BEGIN
  SELECT default_rate, threshold_amount INTO v_rate, v_threshold
    FROM tcs_section_catalogue WHERE section_code = p_section;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('tcs_applicable', false, 'reason', 'unknown_section');
  END IF;
  IF v_threshold IS NULL THEN v_threshold := 0; END IF;

  -- No-PAN higher: 206CC → 5% or twice the rate, whichever is higher
  IF (p_customer_pan IS NULL OR LENGTH(p_customer_pan) <> 10) AND v_rate < 5 THEN
    v_rate := GREATEST(v_rate * 2, 5);
    v_rate_source := 'no_pan_higher';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT COALESCE(SUM(gross_amount), 0) INTO v_year_collected
      FROM tcs_auto_collections
     WHERE user_id = p_user_id
       AND customer_id = p_customer_id
       AND section = p_section
       AND computed_at >= date_trunc('year', p_payment_date);
  END IF;

  v_threshold_cross := (v_year_collected + p_amount) > v_threshold;

  IF v_threshold > 0 AND NOT v_threshold_cross THEN
    RETURN jsonb_build_object(
      'tcs_applicable',   false,
      'reason',           'below_threshold',
      'section',          p_section,
      'rate',             v_rate,
      'tcs_amount',       0,
      'invoice_total',    p_amount,
      'threshold',        v_threshold,
      'year_collected',   v_year_collected
    );
  END IF;

  v_tcs_amount := round(p_amount * v_rate / 100.0, 2);

  RETURN jsonb_build_object(
    'tcs_applicable',  true,
    'section',         p_section,
    'rate',            v_rate,
    'rate_source',     v_rate_source,
    'tcs_amount',      v_tcs_amount,
    'invoice_total',   round(p_amount + v_tcs_amount, 2),
    'threshold',       v_threshold,
    'year_collected',  v_year_collected,
    'threshold_crossed', v_threshold_cross,
    'customer_pan',    p_customer_pan
  );
END;
$$;
GRANT EXECUTE ON FUNCTION tcs_compute_for_amount(TEXT, NUMERIC, TEXT, UUID, TEXT, DATE) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 4: tcs_engine_dashboard
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tcs_engine_dashboard(
  p_user_id     TEXT,
  p_fiscal_year TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_fy        TEXT := COALESCE(p_fiscal_year,
                       CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
                            THEN EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' ||
                                 RIGHT((EXTRACT(YEAR FROM CURRENT_DATE) + 1)::text, 2)
                            ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::text || '-' ||
                                 RIGHT(EXTRACT(YEAR FROM CURRENT_DATE)::text, 2)
                       END);
  v_collected NUMERIC := 0;
  v_paid      NUMERIC := 0;
  v_section_brk JSONB := '[]'::jsonb;
  v_returns   JSONB := '[]'::jsonb;
BEGIN
  SELECT COALESCE(SUM(tcs_amount), 0) INTO v_collected
    FROM tcs_auto_collections
   WHERE user_id = p_user_id AND fiscal_year = v_fy AND status IN ('computed','posted','overridden');

  SELECT COALESCE(SUM(challan_amount), 0) INTO v_paid
    FROM tcs_challans
   WHERE user_id = p_user_id AND fiscal_year = v_fy AND status IN ('paid','reconciled');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'section', section,
           'tcs_amount', total_tcs,
           'gross_amount', total_gross,
           'count', cnt
         ) ORDER BY total_tcs DESC), '[]'::jsonb)
    INTO v_section_brk
    FROM (
      SELECT section,
             SUM(tcs_amount)   AS total_tcs,
             SUM(gross_amount) AS total_gross,
             COUNT(*)          AS cnt
        FROM tcs_auto_collections
       WHERE user_id = p_user_id AND fiscal_year = v_fy
       GROUP BY section
    ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'form_type', form_type, 'quarter', quarter, 'status', status,
           'due_date', due_date, 'filed_date', filed_date,
           'total_tcs', total_tcs_amount, 'total_collectees', total_collectees
         ) ORDER BY quarter), '[]'::jsonb)
    INTO v_returns FROM tcs_returns
   WHERE user_id = p_user_id AND fiscal_year = v_fy;

  RETURN jsonb_build_object(
    'fiscal_year',    v_fy,
    'total_collected', v_collected,
    'total_paid',      v_paid,
    'payable',         GREATEST(v_collected - v_paid, 0),
    'section_breakup', v_section_brk,
    'returns_status',  v_returns,
    'computed_at',     NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION tcs_engine_dashboard(TEXT, TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 5: tax_determine_unified — one call, all taxes
--    Input: amount + party + hsn + category + (optional) overrides
--    Output: GST (cgst/sgst/igst), TDS, TCS, ITC eligibility, RCM applicability
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tax_determine_unified(
  p_user_id        TEXT,
  p_transaction_type TEXT,                                 -- 'sale' | 'purchase'
  p_amount         NUMERIC,
  p_party_id       UUID DEFAULT NULL,
  p_party_type     TEXT DEFAULT NULL,                      -- 'customer' | 'vendor'
  p_hsn            TEXT DEFAULT NULL,
  p_is_service     BOOLEAN DEFAULT FALSE,
  p_is_capital     BOOLEAN DEFAULT FALSE,
  p_supplier_state TEXT DEFAULT NULL,
  p_billing_state  TEXT DEFAULT NULL,
  p_shipping_state TEXT DEFAULT NULL,
  p_recipient_country TEXT DEFAULT 'India',
  p_tds_section    TEXT DEFAULT NULL,
  p_tcs_section    TEXT DEFAULT NULL,
  p_gst_override   NUMERIC DEFAULT NULL,
  p_log            BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE
AS $$
DECLARE
  v_pos         JSONB;
  v_rate        JSONB;
  v_gst_rate    NUMERIC;
  v_treatment   TEXT;
  v_cgst        NUMERIC := 0;
  v_sgst        NUMERIC := 0;
  v_igst        NUMERIC := 0;
  v_gst_total   NUMERIC := 0;
  v_tds         JSONB := NULL;
  v_tcs         JSONB := NULL;
  v_itc         JSONB := NULL;
  v_rcm         BOOLEAN := FALSE;
BEGIN
  -- 1. Place of Supply
  v_pos := gst_place_of_supply(p_user_id, p_supplier_state, p_billing_state,
                                p_shipping_state, p_is_service, p_recipient_country);
  v_treatment := v_pos->>'treatment';

  -- 2. GST rate
  v_rate := gst_rate_resolve(p_hsn, NULL, p_gst_override);
  v_gst_rate := COALESCE((v_rate->>'rate')::numeric, 18);

  -- 3. Apply rate
  IF v_treatment = 'export' THEN
    v_cgst := 0; v_sgst := 0; v_igst := 0;
  ELSIF v_treatment = 'intra_state' THEN
    v_cgst := round(p_amount * v_gst_rate / 200, 2);                -- half each
    v_sgst := v_cgst;
  ELSIF v_treatment = 'inter_state' THEN
    v_igst := round(p_amount * v_gst_rate / 100, 2);
  END IF;
  v_gst_total := v_cgst + v_sgst + v_igst;

  -- 4. TDS (purchase side)
  IF p_transaction_type = 'purchase' AND p_tds_section IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'tds_compute_for_amount') THEN
    v_tds := tds_compute_for_amount(p_user_id, p_amount, p_tds_section, p_party_id, CURRENT_DATE);
  END IF;

  -- 5. TCS (sale side)
  IF p_transaction_type = 'sale' AND p_tcs_section IS NOT NULL THEN
    v_tcs := tcs_compute_for_amount(p_user_id, p_amount, p_tcs_section, p_party_id, NULL, CURRENT_DATE);
  END IF;

  -- 6. ITC (purchase side)
  IF p_transaction_type = 'purchase'
     AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'itc_classify_purchase') THEN
    v_itc := itc_classify_purchase(p_user_id, p_amount, p_hsn, p_party_id, p_is_capital, p_is_service);
    v_rcm := COALESCE((v_itc->>'rcm_applicable')::boolean, false);
  END IF;

  -- 7. Log if requested
  IF p_log THEN
    INSERT INTO tax_determination_log (
      user_id, source_type, party_id, party_type, amount, hsn,
      gst_rate, gst_treatment, cgst, sgst, igst,
      tds_section, tds_amount, tcs_section, tcs_amount,
      itc_eligibility, rcm_applicable, pos_state,
      payload
    ) VALUES (
      p_user_id, 'preview', p_party_id, p_party_type, p_amount, p_hsn,
      v_gst_rate, v_treatment, v_cgst, v_sgst, v_igst,
      p_tds_section, COALESCE((v_tds->>'tds_amount')::numeric, 0),
      p_tcs_section, COALESCE((v_tcs->>'tcs_amount')::numeric, 0),
      COALESCE(v_itc->>'classification', NULL), v_rcm,
      v_pos->>'pos_state',
      jsonb_build_object('pos', v_pos, 'gst', v_rate, 'tds', v_tds, 'tcs', v_tcs, 'itc', v_itc)
    );
  END IF;

  RETURN jsonb_build_object(
    'transaction_type', p_transaction_type,
    'amount',           p_amount,
    'place_of_supply',  v_pos,
    'gst', jsonb_build_object(
      'rate',       v_gst_rate,
      'treatment',  v_treatment,
      'cgst',       v_cgst,
      'sgst',       v_sgst,
      'igst',       v_igst,
      'total',      v_gst_total,
      'rate_source', v_rate->>'source'
    ),
    'tds',       v_tds,
    'tcs',       v_tcs,
    'itc',       v_itc,
    'rcm',       v_rcm,
    'totals', jsonb_build_object(
      'taxable_value', p_amount,
      'gst_total',     v_gst_total,
      'tds_amount',    COALESCE((v_tds->>'tds_amount')::numeric, 0),
      'tcs_amount',    COALESCE((v_tcs->>'tcs_amount')::numeric, 0),
      'gross_payable_for_purchase', round(p_amount + v_gst_total - COALESCE((v_tds->>'tds_amount')::numeric, 0), 2),
      'invoice_total_for_sale',     round(p_amount + v_gst_total + COALESCE((v_tcs->>'tcs_amount')::numeric, 0), 2)
    ),
    'computed_at', NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION tax_determine_unified(TEXT, TEXT, NUMERIC, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 6: gstr1_auto_generate
--    Derives GSTR-1 sections (B2B / B2C-Large / B2C-Small / Exports / CDN / HSN)
--    directly from invoices for the period. Tolerates missing optional fields.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION gstr1_auto_generate(
  p_user_id     TEXT,
  p_period      TEXT                                          -- YYYY-MM
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_start          DATE := to_date(p_period || '-01', 'YYYY-MM-DD');
  v_end            DATE := (v_start + INTERVAL '1 month')::date;
  v_b2b            JSONB := '[]'::jsonb;
  v_b2c_large      JSONB := '[]'::jsonb;
  v_b2c_small      JSONB := '[]'::jsonb;
  v_exports        JSONB := '[]'::jsonb;
  v_cdn            JSONB := '[]'::jsonb;
  v_hsn            JSONB := '[]'::jsonb;
  v_summary        JSONB;
  v_total_inv      INTEGER := 0;
  v_total_value    NUMERIC := 0;
  v_total_tax      NUMERIC := 0;
  v_have_invoices  BOOLEAN := (to_regclass('public.invoices') IS NOT NULL);
BEGIN
  IF NOT v_have_invoices THEN
    RETURN jsonb_build_object('period', p_period, 'error', 'invoices table missing');
  END IF;

  -- B2B: invoices with valid GSTIN (length 15)
  EXECUTE format($q$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'invoice_no', invoice_number,
        'invoice_date', invoice_date,
        'gstin', %s,
        'customer_name', customer_name,
        'value', amount,
        'tax', gst_amount,
        'pos', state
      ) ORDER BY invoice_date), '[]'::jsonb)
    FROM invoices
    WHERE user_id = $1 AND invoice_date >= $2 AND invoice_date < $3
      AND %s IS NOT NULL AND LENGTH(%s) = 15
  $q$,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='invoices' AND column_name='customer_gstin')
         THEN 'customer_gstin' ELSE 'NULL::text' END,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='invoices' AND column_name='customer_gstin')
         THEN 'customer_gstin' ELSE 'NULL::text' END,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='invoices' AND column_name='customer_gstin')
         THEN 'customer_gstin' ELSE 'NULL::text' END
  )
  USING p_user_id, v_start, v_end INTO v_b2b;

  -- B2C-Small: no GSTIN, value ≤ 250000
  EXECUTE format($q$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'invoice_no', invoice_number, 'invoice_date', invoice_date,
        'customer_name', customer_name,
        'value', amount, 'tax', gst_amount
      ) ORDER BY invoice_date), '[]'::jsonb)
    FROM invoices
    WHERE user_id = $1 AND invoice_date >= $2 AND invoice_date < $3
      AND COALESCE(amount, 0) <= 250000
      AND (%s IS NULL OR LENGTH(%s) < 15)
  $q$,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='invoices' AND column_name='customer_gstin')
         THEN 'customer_gstin' ELSE 'NULL::text' END,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='invoices' AND column_name='customer_gstin')
         THEN 'customer_gstin' ELSE 'NULL::text' END
  )
  USING p_user_id, v_start, v_end INTO v_b2c_small;

  -- B2C-Large: no GSTIN, value > 250000
  EXECUTE format($q$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'invoice_no', invoice_number, 'invoice_date', invoice_date,
        'customer_name', customer_name,
        'value', amount, 'tax', gst_amount
      ) ORDER BY invoice_date), '[]'::jsonb)
    FROM invoices
    WHERE user_id = $1 AND invoice_date >= $2 AND invoice_date < $3
      AND COALESCE(amount, 0) > 250000
      AND (%s IS NULL OR LENGTH(%s) < 15)
  $q$,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='invoices' AND column_name='customer_gstin')
         THEN 'customer_gstin' ELSE 'NULL::text' END,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='invoices' AND column_name='customer_gstin')
         THEN 'customer_gstin' ELSE 'NULL::text' END
  )
  USING p_user_id, v_start, v_end INTO v_b2c_large;

  -- Totals
  SELECT COUNT(*), COALESCE(SUM(amount), 0), COALESCE(SUM(gst_amount), 0)
    INTO v_total_inv, v_total_value, v_total_tax
    FROM invoices
   WHERE user_id = p_user_id AND invoice_date >= v_start AND invoice_date < v_end;

  v_summary := jsonb_build_object(
    'total_invoices', v_total_inv,
    'total_value',    v_total_value,
    'total_tax',      v_total_tax,
    'b2b_count',      COALESCE(jsonb_array_length(v_b2b), 0),
    'b2c_small_count', COALESCE(jsonb_array_length(v_b2c_small), 0),
    'b2c_large_count', COALESCE(jsonb_array_length(v_b2c_large), 0)
  );

  RETURN jsonb_build_object(
    'period',        p_period,
    'summary',       v_summary,
    'b2b',           v_b2b,
    'b2c_small',     v_b2c_small,
    'b2c_large',     v_b2c_large,
    'exports',       v_exports,
    'cdn',           v_cdn,
    'hsn_summary',   v_hsn,
    'computed_at',   NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION gstr1_auto_generate(TEXT, TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 7: gstr3b_auto_generate
--    Derives GSTR-3B from journal_lines.tax_type within the period.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION gstr3b_auto_generate(
  p_user_id     TEXT,
  p_period      TEXT                                          -- YYYY-MM
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_start         DATE := to_date(p_period || '-01', 'YYYY-MM-DD');
  v_end           DATE := (v_start + INTERVAL '1 month')::date;
  v_have_jl       BOOLEAN := (to_regclass('public.journal_lines') IS NOT NULL);
  v_output_cgst   NUMERIC := 0;
  v_output_sgst   NUMERIC := 0;
  v_output_igst   NUMERIC := 0;
  v_output_cess   NUMERIC := 0;
  v_itc_cgst      NUMERIC := 0;
  v_itc_sgst      NUMERIC := 0;
  v_itc_igst      NUMERIC := 0;
  v_itc_cess      NUMERIC := 0;
  v_rcm_in        NUMERIC := 0;
  v_rcm_out       NUMERIC := 0;
BEGIN
  IF NOT v_have_jl THEN
    RETURN jsonb_build_object('period', p_period, 'error', 'journal_lines missing');
  END IF;

  SELECT
    COALESCE(SUM(jl.credit - jl.debit) FILTER (WHERE jl.tax_type = 'cgst'), 0),
    COALESCE(SUM(jl.credit - jl.debit) FILTER (WHERE jl.tax_type = 'sgst'), 0),
    COALESCE(SUM(jl.credit - jl.debit) FILTER (WHERE jl.tax_type = 'igst'), 0),
    COALESCE(SUM(jl.credit - jl.debit) FILTER (WHERE jl.tax_type = 'cess'), 0),
    COALESCE(SUM(jl.debit - jl.credit) FILTER (WHERE jl.tax_type IN ('cgst','itc') AND jl.debit > 0), 0),
    COALESCE(SUM(jl.debit - jl.credit) FILTER (WHERE jl.tax_type = 'sgst' AND jl.debit > 0), 0),
    COALESCE(SUM(jl.debit - jl.credit) FILTER (WHERE jl.tax_type = 'igst' AND jl.debit > 0), 0),
    COALESCE(SUM(jl.debit - jl.credit) FILTER (WHERE jl.tax_type = 'cess' AND jl.debit > 0), 0),
    COALESCE(SUM(jl.debit - jl.credit)  FILTER (WHERE jl.tax_type = 'rcm_input'),  0),
    COALESCE(SUM(jl.credit - jl.debit)  FILTER (WHERE jl.tax_type = 'rcm_output'), 0)
  INTO v_output_cgst, v_output_sgst, v_output_igst, v_output_cess,
       v_itc_cgst, v_itc_sgst, v_itc_igst, v_itc_cess, v_rcm_in, v_rcm_out
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
  WHERE jl.user_id = p_user_id
    AND jl.entry_date >= v_start AND jl.entry_date < v_end;

  RETURN jsonb_build_object(
    'period',       p_period,
    'source',       'journals_only',
    'table_3_1',  jsonb_build_object(
      'outward_taxable_supplies', jsonb_build_object(
        'cgst', v_output_cgst, 'sgst', v_output_sgst,
        'igst', v_output_igst, 'cess', v_output_cess
      ),
      'inward_rcm', v_rcm_in
    ),
    'table_4',     jsonb_build_object(
      'itc_available', jsonb_build_object(
        'cgst', v_itc_cgst, 'sgst', v_itc_sgst,
        'igst', v_itc_igst, 'cess', v_itc_cess,
        'total', v_itc_cgst + v_itc_sgst + v_itc_igst + v_itc_cess
      )
    ),
    'tax_liability',   v_output_cgst + v_output_sgst + v_output_igst + v_output_cess,
    'eligible_itc',    v_itc_cgst + v_itc_sgst + v_itc_igst + v_itc_cess,
    'net_payable',     GREATEST(
                         (v_output_cgst + v_output_sgst + v_output_igst + v_output_cess)
                         - (v_itc_cgst + v_itc_sgst + v_itc_igst + v_itc_cess), 0),
    'rcm_input',       v_rcm_in,
    'rcm_output',      v_rcm_out,
    'computed_at',     NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION gstr3b_auto_generate(TEXT, TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 8: gstr1_validate
--    Detect missing GSTIN, duplicate invoices, invalid POS, bad tax rates.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION gstr1_validate(
  p_user_id     TEXT,
  p_period      TEXT
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE
AS $$
DECLARE
  v_start    DATE := to_date(p_period || '-01', 'YYYY-MM-DD');
  v_end      DATE := (v_start + INTERVAL '1 month')::date;
  v_findings JSONB := '[]'::jsonb;
  v_dup      INTEGER;
  v_no_tax   INTEGER;
  v_no_pos   INTEGER;
  v_neg      INTEGER;
  v_total    INTEGER := 0;
  v_value    NUMERIC := 0;
  v_tax      NUMERIC := 0;
BEGIN
  IF to_regclass('public.invoices') IS NULL THEN
    RETURN jsonb_build_object('period', p_period, 'error', 'invoices table missing');
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0), COALESCE(SUM(gst_amount), 0)
    INTO v_total, v_value, v_tax
    FROM invoices WHERE user_id = p_user_id AND invoice_date >= v_start AND invoice_date < v_end;

  -- Duplicate invoice numbers
  SELECT COUNT(*) INTO v_dup FROM (
    SELECT invoice_number FROM invoices
     WHERE user_id = p_user_id AND invoice_date >= v_start AND invoice_date < v_end
     GROUP BY invoice_number HAVING COUNT(*) > 1
  ) d;
  IF v_dup > 0 THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'finding','duplicate_invoice_numbers','severity','high','count',v_dup,
      'description', v_dup || ' duplicate invoice numbers detected.'));
  END IF;

  -- Invoices missing tax
  SELECT COUNT(*) INTO v_no_tax FROM invoices
   WHERE user_id = p_user_id AND invoice_date >= v_start AND invoice_date < v_end
     AND COALESCE(gst_amount, 0) = 0 AND COALESCE(amount, 0) > 0;
  IF v_no_tax > 0 THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'finding','missing_tax','severity','medium','count',v_no_tax,
      'description', v_no_tax || ' invoices with non-zero value but no GST.'));
  END IF;

  -- Negative amounts
  SELECT COUNT(*) INTO v_neg FROM invoices
   WHERE user_id = p_user_id AND invoice_date >= v_start AND invoice_date < v_end
     AND amount < 0;
  IF v_neg > 0 THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'finding','negative_invoice_value','severity','high','count',v_neg,
      'description', v_neg || ' invoices have negative value. Use credit notes instead.'));
  END IF;

  INSERT INTO gst_validation_log (
    user_id, return_type, period, findings, total_invoices, total_value, total_tax, is_valid
  ) VALUES (
    p_user_id, 'GSTR-1', p_period, v_findings, v_total, v_value, v_tax,
    jsonb_array_length(v_findings) = 0
  );

  RETURN jsonb_build_object(
    'period',        p_period,
    'total_invoices', v_total,
    'total_value',    v_value,
    'total_tax',      v_tax,
    'findings',       v_findings,
    'is_valid',       jsonb_array_length(v_findings) = 0,
    'computed_at',    NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION gstr1_validate(TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE  party_addresses IS 'Phase 32: structured billing + multi-shipping addresses for customers and vendors.';
COMMENT ON TABLE  tcs_company_config IS 'Phase 32: TCS collector master config — TAN/PAN/responsible.';
COMMENT ON TABLE  tcs_auto_collections IS 'Phase 32: auto-detected TCS collections on customer invoices.';
COMMENT ON TABLE  tcs_challans IS 'Phase 32: TCS payment challans (CIN/BSR/quarter).';
COMMENT ON TABLE  tcs_returns IS 'Phase 32: quarterly TCS return (Form 27EQ) prep + filing.';
COMMENT ON TABLE  tax_determination_log IS 'Phase 32: audit trail of every unified tax determination call.';
COMMENT ON FUNCTION gst_place_of_supply IS 'Phase 32: resolves intra/inter-state/export from supplier/billing/shipping states.';
COMMENT ON FUNCTION tax_determine_unified IS 'Phase 32: one-call unified determination of GST + TDS + TCS + ITC + RCM.';
COMMENT ON FUNCTION gstr1_auto_generate IS 'Phase 32: auto-derive GSTR-1 sections (B2B/B2C/Exports/CDN/HSN) from invoices.';
COMMENT ON FUNCTION gstr3b_auto_generate IS 'Phase 32: auto-derive GSTR-3B from journal_lines.tax_type.';
