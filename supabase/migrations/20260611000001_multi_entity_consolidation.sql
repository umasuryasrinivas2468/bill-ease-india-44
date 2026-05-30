-- ============================================================================
-- PHASE 18 — MULTI-ENTITY CONSOLIDATION (AS 21 / Ind AS 110)
-- ----------------------------------------------------------------------------
-- Allows a CA / parent entity to roll up multiple standalone entities (each
-- with their own user_id, COA, journals, ledgers) into consolidated financial
-- statements with:
--   • Line-by-line addition across members
--   • Inter-company elimination (paired accounts that net out)
--   • Minority Interest / NCI computation from ownership_pct
--   • Both standalone and consolidated reports via the same Schedule III views
--
-- Tables:
--   • consolidation_groups        — one row per consolidated group
--   • consolidation_members       — entities in the group + ownership %
--   • intercompany_eliminations   — paired accounts to net out
--
-- RPCs:
--   • get_consolidated_balance_sheet(group_id, as_of, prev_as_of?)
--   • get_consolidated_pl(group_id, period_start, period_end)
-- ============================================================================

CREATE TABLE IF NOT EXISTS consolidation_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   TEXT NOT NULL,                     -- the CA / parent owner
  name            TEXT NOT NULL,                     -- e.g. 'Acme Group FY 2025-26'
  parent_user_id  TEXT NOT NULL,                     -- entity treated as parent
  fiscal_year     TEXT,                              -- '2025-26'
  presentation_currency TEXT NOT NULL DEFAULT 'INR',
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consol_groups_owner ON consolidation_groups(owner_user_id, is_active);

ALTER TABLE consolidation_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consolidation_groups_owner ON consolidation_groups;
CREATE POLICY consolidation_groups_owner ON consolidation_groups
  FOR ALL USING (
    owner_user_id = COALESCE(auth.uid()::text,
                             NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

CREATE TABLE IF NOT EXISTS consolidation_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES consolidation_groups(id) ON DELETE CASCADE,
  member_user_id  TEXT NOT NULL,                     -- entity (one of the user_ids)
  display_name    TEXT NOT NULL,                     -- 'Acme Manufacturing Ltd'
  ownership_pct   NUMERIC(7,4) NOT NULL DEFAULT 100 CHECK (ownership_pct >= 0 AND ownership_pct <= 100),
  is_parent       BOOLEAN NOT NULL DEFAULT FALSE,
  acquisition_date DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, member_user_id)
);

CREATE INDEX IF NOT EXISTS idx_consol_members_group ON consolidation_members(group_id);

ALTER TABLE consolidation_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consolidation_members_owner ON consolidation_members;
CREATE POLICY consolidation_members_owner ON consolidation_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM consolidation_groups g
             WHERE g.id = group_id
               AND g.owner_user_id = COALESCE(auth.uid()::text,
                     NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, '')))
  );

-- Inter-company elimination pairs. Each row says "net this amount out of the
-- given Schedule III line for these two entities" — e.g. parent's loan
-- receivable from subsidiary cancels subsidiary's loan payable to parent.
CREATE TABLE IF NOT EXISTS intercompany_eliminations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES consolidation_groups(id) ON DELETE CASCADE,
  fiscal_year     TEXT NOT NULL,
  elim_type       TEXT NOT NULL CHECK (elim_type IN (
                    'intercompany_loan','intercompany_sale','intercompany_dividend',
                    'unrealised_profit_in_stock','intercompany_other'
                  )),
  description     TEXT NOT NULL,
  amount          NUMERIC(18,2) NOT NULL,
  line_code       TEXT NOT NULL,                     -- Schedule III line affected
  affects_statement TEXT NOT NULL CHECK (affects_statement IN ('BS','PL','BOTH')),
  from_user_id    TEXT NOT NULL,                     -- entity recording the asset/revenue
  to_user_id      TEXT NOT NULL,                     -- entity recording the liability/expense
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT,
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_intercom_elim_group ON intercompany_eliminations(group_id, fiscal_year);

ALTER TABLE intercompany_eliminations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intercom_elim_owner ON intercompany_eliminations;
CREATE POLICY intercom_elim_owner ON intercompany_eliminations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM consolidation_groups g
             WHERE g.id = group_id
               AND g.owner_user_id = COALESCE(auth.uid()::text,
                     NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, '')))
  );

-- ── Updated-at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_consolidation_groups_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_consol_groups_updated_at ON consolidation_groups;
CREATE TRIGGER trg_consol_groups_updated_at
  BEFORE UPDATE ON consolidation_groups
  FOR EACH ROW EXECUTE FUNCTION touch_consolidation_groups_updated_at();

