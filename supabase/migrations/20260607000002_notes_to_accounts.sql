-- ============================================================================
-- PHASE 12 — NOTES TO ACCOUNTS AUTOMATION (Schedule III)
-- ----------------------------------------------------------------------------
-- Auto-generated, editable notes that accompany the BS / P&L. Covers:
--   • Significant Accounting Policies (Note 1)
--   • Schedule-III line note bodies (Notes 2–30)
--   • Contingent liabilities, MSME, related parties, GST, depreciation methods
-- ----------------------------------------------------------------------------
-- Architecture:
--   1. accounting_notes — one row per (user, fy, note_no). Stores both
--      auto-generated body and any CA-edited override.
--   2. generate_default_notes(user, fy) — populates / refreshes auto bodies
--      from live data (fixed_asset_categories, msme aging, accounting_notes).
--   3. RPC get_notes_to_accounts(user, fy) — returns the full notes list.
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounting_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  fiscal_year     TEXT NOT NULL,            -- e.g. '2025-26'
  note_no         TEXT NOT NULL,            -- e.g. '1', '12', '12.1'
  title           TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN (
                    'accounting_policy','schedule_iii_line','contingent_liability',
                    'related_party','msme','gst','depreciation','event_post_bs','other'
                  )),
  auto_body       TEXT,                     -- system-generated narrative
  override_body   TEXT,                     -- accountant/CA edit (wins if non-null)
  body_format     TEXT NOT NULL DEFAULT 'markdown' CHECK (body_format IN ('markdown','html','plain')),
  display_order   INT NOT NULL DEFAULT 0,
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fiscal_year, note_no)
);

CREATE INDEX IF NOT EXISTS idx_acct_notes_user_fy
  ON accounting_notes(user_id, fiscal_year, display_order);

ALTER TABLE accounting_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounting_notes_owner ON accounting_notes;
CREATE POLICY accounting_notes_owner ON accounting_notes
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

CREATE OR REPLACE FUNCTION touch_accounting_notes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_acct_notes_updated_at ON accounting_notes;
CREATE TRIGGER trg_acct_notes_updated_at
  BEFORE UPDATE ON accounting_notes
  FOR EACH ROW EXECUTE FUNCTION touch_accounting_notes_updated_at();

-- ── Helper: FY date bounds from "2025-26" string ───────────────────────────
CREATE OR REPLACE FUNCTION fy_bounds(p_fy TEXT)
RETURNS TABLE(fy_start DATE, fy_end DATE) LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_start INT;
BEGIN
  v_start := CASE
    WHEN p_fy ~ '^\d{4}-\d{2}$' THEN substring(p_fy from 1 for 4)::INT
    WHEN p_fy ~ '^\d{4}$'       THEN p_fy::INT
    ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT
  END;
  fy_start := make_date(v_start, 4, 1);
  fy_end   := make_date(v_start + 1, 3, 31);
  RETURN NEXT;
END;
$$;

