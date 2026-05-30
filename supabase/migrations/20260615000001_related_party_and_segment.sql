-- ============================================================================
-- PHASE 22 — RELATED PARTY TRANSACTIONS (AS 18 / Ind AS 24 / §188)
--            + SEGMENT REPORTING (AS 17 / Ind AS 108)
-- ----------------------------------------------------------------------------
-- Both are statutorily required disclosures under Schedule III. Phase 22
-- delivers the data model + aggregation RPCs powering the disclosure schedules.
-- ============================================================================

-- ============================================================================
-- PART 1: RELATED PARTY TRANSACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS related_parties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  party_name      TEXT NOT NULL,
  -- AS 18 / Ind AS 24 relationship categories
  relationship    TEXT NOT NULL CHECK (relationship IN (
                    'holding_company',          -- Parent
                    'subsidiary_company',       -- Subsidiary
                    'fellow_subsidiary',        -- Sister concern
                    'associate',                -- Significant influence
                    'joint_venture',            -- Joint control
                    'kmp',                      -- Key Managerial Personnel (CEO/CFO/MD/WTD/CS)
                    'kmp_relative',             -- Relative of KMP (per Companies Act §2(77))
                    'director',                 -- Director (non-KMP)
                    'director_relative',
                    'enterprise_with_common_kmp',  -- e.g. another co. where same MD sits
                    'post_employment_benefit_plan',
                    'controlled_other'
                  )),
  -- Party identification
  pan             TEXT,
  cin             TEXT,
  gstin           TEXT,
  address         TEXT,
  email           TEXT,
  phone           TEXT,
  -- Linkage to existing master data (optional — RP may also be a vendor/client)
  vendor_id       UUID,
  client_id       UUID,
  kmp_position    TEXT,                  -- e.g. 'Managing Director', 'CFO'
  appointment_date DATE,
  cessation_date  DATE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  remarks         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, party_name)
);

