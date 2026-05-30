-- ============================================================================
-- PHASE 23 — CORPORATE SOCIAL RESPONSIBILITY (§135 Companies Act 2013)
-- ----------------------------------------------------------------------------
-- Mandatory for companies with any of:
--   • Net Worth ≥ ₹500 crore
--   • Turnover ≥ ₹1000 crore
--   • Net Profit ≥ ₹5 crore
-- Spend obligation: 2% of average net profit of preceding 3 FYs
-- Required disclosure: Annexure to Board's Report + Form CSR-2 (MCA)
-- ============================================================================

-- ── 1. CSR Policy (one row per user) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS csr_policy (
  user_id              TEXT PRIMARY KEY,
  is_applicable        BOOLEAN NOT NULL DEFAULT FALSE,    -- auto-set when thresholds met
  applicability_reason TEXT,
  -- CSR Committee (Composition required if applicable)
  committee_constituted BOOLEAN NOT NULL DEFAULT FALSE,
  committee_members    JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{name, designation, role}]
  policy_url           TEXT,
  policy_adopted_on    DATE,
  -- Focus areas under Schedule VII (Items i-xii)
  focus_areas          JSONB NOT NULL DEFAULT '[]'::jsonb, -- ['i','iv','viii']
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE csr_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS csr_policy_owner ON csr_policy;
CREATE POLICY csr_policy_owner ON csr_policy
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

CREATE OR REPLACE FUNCTION touch_csr_policy_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_csr_policy_updated_at ON csr_policy;
CREATE TRIGGER trg_csr_policy_updated_at
  BEFORE UPDATE ON csr_policy
  FOR EACH ROW EXECUTE FUNCTION touch_csr_policy_updated_at();

-- ── 2. CSR Projects ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS csr_projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  fiscal_year         TEXT NOT NULL,                      -- '2025-26'
  project_code        TEXT NOT NULL,
  project_name        TEXT NOT NULL,
  schedule_vii_item   TEXT NOT NULL CHECK (schedule_vii_item IN (
                        'i_eradication_hunger_poverty',
                        'ii_promoting_education',
                        'iii_gender_equality',
                        'iv_environmental_sustainability',
                        'v_national_heritage_art_culture',
                        'vi_armed_forces_veterans',
                        'vii_training_sports',
                        'viii_pm_relief_fund',
                        'ix_technology_incubators',
                        'x_rural_development',
                        'xi_slum_area_development',
                        'xii_disaster_management'
                      )),
  is_ongoing          BOOLEAN NOT NULL DEFAULT FALSE,     -- Multi-year projects per Rule 2(1)(i)
  implementation_mode TEXT NOT NULL DEFAULT 'direct' CHECK (implementation_mode IN (
                        'direct',                          -- Company executes directly
                        'implementing_agency_sec8',        -- §8 Company
                        'implementing_agency_trust',
                        'implementing_agency_society',
                        'implementing_agency_govt'
                      )),
  implementing_agency_name TEXT,
  implementing_agency_csr_reg_no TEXT,                    -- CSR Form 1 registration number
  location_state      TEXT,
  location_district   TEXT,
  is_local_area       BOOLEAN NOT NULL DEFAULT FALSE,     -- Local area preference per §135(5)
  -- Budget
  budgeted_amount     NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- Status
  status              TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
                        'planned','in_progress','completed','dropped','transferred_unspent'
                      )),
  start_date          DATE,
  expected_end_date   DATE,
  completion_date     DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_code)
);

CREATE INDEX IF NOT EXISTS idx_csr_projects_user_fy ON csr_projects(user_id, fiscal_year, status);

ALTER TABLE csr_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS csr_projects_owner ON csr_projects;
CREATE POLICY csr_projects_owner ON csr_projects
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

CREATE OR REPLACE FUNCTION touch_csr_projects_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_csr_projects_updated_at ON csr_projects;
CREATE TRIGGER trg_csr_projects_updated_at
  BEFORE UPDATE ON csr_projects
  FOR EACH ROW EXECUTE FUNCTION touch_csr_projects_updated_at();

-- ── 3. CSR Project Expenses ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS csr_project_expenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  project_id          UUID NOT NULL REFERENCES csr_projects(id) ON DELETE CASCADE,
  expense_date        DATE NOT NULL,
  amount              NUMERIC(18,2) NOT NULL,
  description         TEXT NOT NULL,
  -- Mode of disbursement
  is_capex            BOOLEAN NOT NULL DEFAULT FALSE,     -- CSR contribution creating an asset
  -- Linkage to GL
  journal_id          UUID,
  payment_reference   TEXT,
  receipt_url         TEXT,
  fiscal_year         TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          TEXT
);

