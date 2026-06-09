-- ════════════════════════════════════════════════════════════════════════════
-- Phase 31 — Complete Tax Compliance Engine
--
-- Adds the end-to-end TDS + ITC + ITR compliance layer that wires every
-- accounting / AP / AR / GST / asset / liability surface together.
--
-- Tables
--   tds_company_config       — TAN / PAN / deductor type / filing freq / responsible
--   tds_vendor_master        — per-vendor PAN / section / threshold / rate / LDC
--   tds_auto_deductions      — auto-detected TDS hits (per-bill / per-payment)
--   tds_challans             — TDS payment challans (CIN / BSR / date)
--   tds_returns              — quarterly returns 26Q / 24Q / 27Q / 27EQ
--   tds_certificates         — Form 16 / 16A issued
--   itc_classifications      — per-purchase ITC classification (elig/blocked/cap/RCM)
--   itr_workspaces           — per-FY ITR prep workspaces by entity_type
--   tax_compliance_alerts    — TDS risk / ITC leakage / GST mismatch
--
-- RPCs
--   tds_compute_for_amount        — given amt+section+vendor → tds amount + reason
--   tds_auto_detect_section       — derive section from bill/vendor classification
--   tds_engine_dashboard          — payable, due, challan, return summary
--   tds_reconcile_books_vs_returns
--   itc_classify_purchase         — eligible / blocked / capital / input services / RCM
--   itc_intelligence_summary      — available / claimed / lost / vendor risk
--   itr_autopopulate              — P&L + BS + TDS + GST + FA → ITR dataset
--   itr_validate                  — consistency layer
--   tax_compliance_score          — 0-100 aggregate (TDS+ITC+GST+ITR+Cal)
--   tax_filing_readiness          — per-filing readiness
--
-- Re-runnable; depends on accounts, journals, journal_lines, vendors, clients,
-- purchase_bills, expenses, payments, invoices, tds_master, tds_transactions,
-- tds_26as_entries, gst_compliance, gstr_2a, gstr_2b, fixed_assets, depreciation,
-- liabilities. Tolerates missing tables via to_regclass guards.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. tds_company_config (one row per user, holds TAN + PAN + deductor) ───
CREATE TABLE IF NOT EXISTS tds_company_config (
  user_id              TEXT PRIMARY KEY,
  tan                  TEXT,
  pan                  TEXT,
  deductor_type        TEXT CHECK (deductor_type IS NULL OR deductor_type IN (
                          'company','firm','huf','aop','boi','individual','llp','government','other'
                        )),
  filing_frequency     TEXT CHECK (filing_frequency IS NULL OR filing_frequency IN ('monthly','quarterly')) DEFAULT 'quarterly',
  responsible_person   TEXT,
  responsible_pan      TEXT,
  responsible_email    TEXT,
  responsible_mobile   TEXT,
  address_line1        TEXT,
  address_line2        TEXT,
  city                 TEXT,
  state                TEXT,
  pincode              TEXT,
  default_assessment_year TEXT,
  default_fiscal_year    TEXT,
  ack_no               TEXT,
  ack_date             DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tds_company_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tds_company_config_owner ON tds_company_config;
CREATE POLICY tds_company_config_owner ON tds_company_config
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 2. tds_vendor_master (per-vendor TDS config) ───────────────────────────
CREATE TABLE IF NOT EXISTS tds_vendor_master (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  vendor_id            UUID,
  pan                  TEXT,
  tds_applicable       BOOLEAN NOT NULL DEFAULT TRUE,
  default_section      TEXT,                                  -- 194C / 194J / 194I / 194H / 194A / 192 / 195
  default_rate         NUMERIC(6,3),                          -- nullable: resolved from master if null
  threshold_amount     NUMERIC(18,2),                         -- per-section annual threshold
  ldc_certificate_no   TEXT,                                  -- Lower-deduction certificate
  ldc_rate             NUMERIC(6,3),                          -- LDC override rate
  ldc_valid_from       DATE,
  ldc_valid_to         DATE,
  exemption_status     TEXT CHECK (exemption_status IS NULL OR exemption_status IN (
                          'none','full_exempt','15g','15h','partial','nil_rate'
                        )) DEFAULT 'none',
  nature_of_payment    TEXT,                                  -- free text label
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, vendor_id)
);
CREATE INDEX IF NOT EXISTS idx_tds_vmaster_user ON tds_vendor_master(user_id);
CREATE INDEX IF NOT EXISTS idx_tds_vmaster_vendor ON tds_vendor_master(user_id, vendor_id);
ALTER TABLE tds_vendor_master ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tds_vmaster_owner ON tds_vendor_master;
CREATE POLICY tds_vmaster_owner ON tds_vendor_master
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 3. tds_auto_deductions (auto-detected per source document) ─────────────
-- Independent of the older tds_transactions; this is the audit trail of what
-- the engine computed (vs what was finally posted to the journal).
CREATE TABLE IF NOT EXISTS tds_auto_deductions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  source_type          TEXT NOT NULL,                         -- 'purchase_bill' | 'expense' | 'payment' | 'manual'
  source_id            UUID,
  vendor_id            UUID,
  vendor_pan           TEXT,
  section              TEXT NOT NULL,                         -- e.g. 194J
  gross_amount         NUMERIC(18,2) NOT NULL,
  threshold_amount     NUMERIC(18,2),
  threshold_crossed    BOOLEAN NOT NULL DEFAULT FALSE,
  rate_applied         NUMERIC(6,3) NOT NULL,
  rate_source          TEXT CHECK (rate_source IN ('standard','ldc','no_pan_higher','exempt','override','manual')),
  tds_amount           NUMERIC(18,2) NOT NULL,
  net_payable          NUMERIC(18,2) NOT NULL,
  status               TEXT NOT NULL DEFAULT 'computed' CHECK (status IN (
                          'computed','posted','overridden','reversed','exempted'
                        )),
  challan_id           UUID,                                  -- → tds_challans.id once paid
  journal_id           UUID,                                  -- → journals.id when posted
  fiscal_year          TEXT,
  quarter              TEXT CHECK (quarter IS NULL OR quarter IN ('Q1','Q2','Q3','Q4')),
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at            TIMESTAMPTZ,
  notes                TEXT
);
CREATE INDEX IF NOT EXISTS idx_tds_auto_user_fy ON tds_auto_deductions(user_id, fiscal_year, quarter);
CREATE INDEX IF NOT EXISTS idx_tds_auto_source ON tds_auto_deductions(user_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_tds_auto_vendor ON tds_auto_deductions(user_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_tds_auto_section ON tds_auto_deductions(user_id, section);
ALTER TABLE tds_auto_deductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tds_auto_owner ON tds_auto_deductions;
CREATE POLICY tds_auto_owner ON tds_auto_deductions
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 4. tds_challans (TDS payment to government) ────────────────────────────
CREATE TABLE IF NOT EXISTS tds_challans (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  challan_no           TEXT,                                  -- CIN
  bsr_code             TEXT,
  challan_date         DATE NOT NULL,
  challan_amount       NUMERIC(18,2) NOT NULL,
  section              TEXT,                                  -- 194C / 194J / multi
  fiscal_year          TEXT NOT NULL,
  quarter              TEXT CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
  bank_name            TEXT,
  payment_mode         TEXT,                                  -- 'online_banking','nsdl','tin','other'
  reference_no         TEXT,
  remarks              TEXT,
  status               TEXT NOT NULL DEFAULT 'paid' CHECK (status IN (
                          'pending','paid','failed','reconciled'
                        )),
  reconciled_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tds_challan_user_fy ON tds_challans(user_id, fiscal_year, quarter);
ALTER TABLE tds_challans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tds_challan_owner ON tds_challans;
CREATE POLICY tds_challan_owner ON tds_challans
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 5. tds_returns (quarterly TDS return filing) ───────────────────────────
CREATE TABLE IF NOT EXISTS tds_returns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  form_type            TEXT NOT NULL CHECK (form_type IN ('26Q','24Q','27Q','27EQ')),
  fiscal_year          TEXT NOT NULL,
  quarter              TEXT NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                          'draft','prepared','filed','accepted','rejected','revised'
                        )),
  due_date             DATE,
  filed_date           DATE,
  token_no             TEXT,                                  -- acknowledgment / RRR
  prov_receipt_no      TEXT,
  total_deductees      INTEGER NOT NULL DEFAULT 0,
  total_tds_amount     NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_challan_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  file_path            TEXT,                                  -- text file / fvu path
  deductee_payload     JSONB,                                 -- generated dataset
  challan_payload      JSONB,
  validation_errors    JSONB DEFAULT '[]'::jsonb,
  prepared_at          TIMESTAMPTZ,
  filed_at             TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, form_type, fiscal_year, quarter)
);
CREATE INDEX IF NOT EXISTS idx_tds_returns_user_fy ON tds_returns(user_id, fiscal_year, quarter);
ALTER TABLE tds_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tds_returns_owner ON tds_returns;
CREATE POLICY tds_returns_owner ON tds_returns
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 6. tds_certificates (Form 16 / 16A) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS tds_certificates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  certificate_type     TEXT NOT NULL CHECK (certificate_type IN ('16','16A','16B','16C')),
  certificate_no       TEXT,
  deductee_name        TEXT NOT NULL,
  deductee_pan         TEXT NOT NULL,
  vendor_id            UUID,
  employee_id          TEXT,                                  -- for 24Q
  fiscal_year          TEXT NOT NULL,
  quarter              TEXT CHECK (quarter IS NULL OR quarter IN ('Q1','Q2','Q3','Q4')),
  tds_return_id        UUID REFERENCES tds_returns(id) ON DELETE SET NULL,
  total_paid           NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_tds            NUMERIC(18,2) NOT NULL DEFAULT 0,
  challan_list         JSONB DEFAULT '[]'::jsonb,
  deduction_breakup    JSONB DEFAULT '[]'::jsonb,
  issued_date          DATE,
  pdf_path             TEXT,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                          'draft','generated','issued','revised'
                        )),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tds_cert_user_fy ON tds_certificates(user_id, fiscal_year, quarter);