CREATE INDEX IF NOT EXISTS idx_related_parties_user   ON related_parties(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_related_parties_vendor ON related_parties(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_related_parties_client ON related_parties(client_id) WHERE client_id IS NOT NULL;

ALTER TABLE related_parties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS related_parties_owner ON related_parties;
CREATE POLICY related_parties_owner ON related_parties
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- RPT transaction log — captures discrete transactions (sale, purchase, loan
-- given/taken, guarantee, deposit, advance, lease, remuneration, etc.)
CREATE TABLE IF NOT EXISTS related_party_transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  related_party_id     UUID NOT NULL REFERENCES related_parties(id) ON DELETE CASCADE,
  transaction_date     DATE NOT NULL,
  transaction_type     TEXT NOT NULL CHECK (transaction_type IN (
                         'sale_goods','sale_services','purchase_goods','purchase_services',
                         'loan_given','loan_taken','interest_received','interest_paid',
                         'rent_received','rent_paid','royalty_received','royalty_paid',
                         'dividend_received','dividend_paid',
                         'guarantee_given','guarantee_taken',
                         'deposit_placed','deposit_received',
                         'advance_given','advance_received',
                         'remuneration','sitting_fees','reimbursement',
                         'sale_fixed_asset','purchase_fixed_asset',
                         'investment','divestment',
                         'other'
                       )),
  description          TEXT NOT NULL,
  amount               NUMERIC(18,2) NOT NULL,
  is_arms_length       BOOLEAN NOT NULL DEFAULT TRUE,    -- §188(1) disclosure
  approval_required    BOOLEAN NOT NULL DEFAULT FALSE,   -- §188 / Audit Cmte / Special Resolution
  approval_obtained    BOOLEAN NOT NULL DEFAULT FALSE,
  approval_date        DATE,
  approval_reference   TEXT,                              -- Board resolution / AGM SR no
  -- Linkage to source documents
  journal_id           UUID,
  invoice_id           UUID,
  bill_id              UUID,
  fiscal_year          TEXT NOT NULL,                    -- '2025-26'
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           TEXT
);

CREATE INDEX IF NOT EXISTS idx_rpt_txn_user_fy   ON related_party_transactions(user_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_rpt_txn_party     ON related_party_transactions(related_party_id);
CREATE INDEX IF NOT EXISTS idx_rpt_txn_date      ON related_party_transactions(user_id, transaction_date DESC);

ALTER TABLE related_party_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rpt_txn_owner ON related_party_transactions;
CREATE POLICY rpt_txn_owner ON related_party_transactions
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

CREATE OR REPLACE FUNCTION touch_related_parties_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_related_parties_updated_at ON related_parties;
CREATE TRIGGER trg_related_parties_updated_at
  BEFORE UPDATE ON related_parties
  FOR EACH ROW EXECUTE FUNCTION touch_related_parties_updated_at();

-- ── RPT DISCLOSURE SCHEDULE RPC ─────────────────────────────────────────────
-- Required under Note 32 of Schedule III: by relationship type × transaction
-- type, with separate columns for "arm's-length" vs not.
CREATE OR REPLACE FUNCTION get_rpt_disclosure_schedule(
  p_user_id      TEXT,
  p_fiscal_year  TEXT
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH grouped AS (
    SELECT
      rp.relationship,
      rpt.transaction_type,
      rp.party_name,
      rp.id   AS related_party_id,
      SUM(rpt.amount)                                          AS total_amount,
      SUM(CASE WHEN rpt.is_arms_length THEN rpt.amount ELSE 0 END)     AS arms_length_amount,
      SUM(CASE WHEN NOT rpt.is_arms_length THEN rpt.amount ELSE 0 END) AS non_arms_length_amount,
      COUNT(*)                                                 AS txn_count,
      COUNT(*) FILTER (WHERE rpt.approval_required AND NOT rpt.approval_obtained) AS pending_approvals
    FROM related_party_transactions rpt
    JOIN related_parties rp ON rp.id = rpt.related_party_id
    WHERE rpt.user_id = p_user_id
      AND rpt.fiscal_year = p_fiscal_year
    GROUP BY rp.relationship, rpt.transaction_type, rp.party_name, rp.id
  ),
  by_relationship AS (
    SELECT
      relationship,
      ROUND(SUM(total_amount)::NUMERIC, 2)              AS total_amount,
      ROUND(SUM(arms_length_amount)::NUMERIC, 2)        AS arms_length_amount,
      ROUND(SUM(non_arms_length_amount)::NUMERIC, 2)    AS non_arms_length_amount,
      SUM(pending_approvals)                            AS pending_approvals,
      SUM(txn_count)                                    AS txn_count,
      jsonb_agg(jsonb_build_object(
        'related_party_id',       related_party_id,
        'party_name',             party_name,
        'transaction_type',       transaction_type,
        'total_amount',           ROUND(total_amount::NUMERIC, 2),
        'arms_length_amount',     ROUND(arms_length_amount::NUMERIC, 2),
        'non_arms_length_amount', ROUND(non_arms_length_amount::NUMERIC, 2),
        'txn_count',              txn_count,
        'pending_approvals',      pending_approvals
      ) ORDER BY party_name, transaction_type) AS rows
    FROM grouped
    GROUP BY relationship
  )
  SELECT jsonb_build_object(
    'fiscal_year',           p_fiscal_year,
    'relationships',         jsonb_agg(
      jsonb_build_object(
        'relationship',           relationship,
        'total_amount',           total_amount,
        'arms_length_amount',     arms_length_amount,
        'non_arms_length_amount', non_arms_length_amount,
        'pending_approvals',      pending_approvals,
        'txn_count',              txn_count,
        'rows',                   rows
      ) ORDER BY relationship
    ),
    'grand_total',           (SELECT ROUND(COALESCE(SUM(total_amount),0)::NUMERIC,2)              FROM by_relationship),
    'arms_length_total',     (SELECT ROUND(COALESCE(SUM(arms_length_amount),0)::NUMERIC,2)        FROM by_relationship),
    'non_arms_length_total', (SELECT ROUND(COALESCE(SUM(non_arms_length_amount),0)::NUMERIC,2)    FROM by_relationship),
    'total_txn_count',       (SELECT COALESCE(SUM(txn_count),0)                                   FROM by_relationship),
    'total_pending_approvals',(SELECT COALESCE(SUM(pending_approvals),0)                          FROM by_relationship)
  ) INTO v_result
  FROM by_relationship;

  RETURN COALESCE(v_result, jsonb_build_object(
    'fiscal_year', p_fiscal_year,
    'relationships', '[]'::jsonb,
    'grand_total', 0, 'arms_length_total', 0, 'non_arms_length_total', 0,
    'total_txn_count', 0, 'total_pending_approvals', 0
  ));
END;
$$;

-- ============================================================================
-- PART 2: SEGMENT REPORTING (AS 17 / Ind AS 108)
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_segments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  segment_code    TEXT NOT NULL,
  segment_name    TEXT NOT NULL,
  segment_type    TEXT NOT NULL DEFAULT 'business' CHECK (segment_type IN ('business','geographical')),
  -- "Driver" = which journal_line tag identifies this segment
  driver          TEXT NOT NULL CHECK (driver IN ('cost_center','project','branch','department')),
  -- "Driver value" = the actual UUID / TEXT value of the tag that maps to this segment
  driver_value    TEXT NOT NULL,                       -- cost_center_id / project_id / branch_id (UUIDs as text) or department name
  description     TEXT,
  is_reportable   BOOLEAN NOT NULL DEFAULT TRUE,       -- Below 10% threshold can be aggregated as "Others"
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, segment_code)
);

CREATE INDEX IF NOT EXISTS idx_business_segments_user ON business_segments(user_id, is_active);

ALTER TABLE business_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_segments_owner ON business_segments;
CREATE POLICY business_segments_owner ON business_segments
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

CREATE OR REPLACE FUNCTION touch_business_segments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_business_segments_updated_at ON business_segments;
CREATE TRIGGER trg_business_segments_updated_at
  BEFORE UPDATE ON business_segments
  FOR EACH ROW EXECUTE FUNCTION touch_business_segments_updated_at();

-- ── Segment Performance RPC ────────────────────────────────────────────────
-- For each segment computes revenue, expenses, profit, segment assets, liabs
-- by joining journal_lines on the configured driver tag.
CREATE OR REPLACE FUNCTION get_segment_performance(
  p_user_id      TEXT,
  p_period_start DATE,
  p_period_end   DATE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSONB;
  v_total_revenue NUMERIC;
BEGIN
  WITH segments AS (
    SELECT id, segment_code, segment_name, segment_type, driver, driver_value, description
      FROM business_segments
     WHERE user_id = p_user_id AND is_active = TRUE
  ),
  -- Tag-driver join: pick the right column from journal_lines based on driver
  lines AS (
    SELECT
      jl.user_id,
      jl.account_id,
      jl.debit, jl.credit,
      j.journal_date, j.status,
      a.account_type,
      a.schedule_iii_line_code,
      a.schedule_iii_section,
      -- Coerce all driver values to TEXT for matching
      COALESCE(jl.cost_center_id::TEXT, '') AS cc_text,
      COALESCE(jl.project_id::TEXT, '')     AS proj_text,
      COALESCE(jl.branch_id::TEXT, '')      AS branch_text,
      COALESCE(jl.department, '')           AS dept_text
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
    JOIN accounts a ON a.id = jl.account_id
    WHERE jl.user_id = p_user_id
  ),
  per_segment AS (
    SELECT
      s.id                AS segment_id,
      s.segment_code,
      s.segment_name,
      s.segment_type,
      s.driver,
      s.description,
      -- Revenue (Income net) for the period
      ROUND(COALESCE(SUM(
        CASE WHEN l.account_type = 'Income'
                  AND l.journal_date BETWEEN p_period_start AND p_period_end
             THEN COALESCE(l.credit,0) - COALESCE(l.debit,0)
             ELSE 0 END
      ), 0)::NUMERIC, 2) AS revenue,
      -- Expenses (Expense net) for the period (excluding tax)
      ROUND(COALESCE(SUM(
        CASE WHEN l.account_type = 'Expense'
                  AND l.schedule_iii_line_code <> 'PL.E.8'
                  AND l.journal_date BETWEEN p_period_start AND p_period_end
             THEN COALESCE(l.debit,0) - COALESCE(l.credit,0)
             ELSE 0 END
      ), 0)::NUMERIC, 2) AS expenses,
      -- Segment Assets (closing balance as of period_end)
      ROUND(COALESCE(SUM(
        CASE WHEN l.account_type = 'Asset'
                  AND l.journal_date <= p_period_end
             THEN COALESCE(l.debit,0) - COALESCE(l.credit,0)
             ELSE 0 END
      ), 0)::NUMERIC, 2) AS segment_assets,
      -- Segment Liabilities (closing balance)
      ROUND(COALESCE(SUM(
        CASE WHEN l.account_type = 'Liability'
                  AND l.journal_date <= p_period_end
             THEN COALESCE(l.credit,0) - COALESCE(l.debit,0)
             ELSE 0 END
      ), 0)::NUMERIC, 2) AS segment_liabilities,
      -- Capital expenditure (additions to Tangible/Intangible Assets in period)
      ROUND(COALESCE(SUM(
        CASE WHEN l.account_type = 'Asset'
                  AND l.schedule_iii_line_code IN ('BS.NCA.1','BS.NCA.2','BS.NCA.3')
                  AND l.journal_date BETWEEN p_period_start AND p_period_end
             THEN COALESCE(l.debit,0) - COALESCE(l.credit,0)
             ELSE 0 END
      ), 0)::NUMERIC, 2) AS capex,
      -- Depreciation (PL.E.6) in period
      ROUND(COALESCE(SUM(
        CASE WHEN l.schedule_iii_line_code = 'PL.E.6'
                  AND l.journal_date BETWEEN p_period_start AND p_period_end
             THEN COALESCE(l.debit,0) - COALESCE(l.credit,0)
             ELSE 0 END
      ), 0)::NUMERIC, 2) AS depreciation
    FROM segments s
    LEFT JOIN lines l ON
      CASE s.driver
        WHEN 'cost_center' THEN l.cc_text     = s.driver_value
        WHEN 'project'     THEN l.proj_text   = s.driver_value
        WHEN 'branch'      THEN l.branch_text = s.driver_value
        WHEN 'department'  THEN l.dept_text   = s.driver_value
        ELSE FALSE
      END
    GROUP BY s.id, s.segment_code, s.segment_name, s.segment_type, s.driver, s.description
  ),
  -- Compute reportability per AS 17 / Ind AS 108 quantitative threshold:
  -- A segment is "reportable" if its revenue / profit / assets is >= 10% of combined
  with_pct AS (
    SELECT
      ps.*,
      (ps.revenue - ps.expenses) AS profit,
      CASE WHEN (SELECT NULLIF(SUM(ABS(revenue)), 0) FROM per_segment) IS NOT NULL
           THEN ROUND(100.0 * ABS(ps.revenue) / (SELECT SUM(ABS(revenue)) FROM per_segment), 2)
           ELSE 0 END AS revenue_pct,
      CASE WHEN (SELECT NULLIF(SUM(ABS(segment_assets)), 0) FROM per_segment) IS NOT NULL
           THEN ROUND(100.0 * ABS(ps.segment_assets) / (SELECT SUM(ABS(segment_assets)) FROM per_segment), 2)
           ELSE 0 END AS assets_pct
    FROM per_segment ps
  )
  SELECT jsonb_build_object(
    'period_start', p_period_start,
    'period_end',   p_period_end,
    'segments', jsonb_agg(jsonb_build_object(
      'segment_id',           segment_id,
      'segment_code',         segment_code,
      'segment_name',         segment_name,
      'segment_type',         segment_type,
      'driver',               driver,
      'description',          description,
      'revenue',              revenue,
      'expenses',             expenses,
      'profit',               profit,
      'segment_assets',       segment_assets,
      'segment_liabilities',  segment_liabilities,
      'capex',                capex,
      'depreciation',         depreciation,
      'revenue_pct',          revenue_pct,
      'assets_pct',           assets_pct,
      'is_reportable_threshold', (revenue_pct >= 10 OR assets_pct >= 10 OR ABS(profit) >= 10)
    ) ORDER BY segment_name),
    'totals', jsonb_build_object(
      'revenue',             ROUND(COALESCE(SUM(revenue),0)::NUMERIC, 2),
      'expenses',            ROUND(COALESCE(SUM(expenses),0)::NUMERIC, 2),
      'profit',              ROUND(COALESCE(SUM(profit),0)::NUMERIC, 2),
      'segment_assets',      ROUND(COALESCE(SUM(segment_assets),0)::NUMERIC, 2),
      'segment_liabilities', ROUND(COALESCE(SUM(segment_liabilities),0)::NUMERIC, 2),
      'capex',               ROUND(COALESCE(SUM(capex),0)::NUMERIC, 2),
      'depreciation',        ROUND(COALESCE(SUM(depreciation),0)::NUMERIC, 2)
    )
  ) INTO v_result
  FROM with_pct;

  RETURN COALESCE(v_result, jsonb_build_object(
    'period_start', p_period_start, 'period_end', p_period_end,
    'segments', '[]'::jsonb,
    'totals', jsonb_build_object(
      'revenue', 0, 'expenses', 0, 'profit', 0,
      'segment_assets', 0, 'segment_liabilities', 0,
      'capex', 0, 'depreciation', 0
    )
  ));
END;
$$;

-- ============================================================================
-- PART 3: Refresh RPT note + add Segment note to Notes to Accounts auto-gen
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_rpt_segment_notes(p_user_id TEXT, p_fy TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_rpt JSONB;
  v_seg JSONB;
  v_rpt_body TEXT;
  v_seg_body TEXT;
BEGIN
  v_rpt := get_rpt_disclosure_schedule(p_user_id, p_fy);
  v_rpt_body := format(
    E'**Total related-party transactions for FY %s:** ₹ %s\n\n'
    '- Arm''s-length transactions: ₹ %s\n'
    '- Non-arm''s-length transactions: ₹ %s\n'
    '- Pending board / audit-committee approvals: %s\n\n'
    'Detailed party-wise schedule is available in the Related Party Transactions module. Disclosure is in compliance with AS 18 / Ind AS 24 and Section 188 of the Companies Act, 2013.',
    p_fy,
    to_char(COALESCE((v_rpt ->> 'grand_total')::NUMERIC, 0),           'FM99,99,99,999'),
    to_char(COALESCE((v_rpt ->> 'arms_length_total')::NUMERIC, 0),     'FM99,99,99,999'),
    to_char(COALESCE((v_rpt ->> 'non_arms_length_total')::NUMERIC, 0), 'FM99,99,99,999'),
    COALESCE(v_rpt ->> 'total_pending_approvals', '0')
  );

  INSERT INTO accounting_notes (user_id, fiscal_year, note_no, title, category, auto_body, display_order)
  VALUES (
    p_user_id, p_fy, '32', 'Related Party Transactions Disclosure', 'related_party',
    v_rpt_body, 32
  )
  ON CONFLICT (user_id, fiscal_year, note_no) DO UPDATE
    SET auto_body = EXCLUDED.auto_body, updated_at = NOW();

  -- Segment note (best-effort — pulls from FY-bounded segment perf)
  INSERT INTO accounting_notes (user_id, fiscal_year, note_no, title, category, auto_body, display_order)
  VALUES (
    p_user_id, p_fy, '36', 'Segment Reporting (AS 17 / Ind AS 108)', 'other',
    E'The Company''s primary segments are identified based on internal management reporting structure. '
    'Segment revenue, segment result, segment assets and segment liabilities are presented in the Segment Reporting module. '
    'Inter-segment transactions, if any, are eliminated. Common income and expenses that cannot be allocated on a reasonable basis are classified as "Unallocated".\n\n'
    'A business segment is reportable when (a) its revenue is 10% or more of total segment revenue, OR (b) its absolute segment result is 10% or more of the combined result, OR (c) its segment assets are 10% or more of total segment assets.',
    36
  )
  ON CONFLICT (user_id, fiscal_year, note_no) DO UPDATE
    SET auto_body = EXCLUDED.auto_body, updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION get_rpt_disclosure_schedule(TEXT, TEXT)         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_segment_performance(TEXT, DATE, DATE)       TO authenticated, anon;
GRANT EXECUTE ON FUNCTION generate_rpt_segment_notes(TEXT, TEXT)          TO authenticated, anon;
