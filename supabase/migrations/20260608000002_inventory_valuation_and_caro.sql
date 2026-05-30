-- ============================================================================
-- PHASE 15 — INVENTORY VALUATION METHOD + CARO 2020 SCAFFOLDING
-- ----------------------------------------------------------------------------
-- 1. Adds inventory_valuation_method on inventory_items (per item) and a
--    company-wide default in a small `accounting_settings` table.
-- 2. Adds auditor_reports + caro_2020_responses tables for future CARO
--    (Companies Auditor's Report Order, 2020) workflow.
-- ============================================================================

-- ── 1. INVENTORY VALUATION METHOD ───────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_items') THEN
    ALTER TABLE inventory_items
      ADD COLUMN IF NOT EXISTS valuation_method TEXT
        CHECK (valuation_method IS NULL OR valuation_method IN ('FIFO','LIFO','WEIGHTED_AVG','STANDARD_COST','SPECIFIC_ID'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS accounting_settings (
  user_id                   TEXT PRIMARY KEY,
  default_valuation_method  TEXT NOT NULL DEFAULT 'FIFO'
    CHECK (default_valuation_method IN ('FIFO','LIFO','WEIGHTED_AVG','STANDARD_COST','SPECIFIC_ID')),
  reporting_currency        TEXT NOT NULL DEFAULT 'INR',
  rounding_off_method       TEXT NOT NULL DEFAULT 'nearest_rupee'
    CHECK (rounding_off_method IN ('nearest_rupee','thousands','lakhs','crores')),
  msme_classification       TEXT
    CHECK (msme_classification IS NULL OR msme_classification IN ('Micro','Small','Medium','Not Applicable')),
  is_listed                 BOOLEAN NOT NULL DEFAULT FALSE,
  ca_audit_required         BOOLEAN NOT NULL DEFAULT FALSE,
  cin                       TEXT,
  date_of_incorporation     DATE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE accounting_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounting_settings_owner ON accounting_settings;
CREATE POLICY accounting_settings_owner ON accounting_settings
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

CREATE OR REPLACE FUNCTION touch_accounting_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_accounting_settings_updated_at ON accounting_settings;
CREATE TRIGGER trg_accounting_settings_updated_at
  BEFORE UPDATE ON accounting_settings
  FOR EACH ROW EXECUTE FUNCTION touch_accounting_settings_updated_at();

-- ── 2. AUDITOR REPORTS (CARO 2020 scaffolding) ─────────────────────────────
CREATE TABLE IF NOT EXISTS auditor_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  fiscal_year         TEXT NOT NULL,
  auditor_name        TEXT,
  auditor_firm        TEXT,
  auditor_frn         TEXT,                -- Firm Registration Number
  audit_opinion       TEXT CHECK (audit_opinion IS NULL OR audit_opinion IN
                        ('unmodified','qualified','adverse','disclaimer')),
  opinion_text        TEXT,
  emphasis_of_matter  TEXT,
  key_audit_matters   JSONB DEFAULT '[]'::jsonb,
  report_date         DATE,
  signed_at_place     TEXT,
  caro_applicable     BOOLEAN NOT NULL DEFAULT TRUE,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','signed','filed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fiscal_year)
);

ALTER TABLE auditor_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auditor_reports_owner ON auditor_reports;
CREATE POLICY auditor_reports_owner ON auditor_reports
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- CARO 2020 reportable clauses (i to xxi) — auditor records their response.
CREATE TABLE IF NOT EXISTS caro_2020_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  auditor_report_id UUID NOT NULL REFERENCES auditor_reports(id) ON DELETE CASCADE,
  clause_number     TEXT NOT NULL,        -- 'i', 'ii', 'iii', etc.
  clause_title      TEXT NOT NULL,
  sub_clause        TEXT,                 -- 'i(a)', 'i(b)', etc.
  applicability     TEXT NOT NULL DEFAULT 'applicable' CHECK (applicability IN ('applicable','not_applicable','not_reported')),
  observation       TEXT,
  is_qualified      BOOLEAN NOT NULL DEFAULT FALSE,
  display_order     INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_caro_responses_clause
  ON caro_2020_responses (auditor_report_id, clause_number, COALESCE(sub_clause, ''));

CREATE INDEX IF NOT EXISTS idx_caro_responses_report ON caro_2020_responses(auditor_report_id, display_order);

ALTER TABLE caro_2020_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS caro_responses_owner ON caro_2020_responses;
CREATE POLICY caro_responses_owner ON caro_2020_responses
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── Seed the 21 CARO 2020 clauses when an auditor_report is created ────────
CREATE OR REPLACE FUNCTION seed_caro_2020_clauses(p_user_id TEXT, p_report_id UUID)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT := 0;
BEGIN
  INSERT INTO caro_2020_responses (user_id, auditor_report_id, clause_number, clause_title, display_order)
  VALUES
    (p_user_id, p_report_id, 'i',    'Property, Plant & Equipment and Intangible Assets',                1),
    (p_user_id, p_report_id, 'ii',   'Inventory',                                                          2),
    (p_user_id, p_report_id, 'iii',  'Loans / Advances / Guarantees / Securities',                         3),
    (p_user_id, p_report_id, 'iv',   'Compliance with Sections 185 & 186',                                 4),
    (p_user_id, p_report_id, 'v',    'Deposits accepted from the public',                                  5),
    (p_user_id, p_report_id, 'vi',   'Cost records (Section 148)',                                         6),
    (p_user_id, p_report_id, 'vii',  'Statutory dues',                                                     7),
    (p_user_id, p_report_id, 'viii', 'Transactions not recorded in the books, surrendered to tax authority',8),
    (p_user_id, p_report_id, 'ix',   'Repayment of loans / use of borrowed funds',                         9),
    (p_user_id, p_report_id, 'x',    'Moneys raised — IPO / FPO / private placement',                     10),
    (p_user_id, p_report_id, 'xi',   'Fraud reporting',                                                   11),
    (p_user_id, p_report_id, 'xii',  'Nidhi Company compliance',                                          12),
    (p_user_id, p_report_id, 'xiii', 'Related-party transactions (Sec 177 & 188)',                        13),
    (p_user_id, p_report_id, 'xiv',  'Internal audit system (Section 138)',                               14),
    (p_user_id, p_report_id, 'xv',   'Non-cash transactions with directors',                              15),
    (p_user_id, p_report_id, 'xvi',  'Registration under Section 45-IA of RBI Act',                       16),
    (p_user_id, p_report_id, 'xvii', 'Cash losses in the financial year and immediately preceding',       17),
    (p_user_id, p_report_id, 'xviii','Resignation of statutory auditors during the year',                 18),
    (p_user_id, p_report_id, 'xix',  'Material uncertainty on meeting liabilities',                        19),
    (p_user_id, p_report_id, 'xx',   'Transfer of unspent CSR amount',                                    20),
    (p_user_id, p_report_id, 'xxi',  'Consolidated Financial Statements qualifications',                   21)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION create_or_get_auditor_report(
  p_user_id      TEXT,
  p_fiscal_year  TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM auditor_reports
   WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO auditor_reports (user_id, fiscal_year, status, caro_applicable)
  VALUES (p_user_id, p_fiscal_year, 'draft', TRUE)
  RETURNING id INTO v_id;

  PERFORM seed_caro_2020_clauses(p_user_id, v_id);
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_caro_2020_clauses(TEXT, UUID)              TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_or_get_auditor_report(TEXT, TEXT)        TO authenticated, anon;