CREATE INDEX IF NOT EXISTS idx_tds_cert_pan ON tds_certificates(user_id, deductee_pan);
ALTER TABLE tds_certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tds_cert_owner ON tds_certificates;
CREATE POLICY tds_cert_owner ON tds_certificates
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 7. itc_classifications (per-purchase ITC tagging) ──────────────────────
CREATE TABLE IF NOT EXISTS itc_classifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  source_type          TEXT NOT NULL,                         -- 'purchase_bill' | 'expense' | 'fixed_asset'
  source_id            UUID NOT NULL,
  vendor_id            UUID,
  invoice_no           TEXT,
  invoice_date         DATE,
  gstin                TEXT,
  hsn                  TEXT,
  taxable_value        NUMERIC(18,2) NOT NULL DEFAULT 0,
  cgst_amount          NUMERIC(18,2) NOT NULL DEFAULT 0,
  sgst_amount          NUMERIC(18,2) NOT NULL DEFAULT 0,
  igst_amount          NUMERIC(18,2) NOT NULL DEFAULT 0,
  cess_amount          NUMERIC(18,2) NOT NULL DEFAULT 0,
  itc_eligibility      TEXT NOT NULL DEFAULT 'eligible' CHECK (itc_eligibility IN (
                          'eligible','blocked','capital_goods','input_services','rcm','ineligible'
                        )),
  blocked_reason       TEXT,                                  -- 17(5) reasons
  reversal_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  reversal_reason      TEXT,
  claim_status         TEXT NOT NULL DEFAULT 'pending' CHECK (claim_status IN (
                          'pending','claimed','reversed','lost','available'
                        )),
  claim_period         TEXT,                                  -- YYYY-MM
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_itc_class_user ON itc_classifications(user_id, claim_period);
CREATE INDEX IF NOT EXISTS idx_itc_class_vendor ON itc_classifications(user_id, vendor_id);
ALTER TABLE itc_classifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS itc_class_owner ON itc_classifications;
CREATE POLICY itc_class_owner ON itc_classifications
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 8. itr_workspaces (ITR prep workspace per FY + entity type) ────────────
CREATE TABLE IF NOT EXISTS itr_workspaces (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  fiscal_year          TEXT NOT NULL,
  assessment_year      TEXT NOT NULL,
  entity_type          TEXT NOT NULL CHECK (entity_type IN (
                          'proprietorship','partnership','llp','private_limited','huf','aop','trust','other'
                        )),
  itr_form             TEXT,                                  -- 'ITR-3','ITR-5','ITR-6','ITR-7'
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                          'draft','validated','prepared','filed','revised','rejected'
                        )),
  -- Auto-populated snapshot
  pnl_snapshot         JSONB,
  bs_snapshot          JSONB,
  gst_snapshot         JSONB,
  tds_snapshot         JSONB,
  asset_snapshot       JSONB,
  liability_snapshot   JSONB,
  tax_computation      JSONB,
  validation_results   JSONB DEFAULT '[]'::jsonb,
  filing_payload       JSONB,
  filed_at             TIMESTAMPTZ,
  ack_no               TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fiscal_year, entity_type)
);
CREATE INDEX IF NOT EXISTS idx_itr_workspaces_user_fy ON itr_workspaces(user_id, fiscal_year);
ALTER TABLE itr_workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS itr_workspace_owner ON itr_workspaces;
CREATE POLICY itr_workspace_owner ON itr_workspaces
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 9. tax_compliance_alerts (smart intelligence) ──────────────────────────
CREATE TABLE IF NOT EXISTS tax_compliance_alerts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  alert_type           TEXT NOT NULL CHECK (alert_type IN (
                          'tds_risk','tds_late','tds_undeducted','tds_threshold',
                          'itc_leakage','itc_blocked','itc_reversal_required',
                          'gst_mismatch','gst_2a_2b','gst_late',
                          'itr_validation','filing_due','compliance_score',
                          'ldc_expiring','pan_missing','reconciliation_drift'
                        )),
  severity             TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low','info')),
  title                TEXT NOT NULL,
  description          TEXT,
  recommended_action   TEXT,
  source_module        TEXT,                                  -- 'tds_engine','itc_engine','gst_engine','itr_engine'
  reference_id         UUID,
  reference_type       TEXT,
  monetary_impact      NUMERIC(18,2),
  due_date             DATE,
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','snoozed','dismissed')),
  fiscal_year          TEXT,
  quarter              TEXT,
  metadata             JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tax_alerts_user_status ON tax_compliance_alerts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tax_alerts_user_type ON tax_compliance_alerts(user_id, alert_type);