CREATE INDEX IF NOT EXISTS idx_csr_exp_project ON csr_project_expenses(project_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_csr_exp_user_fy ON csr_project_expenses(user_id, fiscal_year);

ALTER TABLE csr_project_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS csr_exp_owner ON csr_project_expenses;
CREATE POLICY csr_exp_owner ON csr_project_expenses
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 4. Unspent CSR transfers (§135(5) / §135(6)) ───────────────────────────
CREATE TABLE IF NOT EXISTS csr_unspent_transfers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  fiscal_year         TEXT NOT NULL,                      -- FY the unspent amount relates to
  transfer_date       DATE NOT NULL,
  amount              NUMERIC(18,2) NOT NULL,
  transfer_type       TEXT NOT NULL CHECK (transfer_type IN (
                        'unspent_csr_account',             -- §135(6) — ongoing projects (within 30 days of FY-end)
                        'schedule_vii_fund'                -- §135(5) proviso — other unspent (within 6 months of FY-end)
                      )),
  destination         TEXT NOT NULL,                      -- 'PM National Relief Fund' / 'Unspent CSR Account A/c No. XXX'
  reference_number    TEXT,
  related_project_id  UUID REFERENCES csr_projects(id) ON DELETE SET NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_csr_unspent_user_fy ON csr_unspent_transfers(user_id, fiscal_year);

ALTER TABLE csr_unspent_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS csr_unspent_owner ON csr_unspent_transfers;
CREATE POLICY csr_unspent_owner ON csr_unspent_transfers
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 5. CSR Obligation Calculator ───────────────────────────────────────────
-- §135(5): 2% of average net profit of preceding 3 FYs.
-- "Net profit" per §198 is approx PAT with specific adjustments. For automation
-- we use PAT as a proxy; the user can override via a manual entry if needed.
CREATE OR REPLACE FUNCTION compute_csr_obligation(
  p_user_id     TEXT,
  p_fiscal_year TEXT
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_fy_start INT;
  v_pat_3yr NUMERIC := 0;
  v_pat_y1  NUMERIC := 0; v_pat_y2  NUMERIC := 0; v_pat_y3  NUMERIC := 0;
  v_pl_y1   JSONB;        v_pl_y2   JSONB;        v_pl_y3   JSONB;
  v_avg     NUMERIC := 0;
  v_obligation NUMERIC := 0;
  v_spent   NUMERIC := 0;
  v_unspent NUMERIC := 0;
  v_transferred NUMERIC := 0;
  v_threshold_met BOOLEAN;
  v_settings RECORD;
BEGIN
  -- Parse FY start year
  v_fy_start := CASE WHEN p_fiscal_year ~ '^\d{4}-\d{2}$' THEN substring(p_fiscal_year from 1 for 4)::INT
                     ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT END;

  -- Compute PAT for each of the preceding 3 FYs
  v_pl_y1 := get_schedule_iii_profit_loss(p_user_id, make_date(v_fy_start - 1, 4, 1), make_date(v_fy_start, 3, 31), FALSE);
  v_pl_y2 := get_schedule_iii_profit_loss(p_user_id, make_date(v_fy_start - 2, 4, 1), make_date(v_fy_start - 1, 3, 31), FALSE);
  v_pl_y3 := get_schedule_iii_profit_loss(p_user_id, make_date(v_fy_start - 3, 4, 1), make_date(v_fy_start - 2, 3, 31), FALSE);

  v_pat_y1 := COALESCE((v_pl_y1 ->> 'profit_after_tax')::NUMERIC, 0);
  v_pat_y2 := COALESCE((v_pl_y2 ->> 'profit_after_tax')::NUMERIC, 0);
  v_pat_y3 := COALESCE((v_pl_y3 ->> 'profit_after_tax')::NUMERIC, 0);
  v_pat_3yr := v_pat_y1 + v_pat_y2 + v_pat_y3;
  v_avg := v_pat_3yr / 3.0;
  v_obligation := GREATEST(v_avg * 0.02, 0);

  -- Spent during the obligation FY
  SELECT COALESCE(SUM(amount), 0) INTO v_spent
    FROM csr_project_expenses
   WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year;

  -- Transferred (counts as compliance for unspent amounts)
  SELECT COALESCE(SUM(amount), 0) INTO v_transferred
    FROM csr_unspent_transfers
   WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year;

  v_unspent := GREATEST(v_obligation - v_spent - v_transferred, 0);

  -- Applicability test §135(1): any of net worth ≥ 500cr / turnover ≥ 1000cr / net profit ≥ 5cr in preceding FY
  -- Net profit threshold = ₹5cr (50,000,000) — we can test this directly
  v_threshold_met := (v_pat_y1 >= 50000000); -- net-profit threshold; UI lets user override

  -- Pull declared applicability if set
  SELECT * INTO v_settings FROM csr_policy WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'fiscal_year',          p_fiscal_year,
    'applicability_threshold_met',  v_threshold_met,
    'applicability_declared',       COALESCE(v_settings.is_applicable, FALSE),
    'pat_preceding_fy_1',           ROUND(v_pat_y1::NUMERIC, 2),
    'pat_preceding_fy_2',           ROUND(v_pat_y2::NUMERIC, 2),
    'pat_preceding_fy_3',           ROUND(v_pat_y3::NUMERIC, 2),
    'sum_3yr',                      ROUND(v_pat_3yr::NUMERIC, 2),
    'average_net_profit_3yr',       ROUND(v_avg::NUMERIC, 2),
    'obligation_2pct',              ROUND(v_obligation::NUMERIC, 2),
    'amount_spent',                 ROUND(v_spent::NUMERIC, 2),
    'amount_transferred_to_funds',  ROUND(v_transferred::NUMERIC, 2),
    'unspent_balance',              ROUND(v_unspent::NUMERIC, 2),
    'compliance_status',
        CASE
          WHEN v_unspent < 0.01 THEN 'compliant'
          WHEN v_unspent > 0 AND v_unspent <= (v_obligation * 0.05) THEN 'marginal'
          ELSE 'non_compliant'
        END
  );
END;
$$;

-- ── 6. Annual Report data (Form CSR-2 / Annexure VII to Board's Report) ────
CREATE OR REPLACE FUNCTION get_csr_annual_report(
  p_user_id     TEXT,
  p_fiscal_year TEXT
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_obligation JSONB;
  v_projects   JSONB;
  v_transfers  JSONB;
  v_settings   RECORD;
BEGIN
  v_obligation := compute_csr_obligation(p_user_id, p_fiscal_year);

  -- Projects with their per-project spend
  SELECT jsonb_agg(jsonb_build_object(
    'project_id',           p.id,
    'project_code',         p.project_code,
    'project_name',         p.project_name,
    'schedule_vii_item',    p.schedule_vii_item,
    'is_ongoing',           p.is_ongoing,
    'implementation_mode',  p.implementation_mode,
    'implementing_agency',  p.implementing_agency_name,
    'csr_reg_no',           p.implementing_agency_csr_reg_no,
    'location_state',       p.location_state,
    'location_district',    p.location_district,
    'is_local_area',        p.is_local_area,
    'budgeted_amount',      ROUND(p.budgeted_amount::NUMERIC, 2),
    'amount_spent',         ROUND(COALESCE((SELECT SUM(e.amount) FROM csr_project_expenses e WHERE e.project_id = p.id), 0)::NUMERIC, 2),
    'capex_amount',         ROUND(COALESCE((SELECT SUM(e.amount) FROM csr_project_expenses e WHERE e.project_id = p.id AND e.is_capex), 0)::NUMERIC, 2),
    'status',               p.status,
    'start_date',           p.start_date,
    'expected_end_date',    p.expected_end_date,
    'completion_date',      p.completion_date
  ) ORDER BY p.project_code) INTO v_projects
    FROM csr_projects p
   WHERE p.user_id = p_user_id AND p.fiscal_year = p_fiscal_year;

  SELECT jsonb_agg(jsonb_build_object(
    'transfer_date',  transfer_date,
    'amount',         ROUND(amount::NUMERIC, 2),
    'transfer_type',  transfer_type,
    'destination',    destination,
    'reference',      reference_number,
    'related_project_id', related_project_id
  ) ORDER BY transfer_date DESC) INTO v_transfers
    FROM csr_unspent_transfers
   WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year;

  SELECT * INTO v_settings FROM csr_policy WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'fiscal_year',           p_fiscal_year,
    'obligation',            v_obligation,
    'policy', jsonb_build_object(
      'is_applicable',        COALESCE(v_settings.is_applicable, FALSE),
      'committee_constituted',COALESCE(v_settings.committee_constituted, FALSE),
      'committee_members',    COALESCE(v_settings.committee_members, '[]'::jsonb),
      'policy_url',           v_settings.policy_url,
      'policy_adopted_on',    v_settings.policy_adopted_on,
      'focus_areas',          COALESCE(v_settings.focus_areas, '[]'::jsonb)
    ),
    'projects',              COALESCE(v_projects, '[]'::jsonb),
    'unspent_transfers',     COALESCE(v_transfers, '[]'::jsonb),
    'project_count',         COALESCE(jsonb_array_length(v_projects), 0),
    'ongoing_project_count', (
      SELECT COUNT(*) FROM csr_projects
       WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year AND is_ongoing = TRUE
    )
  );
END;
$$;

-- ── 7. Notes to Accounts auto-gen — CSR disclosure (Note 37) ───────────────
CREATE OR REPLACE FUNCTION generate_csr_note(p_user_id TEXT, p_fy TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_obl JSONB;
  v_body TEXT;
BEGIN
  v_obl := compute_csr_obligation(p_user_id, p_fy);

  v_body := format(
    E'**CSR Obligation Disclosure (Section 135 Companies Act 2013, FY %s)**\n\n'
    '- Applicability threshold met: %s\n'
    '- Average net profit of preceding 3 FYs: ₹ %s\n'
    '- CSR obligation @ 2%%: ₹ %s\n'
    '- Amount spent during the year: ₹ %s\n'
    '- Amount transferred to Schedule VII / Unspent CSR A/c: ₹ %s\n'
    '- Unspent balance at year-end: ₹ %s\n'
    '- Compliance status: %s\n\n'
    'A detailed project-wise CSR Annual Report (Annexure VII to Board''s Report) is filed separately under Form CSR-2.',
    p_fy,
    CASE WHEN (v_obl ->> 'applicability_threshold_met')::BOOLEAN THEN 'Yes' ELSE 'No' END,
    to_char(COALESCE((v_obl ->> 'average_net_profit_3yr')::NUMERIC, 0),   'FM99,99,99,999'),
    to_char(COALESCE((v_obl ->> 'obligation_2pct')::NUMERIC, 0),          'FM99,99,99,999'),
    to_char(COALESCE((v_obl ->> 'amount_spent')::NUMERIC, 0),             'FM99,99,99,999'),
    to_char(COALESCE((v_obl ->> 'amount_transferred_to_funds')::NUMERIC, 0), 'FM99,99,99,999'),
    to_char(COALESCE((v_obl ->> 'unspent_balance')::NUMERIC, 0),          'FM99,99,99,999'),
    UPPER(REPLACE(COALESCE(v_obl ->> 'compliance_status', 'unknown'), '_', ' '))
  );

  INSERT INTO accounting_notes (user_id, fiscal_year, note_no, title, category, auto_body, display_order)
  VALUES (p_user_id, p_fy, '37', 'Corporate Social Responsibility (§135)', 'other', v_body, 37)
  ON CONFLICT (user_id, fiscal_year, note_no) DO UPDATE
    SET auto_body = EXCLUDED.auto_body, updated_at = NOW();
END;
$$;

-- ── 8. Consolidation skip-FY flag (small completion) ───────────────────────
ALTER TABLE consolidation_members
  ADD COLUMN IF NOT EXISTS included_from_date DATE,       -- include in consolidation only from this date
  ADD COLUMN IF NOT EXISTS excluded_from_date DATE,       -- stop including from this date (disposal)
  ADD COLUMN IF NOT EXISTS skip_fiscal_years TEXT[] DEFAULT '{}'::TEXT[];

COMMENT ON COLUMN consolidation_members.included_from_date IS
  'For mid-year acquisitions: consolidation_members included from this date only (proportionate consolidation for the acquisition FY)';
COMMENT ON COLUMN consolidation_members.skip_fiscal_years IS
  'List of fiscal_year strings (e.g. {"2024-25"}) where this member should NOT be consolidated';

GRANT EXECUTE ON FUNCTION compute_csr_obligation(TEXT, TEXT)   TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_csr_annual_report(TEXT, TEXT)    TO authenticated, anon;
GRANT EXECUTE ON FUNCTION generate_csr_note(TEXT, TEXT)        TO authenticated, anon;