-- ── Generator: populate / refresh auto-bodies for a user + FY ──────────────
CREATE OR REPLACE FUNCTION generate_default_notes(p_user_id TEXT, p_fy TEXT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_start DATE; v_end DATE;
  v_count INT := 0;
  v_msme_total NUMERIC; v_msme_overdue NUMERIC;
  v_dep_methods TEXT;
  v_related TEXT;
BEGIN
  SELECT b.fy_start, b.fy_end INTO v_start, v_end FROM fy_bounds(p_fy) b;

  -- Note 1 — Significant Accounting Policies (boilerplate Indian GAAP / AS)
  INSERT INTO accounting_notes (user_id, fiscal_year, note_no, title, category, auto_body, display_order)
  VALUES (
    p_user_id, p_fy, '1', 'Significant Accounting Policies', 'accounting_policy',
    E'### 1.1 Basis of Preparation\n'
    'The financial statements have been prepared in accordance with the Generally Accepted Accounting Principles in India (Indian GAAP), under the historical cost convention on an accrual basis, in compliance with the applicable Accounting Standards specified under Section 133 of the Companies Act, 2013, and the relevant provisions of the Companies Act, 2013.\n\n'
    '### 1.2 Use of Estimates\n'
    'The preparation of financial statements requires the management to make estimates and assumptions that affect the reported amounts of assets and liabilities and the reported income and expenses during the year. The management believes that the estimates used are prudent and reasonable.\n\n'
    '### 1.3 Revenue Recognition\n'
    'Revenue from the sale of goods is recognised when the significant risks and rewards of ownership pass to the buyer. Revenue from services is recognised on rendering of services. GST collected from customers is excluded from revenue.\n\n'
    '### 1.4 Property, Plant & Equipment\n'
    'Fixed assets are stated at cost less accumulated depreciation. Cost includes all expenditure necessary to bring the asset to its working condition for its intended use.\n\n'
    '### 1.5 Depreciation\n'
    'Depreciation on tangible assets is provided on the Straight-Line (SLM) and Written-Down-Value (WDV) methods over the useful lives prescribed in Schedule II of the Companies Act, 2013, as applicable per category.\n\n'
    '### 1.6 Inventories\n'
    'Inventories are valued at the lower of cost (FIFO basis) and net realisable value.\n\n'
    '### 1.7 Taxes on Income\n'
    'Current tax is determined as per the provisions of the Income-tax Act, 1961. Deferred tax assets and liabilities are recognised for timing differences using the tax rates and tax laws enacted or substantively enacted as on the Balance Sheet date.\n\n'
    '### 1.8 Provisions, Contingent Liabilities and Contingent Assets\n'
    'A provision is recognised when there is a present obligation as a result of a past event for which a reliable estimate can be made. Contingent liabilities are disclosed by way of notes.\n\n'
    '### 1.9 Cash and Cash Equivalents\n'
    'Cash and cash equivalents comprise cash on hand, demand deposits, and short-term highly liquid investments with maturities of three months or less.',
    1
  )
  ON CONFLICT (user_id, fiscal_year, note_no) DO UPDATE
    SET auto_body = EXCLUDED.auto_body, updated_at = NOW();
  v_count := v_count + 1;

  -- Note 12 — Tangible / Intangible Assets (depreciation methods used)
  SELECT string_agg(DISTINCT
    format('%s (%s, %s years)', fac.name,
           CASE fac.default_depreciation_method WHEN 'SLM' THEN 'Straight-Line' WHEN 'WDV' THEN 'Written-Down-Value' ELSE fac.default_depreciation_method END,
           fac.default_useful_life_years::TEXT), '; ')
    INTO v_dep_methods
    FROM fixed_asset_categories fac
   WHERE fac.user_id = p_user_id;

  IF v_dep_methods IS NULL THEN v_dep_methods := 'No asset categories configured.'; END IF;

  INSERT INTO accounting_notes (user_id, fiscal_year, note_no, title, category, auto_body, display_order)
  VALUES (
    p_user_id, p_fy, '12', 'Fixed Assets — Tangible & Intangible', 'depreciation',
    E'**Depreciation methodology by category:** ' || v_dep_methods || E'\n\n'
    'Useful lives and methods are in accordance with Schedule II of the Companies Act, 2013. Capitalised costs include purchase price plus direct attributable expenditures (freight, installation, professional fees) net of recoverable taxes (eligible GST input).\n\n'
    'See the Fixed Asset Movement Schedule for opening gross block, additions, disposals, accumulated depreciation, and closing net block.',
    12
  )
  ON CONFLICT (user_id, fiscal_year, note_no) DO UPDATE
    SET auto_body = EXCLUDED.auto_body, updated_at = NOW();
  v_count := v_count + 1;

  -- Note 9 — Trade Payables incl. MSME disclosure (Section 22 MSMED Act)
  SELECT
    COALESCE(msme_total_outstanding, 0),
    COALESCE(msme_overdue_45_plus, 0)
    INTO v_msme_total, v_msme_overdue
    FROM v_ap_schedule_iii_aging
   WHERE user_id = p_user_id;

  INSERT INTO accounting_notes (user_id, fiscal_year, note_no, title, category, auto_body, display_order)
  VALUES (
    p_user_id, p_fy, '9', 'Trade Payables — incl. MSME Disclosure', 'msme',
    E'**Total dues to Micro, Small & Medium Enterprises (Section 22, MSMED Act 2006):** ₹ '
    || to_char(COALESCE(v_msme_total, 0), 'FM99,99,99,999')
    || E'\n\n'
    '**Of which outstanding beyond 45 days (interest payable u/s 16):** ₹ '
    || to_char(COALESCE(v_msme_overdue, 0), 'FM99,99,99,999')
    || E'\n\n'
    'The above information has been determined to the extent such parties have been identified on the basis of information available with the Company. No interest has been paid or accrued during the year in respect of such delays except as disclosed.',
    9
  )
  ON CONFLICT (user_id, fiscal_year, note_no) DO UPDATE
    SET auto_body = EXCLUDED.auto_body, updated_at = NOW();
  v_count := v_count + 1;

  -- Note: Related-party disclosures (placeholder — counts accounts flagged is_related_party)
  SELECT string_agg(DISTINCT account_name, '; ')
    INTO v_related
    FROM accounts
   WHERE user_id = p_user_id AND COALESCE(is_related_party_account, FALSE) = TRUE;

  INSERT INTO accounting_notes (user_id, fiscal_year, note_no, title, category, auto_body, display_order)
  VALUES (
    p_user_id, p_fy, '32', 'Related Party Disclosures', 'related_party',
    CASE
      WHEN v_related IS NULL OR v_related = ''
        THEN E'No related-party transactions have been identified in the current period.\n\nWhere related parties exist, transactions are disclosed in accordance with Accounting Standard 18 — Related Party Disclosures.'
      ELSE E'**Related parties identified:** ' || v_related ||
           E'\n\nTransactions with related parties are disclosed in accordance with Accounting Standard 18.'
    END,
    32
  )
  ON CONFLICT (user_id, fiscal_year, note_no) DO UPDATE
    SET auto_body = EXCLUDED.auto_body, updated_at = NOW();
  v_count := v_count + 1;

  -- Note — Contingent Liabilities (placeholder until a contingent_liabilities table is added)
  INSERT INTO accounting_notes (user_id, fiscal_year, note_no, title, category, auto_body, display_order)
  VALUES (
    p_user_id, p_fy, '33', 'Contingent Liabilities & Commitments', 'contingent_liability',
    E'There are no contingent liabilities or capital commitments outstanding as on the Balance Sheet date that require disclosure under Schedule III, except as separately disclosed (if any) by management.',
    33
  )
  ON CONFLICT (user_id, fiscal_year, note_no) DO UPDATE
    SET auto_body = COALESCE(accounting_notes.auto_body, EXCLUDED.auto_body), updated_at = NOW();
  v_count := v_count + 1;

  -- Note — GST disclosure
  INSERT INTO accounting_notes (user_id, fiscal_year, note_no, title, category, auto_body, display_order)
  VALUES (
    p_user_id, p_fy, '34', 'Goods & Services Tax (GST) Disclosure', 'gst',
    E'GST collected from customers is excluded from revenue and shown as a current liability until remitted to the appropriate tax authority. Input Tax Credit (ITC) on eligible purchases is recognised as a current asset and offset against output GST liability on filing of monthly returns (GSTR-1, GSTR-3B). RCM liabilities are recognised at the time of receipt of goods/services and discharged in cash, with corresponding ITC availed in the same period.',
    34
  )
  ON CONFLICT (user_id, fiscal_year, note_no) DO UPDATE
    SET auto_body = EXCLUDED.auto_body, updated_at = NOW();
  v_count := v_count + 1;

  -- Auto-generate one note per Schedule III BS line that has actual movement
  INSERT INTO accounting_notes (user_id, fiscal_year, note_no, title, category, auto_body, display_order)
  SELECT
    p_user_id, p_fy, l.note_no,
    l.display_label,
    'schedule_iii_line',
    E'Refer to the Balance Sheet for the closing balance on this line. Sub-ledger detail (account-wise composition) is available via drilldown from the Schedule III statements.',
    100 + l.sort_order
  FROM schedule_iii_lines l
  WHERE l.statement_type = 'BS'
    AND l.note_no IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM accounting_notes an
       WHERE an.user_id = p_user_id AND an.fiscal_year = p_fy AND an.note_no = l.note_no
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── Read RPC for the UI ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_notes_to_accounts(
  p_user_id TEXT,
  p_fy      TEXT
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'fiscal_year', p_fy,
    'notes',
    COALESCE(jsonb_agg(jsonb_build_object(
      'id',             id,
      'note_no',        note_no,
      'title',          title,
      'category',       category,
      'body',           COALESCE(NULLIF(override_body, ''), auto_body),
      'body_format',    body_format,
      'is_overridden',  (override_body IS NOT NULL AND override_body <> ''),
      'reviewed_by',    reviewed_by,
      'reviewed_at',    reviewed_at,
      'updated_at',     updated_at
    ) ORDER BY display_order, note_no), '[]'::jsonb)
  ) INTO v_result
  FROM accounting_notes
  WHERE user_id = p_user_id AND fiscal_year = p_fy AND is_active = TRUE;

  RETURN COALESCE(v_result, jsonb_build_object('fiscal_year', p_fy, 'notes', '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION generate_default_notes(TEXT, TEXT)         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_notes_to_accounts(TEXT, TEXT)          TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fy_bounds(TEXT)                            TO authenticated, anon;