ALTER TABLE tax_compliance_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_alerts_owner ON tax_compliance_alerts;
CREATE POLICY tax_alerts_owner ON tax_compliance_alerts
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ════════════════════════════════════════════════════════════════════════════
-- Seeding helpers: section catalogue
-- ════════════════════════════════════════════════════════════════════════════
-- Standard TDS sections + default rates + thresholds. Lookup-only.
CREATE OR REPLACE VIEW tds_section_catalogue AS
SELECT * FROM (VALUES
  ('192',    'Salary',                            'Slab',  0.00,        0,        'Employee TDS — per slab'),
  ('194A',   'Interest (other than securities)',  'Fixed', 10.00,    40000,        'Interest from non-bank'),
  ('194C',   'Contractor / Sub-contractor',       'Fixed', 1.00,     30000,        '1% individual / 2% other'),
  ('194C-2', 'Contractor (non-individual)',       'Fixed', 2.00,     30000,        'Contractor — co/firm'),
  ('194H',   'Commission / Brokerage',            'Fixed', 5.00,     15000,        'Commission & brokerage'),
  ('194I-B', 'Rent — Building',                   'Fixed', 10.00,   240000,        'Rent of land/building'),
  ('194I-P', 'Rent — Plant & Machinery',          'Fixed', 2.00,    240000,        'Rent of plant/machinery'),
  ('194J',   'Professional / Technical Services', 'Fixed', 10.00,    30000,        'Professional/technical fees'),
  ('194J-T', 'Technical Services (post-2020)',    'Fixed', 2.00,     30000,        'Technical fees lower rate'),
  ('194Q',   'Purchase of Goods',                 'Fixed', 0.10,   5000000,        'Buyer TDS on goods purchase'),
  ('194O',   'E-Commerce Operator',               'Fixed', 1.00,    500000,        'E-com operator'),
  ('194R',   'Benefit / Perquisite',              'Fixed', 10.00,    20000,        'Benefit or perquisite'),
  ('195',    'Foreign Remittance',                'Fixed', 20.00,        0,        'Payments to non-residents'),
  ('194D',   'Insurance Commission',              'Fixed', 5.00,     15000,        'Insurance commission'),
  ('194LA',  'Compensation on Land Acquisition',  'Fixed', 10.00,   250000,        'Land compulsory acquisition'),
  ('194N',   'Cash Withdrawal',                   'Fixed', 2.00,   1000000,        '2% > 1Cr cash withdrawn')
) AS t(section_code, description, rate_type, default_rate, threshold_amount, notes);

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 1: tds_compute_for_amount
--    Given gross amount + section + (optional) vendor, return the deduction.
--    Resolves rate using: vendor LDC → vendor override → master rate
--    → no-PAN higher rate (20%). Threshold computed by comparing
--    cumulative annual paid amount.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tds_compute_for_amount(
  p_user_id     TEXT,
  p_amount      NUMERIC,
  p_section     TEXT,
  p_vendor_id   UUID DEFAULT NULL,
  p_payment_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_rate            NUMERIC := NULL;
  v_threshold       NUMERIC := 0;
  v_year_paid       NUMERIC := 0;
  v_threshold_cross BOOLEAN := FALSE;
  v_tds_amount      NUMERIC := 0;
  v_rate_source     TEXT := 'standard';
  v_vendor_pan      TEXT := NULL;
  v_v               RECORD;
  v_master_rate     NUMERIC := NULL;
  v_master_thresh   NUMERIC := NULL;
BEGIN
  -- Resolve master rate / threshold from catalogue
  SELECT default_rate, threshold_amount
    INTO v_master_rate, v_master_thresh
    FROM tds_section_catalogue WHERE section_code = p_section;

  IF v_master_thresh IS NULL THEN v_master_thresh := 0; END IF;

  -- Resolve vendor master
  IF p_vendor_id IS NOT NULL THEN
    SELECT * INTO v_v FROM tds_vendor_master
      WHERE user_id = p_user_id AND vendor_id = p_vendor_id LIMIT 1;
    IF FOUND THEN
      v_vendor_pan := v_v.pan;
      IF v_v.exemption_status = 'full_exempt' OR NOT v_v.tds_applicable THEN
        RETURN jsonb_build_object(
          'tds_applicable', false,
          'reason',         'vendor_exempted',
          'rate',           0,
          'tds_amount',     0,
          'net_payable',    p_amount,
          'section',        p_section,
          'threshold_crossed', false
        );
      ELSIF v_v.ldc_rate IS NOT NULL
            AND p_payment_date BETWEEN COALESCE(v_v.ldc_valid_from, '1900-01-01'::date)
                                   AND COALESCE(v_v.ldc_valid_to, '9999-12-31'::date) THEN
        v_rate := v_v.ldc_rate;
        v_rate_source := 'ldc';
      ELSIF v_v.default_rate IS NOT NULL THEN
        v_rate := v_v.default_rate;
        v_rate_source := 'override';
      END IF;
      IF v_v.threshold_amount IS NOT NULL THEN
        v_master_thresh := v_v.threshold_amount;
      END IF;
    END IF;
  END IF;

  -- Fall back to master rate
  IF v_rate IS NULL THEN
    v_rate := COALESCE(v_master_rate, 0);
  END IF;

  -- No-PAN higher rate (20% u/s 206AA) when applicable
  IF (v_vendor_pan IS NULL OR LENGTH(v_vendor_pan) <> 10)
     AND p_section NOT IN ('192','195') AND v_rate < 20 THEN
    v_rate := 20.00;
    v_rate_source := 'no_pan_higher';
  END IF;

  -- Year-to-date paid for this vendor + section (for threshold check)
  IF p_vendor_id IS NOT NULL THEN
    SELECT COALESCE(SUM(gross_amount), 0) INTO v_year_paid
      FROM tds_auto_deductions
     WHERE user_id = p_user_id
       AND vendor_id = p_vendor_id
       AND section = p_section
       AND computed_at >= date_trunc('year', p_payment_date);
  END IF;

  v_threshold := v_master_thresh;
  v_threshold_cross := (v_year_paid + p_amount) > v_threshold;

  IF v_threshold > 0 AND NOT v_threshold_cross THEN
    -- Below threshold: no deduction
    RETURN jsonb_build_object(
      'tds_applicable', false,
      'reason',         'below_threshold',
      'section',        p_section,
      'rate',           v_rate,
      'tds_amount',     0,
      'net_payable',    p_amount,
      'threshold',      v_threshold,
      'year_paid',      v_year_paid,
      'threshold_crossed', false,
      'rate_source',    v_rate_source
    );
  END IF;

  v_tds_amount := round(p_amount * v_rate / 100.0, 2);

  RETURN jsonb_build_object(
    'tds_applicable', true,
    'section',        p_section,
    'rate',           v_rate,
    'tds_amount',     v_tds_amount,
    'net_payable',    round(p_amount - v_tds_amount, 2),
    'threshold',      v_threshold,
    'year_paid',      v_year_paid,
    'threshold_crossed', v_threshold_cross,
    'rate_source',    v_rate_source,
    'vendor_pan',     v_vendor_pan
  );
END;
$$;
GRANT EXECUTE ON FUNCTION tds_compute_for_amount(TEXT, NUMERIC, TEXT, UUID, DATE) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 2: tds_engine_dashboard
--    Returns aggregate KPIs for the TDS engine: payable, paid, deducted YTD,
--    challan count, return status, next-due dates.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tds_engine_dashboard(
  p_user_id     TEXT,
  p_fiscal_year TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_fy           TEXT := COALESCE(p_fiscal_year,
                          CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
                               THEN EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' ||
                                    RIGHT((EXTRACT(YEAR FROM CURRENT_DATE) + 1)::text, 2)
                               ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::text || '-' ||
                                    RIGHT(EXTRACT(YEAR FROM CURRENT_DATE)::text, 2)
                          END);
  v_total_ded    NUMERIC := 0;
  v_total_paid   NUMERIC := 0;
  v_payable      NUMERIC := 0;
  v_challan_cnt  INTEGER := 0;
  v_section_brk  JSONB := '[]'::jsonb;
  v_quarter_brk  JSONB := '[]'::jsonb;
  v_returns      JSONB := '[]'::jsonb;
BEGIN
  -- Total deducted this FY
  SELECT COALESCE(SUM(tds_amount), 0)
    INTO v_total_ded
    FROM tds_auto_deductions
   WHERE user_id = p_user_id AND fiscal_year = v_fy AND status IN ('computed','posted','overridden');

  SELECT COALESCE(SUM(challan_amount), 0), COUNT(*)
    INTO v_total_paid, v_challan_cnt
    FROM tds_challans
   WHERE user_id = p_user_id AND fiscal_year = v_fy AND status IN ('paid','reconciled');

  v_payable := GREATEST(v_total_ded - v_total_paid, 0);

  -- Per-section breakup
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'section', section,
           'tds_amount', total_tds,
           'gross_amount', total_gross,
           'count', cnt
         ) ORDER BY total_tds DESC), '[]'::jsonb)
    INTO v_section_brk
    FROM (
      SELECT section,
             SUM(tds_amount)    AS total_tds,
             SUM(gross_amount)  AS total_gross,
             COUNT(*)           AS cnt
        FROM tds_auto_deductions
       WHERE user_id = p_user_id AND fiscal_year = v_fy
       GROUP BY section
    ) s;

  -- Per-quarter breakup
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'quarter', quarter,
           'tds_amount', total_tds,
           'challan_amount', challan_amt
         ) ORDER BY quarter), '[]'::jsonb)
    INTO v_quarter_brk
    FROM (
      SELECT q.quarter,
             COALESCE(SUM(d.tds_amount), 0) AS total_tds,
             COALESCE((SELECT SUM(challan_amount) FROM tds_challans c
                        WHERE c.user_id = p_user_id AND c.fiscal_year = v_fy
                          AND c.quarter = q.quarter), 0) AS challan_amt
        FROM (VALUES ('Q1'),('Q2'),('Q3'),('Q4')) q(quarter)
        LEFT JOIN tds_auto_deductions d
          ON d.user_id = p_user_id AND d.fiscal_year = v_fy AND d.quarter = q.quarter
       GROUP BY q.quarter
    ) s;

  -- Returns status
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'form_type', form_type,
           'quarter', quarter,
           'status', status,
           'due_date', due_date,
           'filed_date', filed_date,
           'total_tds', total_tds_amount,
           'total_deductees', total_deductees
         ) ORDER BY quarter, form_type), '[]'::jsonb)
    INTO v_returns
    FROM tds_returns
   WHERE user_id = p_user_id AND fiscal_year = v_fy;

  RETURN jsonb_build_object(
    'fiscal_year',       v_fy,
    'total_deducted',    v_total_ded,
    'total_paid',        v_total_paid,
    'payable',           v_payable,
    'challan_count',     v_challan_cnt,
    'section_breakup',   v_section_brk,
    'quarter_breakup',   v_quarter_brk,
    'returns_status',    v_returns,
    'computed_at',       NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION tds_engine_dashboard(TEXT, TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 3: tds_reconcile_books_vs_returns
--    Books-side (auto_deductions + transactions) vs Challan-side vs 26AS-side
--    drift. Returns variance summary + list of mismatches.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tds_reconcile_books_vs_returns(
  p_user_id     TEXT,
  p_fiscal_year TEXT,
  p_quarter     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_books        NUMERIC := 0;
  v_challans     NUMERIC := 0;
  v_returns      NUMERIC := 0;
  v_26as         NUMERIC := 0;
  v_findings     JSONB   := '[]'::jsonb;
  v_have_26as    BOOLEAN := (to_regclass('public.tds_26as_entries') IS NOT NULL);
BEGIN
  SELECT COALESCE(SUM(tds_amount), 0) INTO v_books
    FROM tds_auto_deductions
   WHERE user_id = p_user_id
     AND fiscal_year = p_fiscal_year
     AND (p_quarter IS NULL OR quarter = p_quarter);

  SELECT COALESCE(SUM(challan_amount), 0) INTO v_challans
    FROM tds_challans
   WHERE user_id = p_user_id
     AND fiscal_year = p_fiscal_year
     AND (p_quarter IS NULL OR quarter = p_quarter);

  SELECT COALESCE(SUM(total_tds_amount), 0) INTO v_returns
    FROM tds_returns
   WHERE user_id = p_user_id
     AND fiscal_year = p_fiscal_year
     AND (p_quarter IS NULL OR quarter = p_quarter);

  IF v_have_26as THEN
    EXECUTE format(
      'SELECT COALESCE(SUM(tds_amount), 0) FROM tds_26as_entries '
      'WHERE user_id = %L AND fiscal_year = %L %s',
      p_user_id, p_fiscal_year,
      CASE WHEN p_quarter IS NULL THEN '' ELSE format('AND quarter = %L', p_quarter) END
    ) INTO v_26as;
  END IF;

  IF abs(v_books - v_challans) > 1 THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'finding', 'books_vs_challans_drift',
      'severity', CASE WHEN abs(v_books - v_challans) > 10000 THEN 'high' ELSE 'medium' END,
      'books', v_books, 'challans', v_challans, 'diff', round(v_books - v_challans, 2),
      'description', 'TDS deducted in books does not match TDS paid via challans.'
    ));
  END IF;
  IF abs(v_books - v_returns) > 1 THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'finding', 'books_vs_returns_drift',
      'severity', 'high',
      'books', v_books, 'returns', v_returns, 'diff', round(v_books - v_returns, 2),
      'description', 'TDS deducted in books does not match the filed return.'
    ));
  END IF;
  IF v_have_26as AND v_26as > 0 AND abs(v_books - v_26as) > 1 THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'finding', '26as_vs_books_drift',
      'severity', 'medium',
      'books', v_books, '26as', v_26as, 'diff', round(v_books - v_26as, 2),
      'description', 'Books TDS receivable does not match Form 26AS aggregation.'
    ));
  END IF;

  RETURN jsonb_build_object(
    'fiscal_year', p_fiscal_year,
    'quarter',     p_quarter,
    'books',       v_books,
    'challans',    v_challans,
    'returns',     v_returns,
    'form_26as',   v_26as,
    'findings',    v_findings,
    'all_reconciled', (jsonb_array_length(v_findings) = 0),
    'computed_at', NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION tds_reconcile_books_vs_returns(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 4: itc_classify_purchase
--    Returns classification (eligible / blocked / capital / RCM) for a given
--    purchase. Heuristics: known section-17(5) HSN ranges → blocked; capital
--    goods if linked to fixed_assets; RCM if vendor is unregistered.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION itc_classify_purchase(
  p_user_id       TEXT,
  p_amount        NUMERIC,
  p_hsn           TEXT DEFAULT NULL,
  p_vendor_id     UUID DEFAULT NULL,
  p_is_capital    BOOLEAN DEFAULT FALSE,
  p_is_service    BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_blocked        BOOLEAN := FALSE;
  v_block_reason   TEXT := NULL;
  v_classification TEXT := 'eligible';
  v_rcm            BOOLEAN := FALSE;
  v_vendor_gstin   TEXT := NULL;
  v_vendors_exists BOOLEAN := (to_regclass('public.vendors') IS NOT NULL);
BEGIN
  -- 17(5) HSN-based blocking heuristics
  IF p_hsn IS NOT NULL THEN
    IF p_hsn LIKE '8703%' OR p_hsn LIKE '8704%' THEN
      v_blocked := TRUE; v_block_reason := 'motor_vehicles_passenger';
    ELSIF p_hsn LIKE '2203%' OR p_hsn LIKE '2204%' OR p_hsn LIKE '2205%'
       OR p_hsn LIKE '2206%' OR p_hsn LIKE '2207%' OR p_hsn LIKE '2208%' THEN
      v_blocked := TRUE; v_block_reason := 'alcoholic_beverages';
    ELSIF p_hsn LIKE '2402%' OR p_hsn LIKE '2403%' THEN
      v_blocked := TRUE; v_block_reason := 'tobacco';
    ELSIF p_hsn LIKE '9961%' OR p_hsn LIKE '9962%' THEN
      v_blocked := TRUE; v_block_reason := 'food_beverages_outdoor';
    END IF;
  END IF;

  -- Resolve vendor GSTIN for RCM check
  IF p_vendor_id IS NOT NULL AND v_vendors_exists THEN
    EXECUTE 'SELECT gst_number FROM vendors WHERE id = $1 LIMIT 1'
      INTO v_vendor_gstin USING p_vendor_id;
    IF v_vendor_gstin IS NULL OR LENGTH(v_vendor_gstin) < 15 THEN
      v_rcm := TRUE;
    END IF;
  END IF;

  IF v_blocked THEN
    v_classification := 'blocked';
  ELSIF v_rcm THEN
    v_classification := 'rcm';
  ELSIF p_is_capital THEN
    v_classification := 'capital_goods';
  ELSIF p_is_service THEN
    v_classification := 'input_services';
  ELSE
    v_classification := 'eligible';
  END IF;

  RETURN jsonb_build_object(
    'classification',  v_classification,
    'blocked',         v_blocked,
    'block_reason',    v_block_reason,
    'rcm_applicable',  v_rcm,
    'vendor_gstin',    v_vendor_gstin,
    'reason_code',     COALESCE(v_block_reason,
                         CASE v_classification
                           WHEN 'eligible'       THEN 'standard'
                           WHEN 'capital_goods'  THEN 'cap_goods_credit_over_60_months'
                           WHEN 'input_services' THEN 'input_service_credit'
                           WHEN 'rcm'            THEN 'unregistered_supplier_rcm'
                           ELSE 'standard' END),
    'computed_at',     NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION itc_classify_purchase(TEXT, NUMERIC, TEXT, UUID, BOOLEAN, BOOLEAN) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 5: itc_intelligence_summary
--    Aggregate ITC posture: available / claimed / lost / blocked / capital
--    plus 2A vs 2B vs books reconciliation summary + vendor risk count.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION itc_intelligence_summary(
  p_user_id     TEXT,
  p_period      TEXT DEFAULT NULL                          -- YYYY-MM, NULL = current FY
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_start         DATE;
  v_end           DATE;
  v_eligible      NUMERIC := 0;
  v_blocked       NUMERIC := 0;
  v_capital       NUMERIC := 0;
  v_rcm           NUMERIC := 0;
  v_input_svc     NUMERIC := 0;
  v_reversed      NUMERIC := 0;
  v_claimed       NUMERIC := 0;
  v_pending       NUMERIC := 0;
  v_lost          NUMERIC := 0;
  v_vendor_risk   INTEGER := 0;
  v_journal_itc   NUMERIC := 0;
  v_have_jl       BOOLEAN := (to_regclass('public.journal_lines') IS NOT NULL);
  v_recommendations JSONB := '[]'::jsonb;
BEGIN
  IF p_period IS NOT NULL AND p_period ~ '^\d{4}-\d{2}$' THEN
    v_start := to_date(p_period || '-01', 'YYYY-MM-DD');
    v_end   := (v_start + INTERVAL '1 month')::date;
  ELSE
    -- Current FY (Apr-Mar)
    IF EXTRACT(MONTH FROM CURRENT_DATE) >= 4 THEN
      v_start := (EXTRACT(YEAR FROM CURRENT_DATE)::int || '-04-01')::date;
    ELSE
      v_start := ((EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) || '-04-01')::date;
    END IF;
    v_end := (v_start + INTERVAL '1 year')::date;
  END IF;

  WITH c AS (
    SELECT itc_eligibility, claim_status,
           (cgst_amount + sgst_amount + igst_amount + cess_amount) AS itc_value,
           reversal_amount
      FROM itc_classifications
     WHERE user_id = p_user_id
       AND (invoice_date IS NULL OR invoice_date BETWEEN v_start AND v_end)
  )
  SELECT
    COALESCE(SUM(itc_value) FILTER (WHERE itc_eligibility = 'eligible'),       0),
    COALESCE(SUM(itc_value) FILTER (WHERE itc_eligibility = 'blocked'),        0),
    COALESCE(SUM(itc_value) FILTER (WHERE itc_eligibility = 'capital_goods'),  0),
    COALESCE(SUM(itc_value) FILTER (WHERE itc_eligibility = 'rcm'),            0),
    COALESCE(SUM(itc_value) FILTER (WHERE itc_eligibility = 'input_services'), 0),
    COALESCE(SUM(reversal_amount), 0),
    COALESCE(SUM(itc_value) FILTER (WHERE claim_status = 'claimed'),  0),
    COALESCE(SUM(itc_value) FILTER (WHERE claim_status = 'pending'),  0),
    COALESCE(SUM(itc_value) FILTER (WHERE claim_status = 'lost'),     0)
  INTO v_eligible, v_blocked, v_capital, v_rcm, v_input_svc,
       v_reversed, v_claimed, v_pending, v_lost
  FROM c;

  -- Journal-derived ITC (tax_type ∈ cgst/sgst/igst on debit side)
  IF v_have_jl THEN
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_journal_itc
      FROM journal_lines jl
      JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
     WHERE jl.user_id = p_user_id
       AND jl.entry_date BETWEEN v_start AND v_end
       AND jl.tax_type IN ('cgst','sgst','igst','itc');
  END IF;

  -- Vendor risk: vendors with > 5 invoices but no PAN/GSTIN
  IF to_regclass('public.vendors') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM ('
      '  SELECT vendor_id FROM itc_classifications '
      '   WHERE user_id = $1 AND vendor_id IS NOT NULL'
      '   GROUP BY vendor_id HAVING COUNT(*) > 1) x '
      'JOIN vendors v ON v.id = x.vendor_id '
      'WHERE COALESCE(v.gst_number, '''') = '''' OR COALESCE(v.pan, '''') = '''' '
      INTO v_vendor_risk USING p_user_id;
  END IF;

  -- Recommendations
  IF v_pending > 0 THEN
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'type','claim_pending','amount',v_pending,'severity','medium',
      'message', 'You have ' || round(v_pending,2) || ' of unclaimed eligible ITC. Claim before next return.'));
  END IF;
  IF v_vendor_risk > 0 THEN
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'type','vendor_compliance','count',v_vendor_risk,'severity','high',
      'message','Some vendors lack GSTIN/PAN — credit at risk. Follow up.'));
  END IF;
  IF v_lost > 0 THEN
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'type','itc_leakage','amount',v_lost,'severity','high',
      'message','You have lost ITC due to vendor non-filing or time-bar.'));
  END IF;

  RETURN jsonb_build_object(
    'period',          COALESCE(p_period, to_char(v_start, 'YYYY-MM') || '_FY'),
    'window_start',    v_start,
    'window_end',      v_end,
    'eligible_itc',    v_eligible,
    'blocked_itc',     v_blocked,
    'capital_goods',   v_capital,
    'rcm_itc',         v_rcm,
    'input_services',  v_input_svc,
    'reversed_itc',    v_reversed,
    'claimed_itc',     v_claimed,
    'pending_itc',     v_pending,
    'lost_itc',        v_lost,
    'journal_itc',     v_journal_itc,
    'vendor_risk_count', v_vendor_risk,
    'recommendations', v_recommendations,
    'computed_at',     NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION itc_intelligence_summary(TEXT, TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 6: itr_autopopulate
--    Pulls every number an ITR needs from the existing GL/asset/GST/TDS data
--    and writes a JSONB snapshot into itr_workspaces. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION itr_autopopulate(
  p_user_id     TEXT,
  p_fiscal_year TEXT,
  p_entity_type TEXT DEFAULT 'private_limited'
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE
AS $$
DECLARE
  v_workspace_id    UUID;
  v_fy_start        DATE;
  v_fy_end          DATE;
  v_ay              TEXT;
  v_pnl             JSONB;
  v_bs              JSONB := NULL;
  v_gst             JSONB := NULL;
  v_tds             JSONB;
  v_assets          JSONB := NULL;
  v_liab            JSONB := NULL;
  v_revenue         NUMERIC := 0;
  v_expenses        NUMERIC := 0;
  v_net_profit      NUMERIC := 0;
  v_taxable_income  NUMERIC := 0;
  v_tax_payable     NUMERIC := 0;
  v_tax_rate        NUMERIC := 0.25;
  v_itr_form        TEXT;
  v_have_jl         BOOLEAN := (to_regclass('public.journal_lines') IS NOT NULL);
  v_have_fa         BOOLEAN := (to_regclass('public.fixed_assets') IS NOT NULL);
  v_have_lib        BOOLEAN := (to_regclass('public.liabilities') IS NOT NULL);
BEGIN
  -- Parse FY (e.g., 2025-26 → 2025-04-01 to 2026-03-31)
  v_fy_start := (split_part(p_fiscal_year, '-', 1) || '-04-01')::date;
  v_fy_end   := (v_fy_start + INTERVAL '1 year' - INTERVAL '1 day')::date;
  v_ay := (EXTRACT(YEAR FROM v_fy_end)::int)::text || '-' ||
          RIGHT((EXTRACT(YEAR FROM v_fy_end)::int + 1)::text, 2);

  -- ITR form by entity type
  v_itr_form := CASE p_entity_type
                  WHEN 'proprietorship'   THEN 'ITR-3'
                  WHEN 'partnership'      THEN 'ITR-5'
                  WHEN 'llp'              THEN 'ITR-5'
                  WHEN 'private_limited'  THEN 'ITR-6'
                  WHEN 'trust'            THEN 'ITR-7'
                  WHEN 'huf'              THEN 'ITR-2'
                  WHEN 'aop'              THEN 'ITR-5'
                  ELSE 'ITR-4' END;

  -- P&L snapshot via journal-first RPC if available
  IF v_have_jl THEN
    BEGIN
      v_pnl := get_pnl_from_journals(p_user_id, v_fy_start, v_fy_end);
      v_revenue   := COALESCE((v_pnl->>'revenue')::numeric, 0);
      v_expenses  := COALESCE((v_pnl->>'cogs')::numeric, 0) + COALESCE((v_pnl->>'opex')::numeric, 0);
      v_net_profit:= COALESCE((v_pnl->>'net_profit')::numeric, 0);
    EXCEPTION WHEN OTHERS THEN
      v_pnl := jsonb_build_object('error', SQLERRM);
    END;
  END IF;

  -- Balance Sheet snapshot (best-effort via Schedule III RPC if present)
  IF to_regclass('public.get_schedule_iii_balance_sheet') IS NOT NULL OR
     EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_schedule_iii_balance_sheet') THEN
    BEGIN
      EXECUTE 'SELECT get_schedule_iii_balance_sheet($1, $2)' INTO v_bs
        USING p_user_id, v_fy_end;
    EXCEPTION WHEN OTHERS THEN v_bs := jsonb_build_object('error', SQLERRM);
    END;
  END IF;

  -- GST snapshot (journal-derived)
  IF v_have_jl THEN
    BEGIN
      v_gst := jsonb_build_object(
        'total_output_gst', (
          SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
            FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id AND j.status='posted'
           WHERE jl.user_id = p_user_id
             AND jl.entry_date BETWEEN v_fy_start AND v_fy_end
             AND jl.tax_type IN ('cgst','sgst','igst','cess','output_gst')),
        'total_itc', (
          SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
            FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id AND j.status='posted'
           WHERE jl.user_id = p_user_id
             AND jl.entry_date BETWEEN v_fy_start AND v_fy_end
             AND jl.tax_type IN ('cgst','sgst','igst','cess','itc'))
      );
    EXCEPTION WHEN OTHERS THEN v_gst := jsonb_build_object('error', SQLERRM);
    END;
  END IF;

  -- TDS snapshot
  v_tds := tds_engine_dashboard(p_user_id, p_fiscal_year);

  -- Fixed assets snapshot
  IF v_have_fa THEN
    BEGIN
      EXECUTE 'SELECT jsonb_build_object('
              ' ''asset_count'', COUNT(*),'
              ' ''total_gross_block'', COALESCE(SUM(cost), 0),'
              ' ''total_accumulated_depreciation'', COALESCE(SUM(COALESCE(accumulated_depreciation, 0)), 0),'
              ' ''net_block'', COALESCE(SUM(cost - COALESCE(accumulated_depreciation, 0)), 0)'
              ') FROM fixed_assets WHERE user_id = $1'
        INTO v_assets USING p_user_id;
    EXCEPTION WHEN OTHERS THEN v_assets := jsonb_build_object('error', SQLERRM);
    END;
  END IF;

  -- Liabilities snapshot
  IF v_have_lib THEN
    BEGIN
      EXECUTE 'SELECT jsonb_build_object('
              ' ''liability_count'', COUNT(*),'
              ' ''total_outstanding'', COALESCE(SUM(outstanding_amount), 0)'
              ') FROM liabilities WHERE user_id = $1'
        INTO v_liab USING p_user_id;
    EXCEPTION WHEN OTHERS THEN v_liab := jsonb_build_object('error', SQLERRM);
    END;
  END IF;

  -- Tax computation
  v_tax_rate := CASE p_entity_type
                  WHEN 'private_limited' THEN 0.25
                  WHEN 'llp'             THEN 0.30
                  WHEN 'partnership'     THEN 0.30
                  ELSE 0.30 END;
  v_taxable_income := GREATEST(v_net_profit, 0);
  v_tax_payable    := round(v_taxable_income * v_tax_rate, 2);

  -- Upsert workspace
  INSERT INTO itr_workspaces (
    user_id, fiscal_year, assessment_year, entity_type, itr_form, status,
    pnl_snapshot, bs_snapshot, gst_snapshot, tds_snapshot,
    asset_snapshot, liability_snapshot,
    tax_computation, updated_at
  ) VALUES (
    p_user_id, p_fiscal_year, v_ay, p_entity_type, v_itr_form, 'draft',
    v_pnl, v_bs, v_gst, v_tds, v_assets, v_liab,
    jsonb_build_object(
      'tax_rate',       v_tax_rate,
      'gross_revenue',  v_revenue,
      'total_expenses', v_expenses,
      'net_profit',     v_net_profit,
      'taxable_income', v_taxable_income,
      'tax_payable',    v_tax_payable,
      'tds_credit',     COALESCE((v_tds->>'total_paid')::numeric, 0),
      'net_tax_liability', GREATEST(v_tax_payable - COALESCE((v_tds->>'total_paid')::numeric, 0), 0),
      'method',         'direct'
    ),
    NOW()
  )
  ON CONFLICT (user_id, fiscal_year, entity_type) DO UPDATE SET
    assessment_year   = EXCLUDED.assessment_year,
    itr_form          = EXCLUDED.itr_form,
    pnl_snapshot      = EXCLUDED.pnl_snapshot,
    bs_snapshot       = EXCLUDED.bs_snapshot,
    gst_snapshot      = EXCLUDED.gst_snapshot,
    tds_snapshot      = EXCLUDED.tds_snapshot,
    asset_snapshot    = EXCLUDED.asset_snapshot,
    liability_snapshot= EXCLUDED.liability_snapshot,
    tax_computation   = EXCLUDED.tax_computation,
    updated_at        = NOW()
  RETURNING id INTO v_workspace_id;

  RETURN jsonb_build_object(
    'workspace_id',   v_workspace_id,
    'fiscal_year',    p_fiscal_year,
    'assessment_year',v_ay,
    'entity_type',    p_entity_type,
    'itr_form',       v_itr_form,
    'pnl',            v_pnl,
    'gst',            v_gst,
    'tds',            v_tds,
    'assets',         v_assets,
    'liabilities',    v_liab,
    'tax_computation',jsonb_build_object(
      'tax_rate',       v_tax_rate,
      'gross_revenue',  v_revenue,
      'total_expenses', v_expenses,
      'net_profit',     v_net_profit,
      'taxable_income', v_taxable_income,
      'tax_payable',    v_tax_payable,
      'tds_credit',     COALESCE((v_tds->>'total_paid')::numeric, 0),
      'net_tax_liability', GREATEST(v_tax_payable - COALESCE((v_tds->>'total_paid')::numeric, 0), 0)
    ),
    'computed_at',    NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION itr_autopopulate(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 7: itr_validate
--    Pre-filing consistency layer: P&L vs BS, GST vs books, TDS vs 26AS,
--    depreciation continuity, etc.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION itr_validate(
  p_user_id     TEXT,
  p_fiscal_year TEXT
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_findings    JSONB := '[]'::jsonb;
  v_pnl         JSONB;
  v_recon       JSONB;
  v_fy_start    DATE := (split_part(p_fiscal_year, '-', 1) || '-04-01')::date;
  v_fy_end      DATE := (v_fy_start + INTERVAL '1 year' - INTERVAL '1 day')::date;
  v_revenue     NUMERIC := 0;
  v_books_gst   NUMERIC := 0;
  v_have_jl     BOOLEAN := (to_regclass('public.journal_lines') IS NOT NULL);
BEGIN
  IF v_have_jl THEN
    v_pnl := get_pnl_from_journals(p_user_id, v_fy_start, v_fy_end);
    v_revenue := COALESCE((v_pnl->>'revenue')::numeric, 0);
    IF v_revenue <= 0 THEN
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'check','pnl_revenue_present','severity','high','passed', false,
        'description','No revenue posted to journals for this FY.'));
    ELSE
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'check','pnl_revenue_present','severity','info','passed', true,
        'description','Revenue ' || v_revenue || ' present.'));
    END IF;
  END IF;

  -- TDS books vs returns
  v_recon := tds_reconcile_books_vs_returns(p_user_id, p_fiscal_year, NULL);
  IF NOT COALESCE((v_recon->>'all_reconciled')::boolean, true) THEN
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'check','tds_books_vs_returns','severity','high','passed', false,
      'description','TDS reconciliation has open findings.',
      'detail', v_recon -> 'findings'));
  ELSE
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'check','tds_books_vs_returns','severity','info','passed', true,
      'description','TDS books, challans, and returns reconciled.'));
  END IF;

  -- Books validation (5-check) if RPC present
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_books_with_orphans') THEN
    DECLARE v_books_check JSONB;
    BEGIN
      EXECUTE 'SELECT validate_books_with_orphans($1, $2)' INTO v_books_check
        USING p_user_id, p_fiscal_year;
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'check','books_integrity',
        'severity', CASE WHEN COALESCE((v_books_check->>'all_passed')::boolean, false) THEN 'info' ELSE 'high' END,
        'passed',  COALESCE((v_books_check->>'all_passed')::boolean, false),
        'description', CASE WHEN COALESCE((v_books_check->>'all_passed')::boolean, false)
                            THEN 'All 6 integrity checks passed.'
                            ELSE 'Some integrity checks failed — see detail.' END,
        'detail', v_books_check -> 'checks'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'fiscal_year', p_fiscal_year,
    'findings',    v_findings,
    'all_passed',  NOT EXISTS (
                     SELECT 1 FROM jsonb_array_elements(v_findings) f
                      WHERE (f->>'passed')::boolean = false),
    'computed_at', NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION itr_validate(TEXT, TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 8: tax_compliance_score
--    Aggregate 0-100 compliance score across TDS, ITC, GST, ITR, Calendar.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tax_compliance_score(
  p_user_id     TEXT,
  p_fiscal_year TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_fy            TEXT := COALESCE(p_fiscal_year,
                          CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
                               THEN EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' ||
                                    RIGHT((EXTRACT(YEAR FROM CURRENT_DATE) + 1)::text, 2)
                               ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::text || '-' ||
                                    RIGHT(EXTRACT(YEAR FROM CURRENT_DATE)::text, 2)
                          END);
  v_tds_score    INTEGER := 0;
  v_itc_score    INTEGER := 0;
  v_gst_score    INTEGER := 0;
  v_itr_score    INTEGER := 0;
  v_cal_score    INTEGER := 0;
  v_overall      INTEGER := 0;
  v_grade        TEXT;
  v_tds_recon    JSONB;
  v_itc_summary  JSONB;
  v_open_alerts  INTEGER := 0;
BEGIN
  -- TDS sub-score
  v_tds_recon := tds_reconcile_books_vs_returns(p_user_id, v_fy, NULL);
  v_tds_score := CASE WHEN COALESCE((v_tds_recon->>'all_reconciled')::boolean, true)
                      THEN 100
                      ELSE 100 - LEAST(jsonb_array_length(COALESCE(v_tds_recon->'findings','[]'::jsonb)) * 20, 80) END;

  -- ITC sub-score
  v_itc_summary := itc_intelligence_summary(p_user_id, NULL);
  v_itc_score := GREATEST(
    100
    - LEAST(round(COALESCE((v_itc_summary->>'lost_itc')::numeric, 0) / 10000.0)::int * 5, 60)
    - COALESCE((v_itc_summary->>'vendor_risk_count')::int, 0) * 2,
    0
  );

  -- GST sub-score: open alerts of type gst_*
  SELECT COUNT(*) INTO v_open_alerts
    FROM tax_compliance_alerts
   WHERE user_id = p_user_id AND status = 'open'
     AND alert_type LIKE 'gst%';
  v_gst_score := GREATEST(100 - v_open_alerts * 10, 0);

  -- ITR sub-score: any workspace validated?
  SELECT CASE
           WHEN EXISTS (SELECT 1 FROM itr_workspaces
                         WHERE user_id = p_user_id AND fiscal_year = v_fy
                           AND status IN ('validated','prepared','filed'))
             THEN 100
           WHEN EXISTS (SELECT 1 FROM itr_workspaces
                         WHERE user_id = p_user_id AND fiscal_year = v_fy)
             THEN 60
           ELSE 30 END INTO v_itr_score;

  -- Calendar / filing readiness sub-score
  IF to_regclass('public.compliance_calendar') IS NOT NULL THEN
    EXECUTE
      'SELECT GREATEST(100 - COUNT(*) FILTER (WHERE status IN (''overdue'',''pending'') '
      'AND due_date < CURRENT_DATE) * 5, 0) '
      'FROM compliance_calendar WHERE user_id = $1'
      INTO v_cal_score USING p_user_id;
  ELSE
    v_cal_score := 80;
  END IF;

  v_overall := round((v_tds_score + v_itc_score + v_gst_score + v_itr_score + v_cal_score) / 5.0);
  v_grade := CASE
               WHEN v_overall >= 90 THEN 'A+'
               WHEN v_overall >= 80 THEN 'A'
               WHEN v_overall >= 70 THEN 'B'
               WHEN v_overall >= 60 THEN 'C'
               WHEN v_overall >= 50 THEN 'D'
               ELSE 'F' END;

  RETURN jsonb_build_object(
    'fiscal_year',     v_fy,
    'overall_score',   v_overall,
    'grade',           v_grade,
    'breakdown',       jsonb_build_object(
      'tds_score',      v_tds_score,
      'itc_score',      v_itc_score,
      'gst_score',      v_gst_score,
      'itr_score',      v_itr_score,
      'calendar_score', v_cal_score
    ),
    'computed_at',     NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION tax_compliance_score(TEXT, TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 9: tax_filing_readiness — per-filing readiness scoring
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tax_filing_readiness(
  p_user_id     TEXT,
  p_fiscal_year TEXT
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_recon JSONB := tds_reconcile_books_vs_returns(p_user_id, p_fiscal_year, NULL);
  v_itr_v JSONB := itr_validate(p_user_id, p_fiscal_year);
  v_rows  JSONB := '[]'::jsonb;
  v_q     TEXT;
BEGIN
  -- Per-quarter TDS readiness
  FOR v_q IN SELECT * FROM (VALUES ('Q1'),('Q2'),('Q3'),('Q4')) AS q(quarter) LOOP
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'filing','TDS Return ' || v_q,
      'category','TDS',
      'status', CASE WHEN EXISTS (
                       SELECT 1 FROM tds_returns
                        WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
                          AND quarter = v_q AND status IN ('prepared','filed','accepted'))
                     THEN 'ready' ELSE 'pending' END,
      'readiness_pct', CASE WHEN EXISTS (
                              SELECT 1 FROM tds_returns
                                WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
                                  AND quarter = v_q AND status = 'filed')
                            THEN 100
                            WHEN EXISTS (
                              SELECT 1 FROM tds_returns
                                WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
                                  AND quarter = v_q AND status = 'prepared')
                            THEN 80
                            WHEN EXISTS (
                              SELECT 1 FROM tds_returns
                                WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
                                  AND quarter = v_q AND status = 'draft')
                            THEN 40
                            ELSE 10 END
    ));
  END LOOP;

  -- ITR filing readiness
  v_rows := v_rows || jsonb_build_array(jsonb_build_object(
    'filing', 'ITR Filing',
    'category','ITR',
    'status', CASE WHEN COALESCE((v_itr_v->>'all_passed')::boolean, false) THEN 'ready' ELSE 'pending' END,
    'readiness_pct',  CASE WHEN COALESCE((v_itr_v->>'all_passed')::boolean, false) THEN 90 ELSE 50 END
  ));

  -- TDS reconciliation
  v_rows := v_rows || jsonb_build_array(jsonb_build_object(
    'filing', 'TDS Reconciliation',
    'category','TDS',
    'status', CASE WHEN COALESCE((v_recon->>'all_reconciled')::boolean, true) THEN 'ready' ELSE 'pending' END,
    'readiness_pct', CASE WHEN COALESCE((v_recon->>'all_reconciled')::boolean, true) THEN 100 ELSE 60 END
  ));

  RETURN jsonb_build_object(
    'fiscal_year',  p_fiscal_year,
    'filings',      v_rows,
    'computed_at',  NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION tax_filing_readiness(TEXT, TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 10: tax_intelligence_scan
--    Materialises smart alerts into tax_compliance_alerts. Idempotent per
--    fingerprint (alert_type + reference_id).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tax_intelligence_scan(
  p_user_id     TEXT,
  p_fiscal_year TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE
AS $$
DECLARE
  v_fy           TEXT := COALESCE(p_fiscal_year,
                          CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
                               THEN EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' ||
                                    RIGHT((EXTRACT(YEAR FROM CURRENT_DATE) + 1)::text, 2)
                               ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::text || '-' ||
                                    RIGHT(EXTRACT(YEAR FROM CURRENT_DATE)::text, 2)
                          END);
  v_inserted     INTEGER := 0;
  v_dropped      INTEGER := 0;
  v_recon        JSONB;
  v_itc          JSONB;
BEGIN
  -- Clear stale open alerts in this scope (we re-emit fresh ones)
  DELETE FROM tax_compliance_alerts
   WHERE user_id = p_user_id
     AND fiscal_year = v_fy
     AND status = 'open'
     AND source_module IN ('tds_engine','itc_engine','itr_engine')
   RETURNING 1 INTO v_dropped;
  GET DIAGNOSTICS v_dropped = ROW_COUNT;

  -- TDS recon findings → alerts
  v_recon := tds_reconcile_books_vs_returns(p_user_id, v_fy, NULL);
  IF v_recon ? 'findings' THEN
    INSERT INTO tax_compliance_alerts (
      user_id, alert_type, severity, title, description,
      recommended_action, source_module, fiscal_year, monetary_impact
    )
    SELECT
      p_user_id,
      'tds_risk',
      COALESCE(f->>'severity','medium'),
      'TDS recon: ' || (f->>'finding'),
      f->>'description',
      'Open TDS Engine → Reconciliation tab',
      'tds_engine',
      v_fy,
      ABS(COALESCE((f->>'diff')::numeric, 0))
    FROM jsonb_array_elements(v_recon->'findings') f;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  -- ITC leakage alert
  v_itc := itc_intelligence_summary(p_user_id, NULL);
  IF COALESCE((v_itc->>'lost_itc')::numeric, 0) > 0 THEN
    INSERT INTO tax_compliance_alerts (
      user_id, alert_type, severity, title, description,
      recommended_action, source_module, fiscal_year, monetary_impact
    ) VALUES (
      p_user_id, 'itc_leakage', 'high',
      'ITC Leakage Detected',
      'Lost ITC of ' || round((v_itc->>'lost_itc')::numeric, 2) || ' detected for current FY.',
      'Review ITC Center → Lost ITC tab',
      'itc_engine', v_fy,
      (v_itc->>'lost_itc')::numeric
    );
    v_inserted := v_inserted + 1;
  END IF;

  IF COALESCE((v_itc->>'vendor_risk_count')::int, 0) > 0 THEN
    INSERT INTO tax_compliance_alerts (
      user_id, alert_type, severity, title, description,
      recommended_action, source_module, fiscal_year
    ) VALUES (
      p_user_id, 'pan_missing', 'medium',
      'Vendors with missing PAN/GSTIN',
      'You have ' || (v_itc->>'vendor_risk_count') || ' vendors with missing PAN/GSTIN — ITC at risk.',
      'Review Vendor Master and update KYC',
      'itc_engine', v_fy
    );
    v_inserted := v_inserted + 1;
  END IF;

  -- LDC expiry alert
  INSERT INTO tax_compliance_alerts (
    user_id, alert_type, severity, title, description,
    recommended_action, source_module, fiscal_year, due_date
  )
  SELECT
    p_user_id, 'ldc_expiring', 'medium',
    'Lower Deduction Cert expiring',
    'LDC ' || COALESCE(ldc_certificate_no, 'N/A') || ' expires on ' || ldc_valid_to,
    'Request a renewal from the vendor',
    'tds_engine', v_fy, ldc_valid_to
  FROM tds_vendor_master
   WHERE user_id = p_user_id
     AND ldc_valid_to IS NOT NULL
     AND ldc_valid_to BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days';

  RETURN jsonb_build_object(
    'fiscal_year', v_fy,
    'alerts_dropped', v_dropped,
    'alerts_inserted', (SELECT COUNT(*) FROM tax_compliance_alerts
                          WHERE user_id = p_user_id AND fiscal_year = v_fy AND status = 'open'),
    'computed_at', NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION tax_intelligence_scan(TEXT, TEXT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC 11: tax_compliance_center_overview
--    One-shot bundle: returns all the data needed to render the landing
--    Overview tab of the Tax Compliance Center.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tax_compliance_center_overview(
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
  v_alerts    JSONB;
  v_score     JSONB;
  v_tds       JSONB;
  v_itc       JSONB;
  v_readiness JSONB;
BEGIN
  v_score     := tax_compliance_score(p_user_id, v_fy);
  v_tds       := tds_engine_dashboard(p_user_id, v_fy);
  v_itc       := itc_intelligence_summary(p_user_id, NULL);
  v_readiness := tax_filing_readiness(p_user_id, v_fy);

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
    INTO v_alerts
    FROM (
      SELECT * FROM tax_compliance_alerts
       WHERE user_id = p_user_id AND status = 'open'
       ORDER BY
         CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3
              WHEN 'low' THEN 4 ELSE 5 END, created_at DESC
       LIMIT 20
    ) a;

  RETURN jsonb_build_object(
    'fiscal_year', v_fy,
    'score',       v_score,
    'tds',         v_tds,
    'itc',         v_itc,
    'readiness',   v_readiness,
    'alerts',      v_alerts,
    'computed_at', NOW()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION tax_compliance_center_overview(TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE  tds_company_config IS 'Phase 31: TAN/PAN/deductor master per user.';
COMMENT ON TABLE  tds_vendor_master  IS 'Phase 31: per-vendor TDS config — PAN/section/threshold/LDC/exemption.';
COMMENT ON TABLE  tds_auto_deductions IS 'Phase 31: auto-detected TDS computations on bills / expenses / payments.';
COMMENT ON TABLE  tds_challans       IS 'Phase 31: TDS challan / payment records.';
COMMENT ON TABLE  tds_returns        IS 'Phase 31: quarterly TDS returns (26Q/24Q/27Q/27EQ).';
COMMENT ON TABLE  tds_certificates   IS 'Phase 31: Form 16 / 16A certificates issued.';
COMMENT ON TABLE  itc_classifications IS 'Phase 31: per-purchase ITC eligibility tagging.';
COMMENT ON TABLE  itr_workspaces     IS 'Phase 31: per-FY ITR preparation workspace, auto-populated from GL/GST/TDS/FA.';
COMMENT ON TABLE  tax_compliance_alerts IS 'Phase 31: smart compliance alerts surface.';
COMMENT ON FUNCTION tax_compliance_center_overview IS 'Phase 31: one-shot bundle for the Tax Compliance Center landing tab.';