-- ============================================================================
-- 1. CONSOLIDATED BALANCE SHEET
-- ============================================================================
-- Algorithm (per Schedule III line):
--   sum_balance = Σ (member_balance × ownership_pct/100) for each member
--   ↑ This is the "purchase method" approximation. For full AS 21 fair-value
--     accounting (goodwill calc, capital reserve), the CA should record the
--     consolidation adjustment journals manually in a separate entity and
--     add that entity to the group.
--   sum_balance -= Σ matching intercompany_eliminations rows
--   non_controlling_interest = Σ member_balance × (100-ownership_pct)/100
-- ============================================================================
CREATE OR REPLACE FUNCTION get_consolidated_balance_sheet(
  p_owner_user_id TEXT,
  p_group_id      UUID,
  p_as_of         DATE DEFAULT CURRENT_DATE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_fy TEXT;
  v_result JSONB;
BEGIN
  -- Authorisation
  IF NOT EXISTS (SELECT 1 FROM consolidation_groups
                  WHERE id = p_group_id AND owner_user_id = p_owner_user_id) THEN
    RAISE EXCEPTION 'Consolidation group not accessible' USING ERRCODE = '42501';
  END IF;

  SELECT fiscal_year INTO v_fy FROM consolidation_groups WHERE id = p_group_id;

  WITH members AS (
    SELECT m.member_user_id, m.display_name, m.ownership_pct, m.is_parent
      FROM consolidation_members m
     WHERE m.group_id = p_group_id
  ),
  per_member_line AS (
    SELECT
      m.member_user_id,
      m.display_name,
      m.ownership_pct,
      m.is_parent,
      a.schedule_iii_line_code AS line_code,
      a.account_type,
      SUM(
        CASE a.account_type
          WHEN 'Asset'     THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
          WHEN 'Liability' THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
          WHEN 'Equity'    THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
          WHEN 'Income'    THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
          WHEN 'Expense'   THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
        END
      ) AS amount
    FROM members m
    JOIN accounts a ON a.user_id = m.member_user_id
                   AND COALESCE(a.is_group, FALSE) = FALSE
                   AND a.schedule_iii_line_code IS NOT NULL
    LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
    LEFT JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted' AND j.journal_date <= p_as_of
    GROUP BY m.member_user_id, m.display_name, m.ownership_pct, m.is_parent,
             a.schedule_iii_line_code, a.account_type
  ),
  -- Reserves & Surplus retained earnings injection per member
  per_member_retained AS (
    SELECT
      member_user_id, display_name, ownership_pct, is_parent,
      'BS.E.2' AS line_code,
      'Equity' AS account_type,
      COALESCE(SUM(
        CASE WHEN account_type = 'Income' THEN amount
             WHEN account_type = 'Expense' THEN -amount
             ELSE 0 END
      ), 0) AS amount
    FROM per_member_line
    GROUP BY member_user_id, display_name, ownership_pct, is_parent
  ),
  per_member_bs_full AS (
    SELECT * FROM per_member_line WHERE account_type IN ('Asset','Liability','Equity')
    UNION ALL
    SELECT * FROM per_member_retained
  ),
  -- Per-line: parent share + NCI share
  per_line_aggr AS (
    SELECT
      line_code,
      -- Parent share = amount × ownership_pct/100
      ROUND(SUM(amount * ownership_pct / 100.0)::NUMERIC, 2)             AS parent_share,
      -- NCI share = amount × (100-ownership_pct)/100, only for non-parent members
      ROUND(SUM(
        CASE WHEN is_parent THEN 0
             ELSE amount * (100 - ownership_pct) / 100.0 END
      )::NUMERIC, 2) AS nci_share,
      ROUND(SUM(amount)::NUMERIC, 2)                                     AS gross_sum
    FROM per_member_bs_full
    GROUP BY line_code
  ),
  -- Pull elimination amounts for this group + fiscal year
  eliminations AS (
    SELECT line_code,
           SUM(amount) AS elim_amount
      FROM intercompany_eliminations
     WHERE group_id = p_group_id
       AND fiscal_year = COALESCE(v_fy, fiscal_year)
       AND affects_statement IN ('BS','BOTH')
     GROUP BY line_code
  ),
  combined AS (
    SELECT
      l.line_code, l.section, l.subsection, l.current_non_current AS cnc,
      l.display_label, l.note_no, l.sort_order,
      COALESCE(p.parent_share, 0) - COALESCE(e.elim_amount, 0) AS amount,
      COALESCE(p.nci_share, 0)                                  AS nci,
      COALESCE(p.gross_sum, 0)                                  AS gross_sum,
      COALESCE(e.elim_amount, 0)                                AS elimination
    FROM schedule_iii_lines l
    LEFT JOIN per_line_aggr p ON p.line_code = l.line_code
    LEFT JOIN eliminations  e ON e.line_code = l.line_code
    WHERE l.statement_type = 'BS'
  )
  SELECT jsonb_build_object(
    'group_id',     p_group_id,
    'as_of',        p_as_of,
    'members', (SELECT jsonb_agg(jsonb_build_object(
                  'user_id', member_user_id, 'name', display_name,
                  'ownership_pct', ownership_pct, 'is_parent', is_parent))
                  FROM members),
    'sections', jsonb_agg(section_json ORDER BY section_order),
    'minority_interest_total',
        (SELECT ROUND(SUM(nci)::NUMERIC, 2)
           FROM combined WHERE section = 'EQUITY_AND_LIABILITIES'),
    'eliminations_total',
        (SELECT ROUND(SUM(ABS(elimination))::NUMERIC, 2) FROM combined)
  ) INTO v_result
  FROM (
    SELECT
      section,
      MIN(sort_order) AS section_order,
      jsonb_build_object(
        'section', section,
        'total',   ROUND(SUM(amount)::NUMERIC, 2),
        'nci_total', ROUND(SUM(nci)::NUMERIC, 2),
        'subsections', (
          SELECT jsonb_agg(sub_json ORDER BY sub_order)
            FROM (
              SELECT
                subsection,
                MIN(sort_order) AS sub_order,
                jsonb_build_object(
                  'subsection',          subsection,
                  'current_non_current', MIN(cnc),
                  'total',               ROUND(SUM(amount)::NUMERIC, 2),
                  'nci_total',           ROUND(SUM(nci)::NUMERIC, 2),
                  'lines', jsonb_agg(
                    jsonb_build_object(
                      'line_code',     line_code,
                      'label',         display_label,
                      'note_no',       note_no,
                      'amount',        amount,
                      'gross_sum',     gross_sum,
                      'elimination',   elimination,
                      'nci',           nci,
                      'current_non_current', cnc
                    ) ORDER BY sort_order
                  )
                ) AS sub_json
              FROM combined c2
              WHERE c2.section = c.section
              GROUP BY subsection
            ) sub
          )
      ) AS section_json
    FROM combined c
    GROUP BY section
  ) outer_q;

  RETURN COALESCE(v_result, jsonb_build_object(
    'group_id', p_group_id, 'as_of', p_as_of, 'sections', '[]'::jsonb,
    'minority_interest_total', 0, 'eliminations_total', 0));
END;
$$;

-- ============================================================================
-- 2. CONSOLIDATED P&L
-- ============================================================================
CREATE OR REPLACE FUNCTION get_consolidated_pl(
  p_owner_user_id TEXT,
  p_group_id      UUID,
  p_period_start  DATE,
  p_period_end    DATE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_fy TEXT;
  v_result JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM consolidation_groups
                  WHERE id = p_group_id AND owner_user_id = p_owner_user_id) THEN
    RAISE EXCEPTION 'Consolidation group not accessible' USING ERRCODE = '42501';
  END IF;
  SELECT fiscal_year INTO v_fy FROM consolidation_groups WHERE id = p_group_id;

  WITH members AS (
    SELECT m.member_user_id, m.display_name, m.ownership_pct, m.is_parent
      FROM consolidation_members m
     WHERE m.group_id = p_group_id
  ),
  per_member_line AS (
    SELECT
      m.is_parent,
      m.ownership_pct,
      a.schedule_iii_line_code AS line_code,
      a.account_type,
      SUM(
        CASE a.account_type
          WHEN 'Income'  THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
          WHEN 'Expense' THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
        END
      ) AS amount
    FROM members m
    JOIN accounts a ON a.user_id = m.member_user_id
                   AND COALESCE(a.is_group, FALSE) = FALSE
                   AND a.account_type IN ('Income','Expense')
                   AND a.schedule_iii_line_code IS NOT NULL
    LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
    LEFT JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
                        AND j.journal_date BETWEEN p_period_start AND p_period_end
    GROUP BY m.is_parent, m.ownership_pct, a.schedule_iii_line_code, a.account_type
  ),
  per_line_aggr AS (
    SELECT
      line_code,
      ROUND(SUM(amount * ownership_pct / 100.0)::NUMERIC, 2) AS parent_share,
      ROUND(SUM(CASE WHEN is_parent THEN 0
                     ELSE amount * (100 - ownership_pct) / 100.0 END)::NUMERIC, 2) AS nci_share,
      ROUND(SUM(amount)::NUMERIC, 2) AS gross_sum
    FROM per_member_line
    GROUP BY line_code
  ),
  eliminations AS (
    SELECT line_code,
           SUM(amount) AS elim_amount
      FROM intercompany_eliminations
     WHERE group_id = p_group_id
       AND fiscal_year = COALESCE(v_fy, fiscal_year)
       AND affects_statement IN ('PL','BOTH')
     GROUP BY line_code
  ),
  combined AS (
    SELECT
      l.line_code, l.section, l.subsection,
      l.display_label, l.note_no, l.sort_order,
      COALESCE(p.parent_share, 0) - COALESCE(e.elim_amount, 0) AS amount,
      COALESCE(p.nci_share, 0)                                  AS nci,
      COALESCE(p.gross_sum, 0)                                  AS gross_sum,
      COALESCE(e.elim_amount, 0)                                AS elimination
    FROM schedule_iii_lines l
    LEFT JOIN per_line_aggr p ON p.line_code = l.line_code
    LEFT JOIN eliminations  e ON e.line_code = l.line_code
    WHERE l.statement_type = 'PL'
  )
  SELECT jsonb_build_object(
    'group_id',     p_group_id,
    'period_start', p_period_start,
    'period_end',   p_period_end,
    'members',      (SELECT jsonb_agg(jsonb_build_object(
                       'user_id', member_user_id, 'name', display_name,
                       'ownership_pct', ownership_pct, 'is_parent', is_parent))
                       FROM members),
    'total_revenue',  (SELECT ROUND(SUM(amount)::NUMERIC, 2) FROM combined WHERE section = 'INCOME'),
    'total_expenses', (SELECT ROUND(SUM(amount)::NUMERIC, 2) FROM combined WHERE section = 'EXPENSES' AND line_code <> 'PL.E.8'),
    'profit_before_tax',
      (SELECT COALESCE(SUM(amount), 0) FROM combined WHERE section = 'INCOME')
      - (SELECT COALESCE(SUM(amount), 0) FROM combined WHERE section = 'EXPENSES' AND line_code <> 'PL.E.8'),
    'tax_expense',     (SELECT ROUND(COALESCE(SUM(amount), 0)::NUMERIC, 2) FROM combined WHERE line_code = 'PL.E.8'),
    'profit_after_tax',
      (SELECT COALESCE(SUM(amount), 0) FROM combined WHERE section = 'INCOME')
      - (SELECT COALESCE(SUM(amount), 0) FROM combined WHERE section = 'EXPENSES'),
    'minority_interest_share', (SELECT ROUND(SUM(nci)::NUMERIC, 2) FROM combined),
    'eliminations_total',      (SELECT ROUND(SUM(ABS(elimination))::NUMERIC, 2) FROM combined),
    'lines', (
      SELECT jsonb_agg(jsonb_build_object(
        'line_code',    line_code,
        'section',      section,
        'subsection',   subsection,
        'label',        display_label,
        'note_no',      note_no,
        'amount',       amount,
        'gross_sum',    gross_sum,
        'elimination',  elimination,
        'nci',          nci
      ) ORDER BY sort_order) FROM combined
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 3. CONVENIENCE: list groups for an owner with member summary
-- ============================================================================
CREATE OR REPLACE FUNCTION list_consolidation_groups(p_owner_user_id TEXT)
RETURNS TABLE (
  id UUID, name TEXT, parent_user_id TEXT, fiscal_year TEXT,
  is_active BOOLEAN, member_count BIGINT, created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  SELECT g.id, g.name, g.parent_user_id, g.fiscal_year, g.is_active,
         (SELECT COUNT(*) FROM consolidation_members m WHERE m.group_id = g.id) AS member_count,
         g.created_at
    FROM consolidation_groups g
   WHERE g.owner_user_id = p_owner_user_id
   ORDER BY g.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_consolidated_balance_sheet(TEXT, UUID, DATE)        TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_consolidated_pl(TEXT, UUID, DATE, DATE)             TO authenticated, anon;
GRANT EXECUTE ON FUNCTION list_consolidation_groups(TEXT)                         TO authenticated, anon;
