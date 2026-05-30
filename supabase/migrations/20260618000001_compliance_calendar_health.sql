-- ============================================================================
-- PHASE 25 — STATUTORY COMPLIANCE CALENDAR + FINANCIAL HEALTH SCORE
-- ----------------------------------------------------------------------------
-- Unifies all statutory due-dates the Indian compliance stack tracks:
--   • Monthly: GSTR-1 (11th), GSTR-3B (20th), PF (15th), ESI (15th)
--   • Quarterly: TDS Returns (24Q/26Q/27Q), Advance Tax (15-Jun, 15-Sep, 15-Dec, 15-Mar)
--   • Annual: ITR-6 (31-Oct audit / 31-Jul non-audit), AOC-4 (within 30 days of AGM),
--             MGT-7 (60 days post AGM), CSR-2 (with AOC-4)
--
-- And computes a single Financial Health Score aggregating signals from
-- every prior phase: TB integrity, Sch III classification, BS equation,
-- AI findings, TDS recon, CSR compliance, period lock.
-- ============================================================================

-- ── 1. Obligation master (catalog of all statutory filings) ────────────────
CREATE TABLE IF NOT EXISTS statutory_obligations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  obligation_type TEXT NOT NULL CHECK (obligation_type IN (
                    'gstr1','gstr3b','gstr9','gstr9c',
                    'tds_24q','tds_26q','tds_27q','form_16','form_16a',
                    'advance_tax','itr_6','tax_audit_report_3cd',
                    'pf','esi','professional_tax',
                    'aoc_4','aoc_4_xbrl','mgt_7','csr_2',
                    'caro_2020','dpt_3','adt_1','other'
                  )),
  obligation_label TEXT NOT NULL,                  -- 'GSTR-3B for May 2026', 'TDS 26Q Q1 FY2025-26'
  fiscal_year     TEXT NOT NULL,                   -- '2025-26'
  period          TEXT,                            -- 'Apr-2025' / 'Q1' / 'Annual' / 'monthly'
  due_date        DATE NOT NULL,
  applicable      BOOLEAN NOT NULL DEFAULT TRUE,
  late_fee_per_day NUMERIC(10,2) DEFAULT 0,        -- For penalty estimation
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, obligation_type, period, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_stat_obl_user_due ON statutory_obligations(user_id, due_date)
  WHERE applicable = TRUE;

ALTER TABLE statutory_obligations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stat_obl_owner ON statutory_obligations;
CREATE POLICY stat_obl_owner ON statutory_obligations
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 2. Filing records (actual filings against obligations) ────────────────
CREATE TABLE IF NOT EXISTS statutory_filings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  obligation_id   UUID NOT NULL REFERENCES statutory_obligations(id) ON DELETE CASCADE,
  filed_date      DATE NOT NULL,
  acknowledgment_number TEXT,
  amount_paid     NUMERIC(18,2) DEFAULT 0,         -- Tax/duty paid with the filing
  late_fee_paid   NUMERIC(18,2) DEFAULT 0,
  interest_paid   NUMERIC(18,2) DEFAULT 0,
  filing_url      TEXT,                            -- Link to acknowledgement PDF
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_stat_filings_obligation ON statutory_filings(obligation_id);
CREATE INDEX IF NOT EXISTS idx_stat_filings_user       ON statutory_filings(user_id, filed_date DESC);

ALTER TABLE statutory_filings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stat_filings_owner ON statutory_filings;
CREATE POLICY stat_filings_owner ON statutory_filings
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 3. SEED default statutory calendar for an FY ───────────────────────────
CREATE OR REPLACE FUNCTION seed_statutory_calendar(
  p_user_id     TEXT,
  p_fiscal_year TEXT
) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_fy_start INT;
  v_count    INT := 0;
  v_month    INT;
  v_calendar_year INT;
  v_label_month TEXT;
BEGIN
  v_fy_start := CASE WHEN p_fiscal_year ~ '^\d{4}-\d{2}$' THEN substring(p_fiscal_year from 1 for 4)::INT
                     ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT END;

  -- ── Monthly: GSTR-1 (11th of next month) + GSTR-3B (20th) + PF/ESI (15th) ──
  FOR v_month IN 1..12 LOOP
    -- Iterate Apr (month 4 = idx 1) through Mar (month 3 = idx 12)
    v_calendar_year := CASE WHEN v_month <= 9 THEN v_fy_start ELSE v_fy_start + 1 END;
    v_label_month   := to_char(make_date(v_calendar_year, ((v_month + 3 - 1) % 12) + 1, 1), 'Mon-YYYY');

    -- GSTR-1 due 11th of following month
    INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date, late_fee_per_day)
    VALUES (p_user_id, 'gstr1', 'GSTR-1 for ' || v_label_month, p_fiscal_year, v_label_month,
            (make_date(v_calendar_year, ((v_month + 3 - 1) % 12) + 1, 1) + INTERVAL '1 month' + INTERVAL '10 days')::DATE,
            50)
    ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;

    -- GSTR-3B due 20th of following month
    INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date, late_fee_per_day)
    VALUES (p_user_id, 'gstr3b', 'GSTR-3B for ' || v_label_month, p_fiscal_year, v_label_month,
            (make_date(v_calendar_year, ((v_month + 3 - 1) % 12) + 1, 1) + INTERVAL '1 month' + INTERVAL '19 days')::DATE,
            50)
    ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;

    -- PF + ESI due 15th of following month
    INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date)
    VALUES (p_user_id, 'pf', 'PF deposit for ' || v_label_month, p_fiscal_year, v_label_month,
            (make_date(v_calendar_year, ((v_month + 3 - 1) % 12) + 1, 1) + INTERVAL '1 month' + INTERVAL '14 days')::DATE)
    ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;

    INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date)
    VALUES (p_user_id, 'esi', 'ESI deposit for ' || v_label_month, p_fiscal_year, v_label_month,
            (make_date(v_calendar_year, ((v_month + 3 - 1) % 12) + 1, 1) + INTERVAL '1 month' + INTERVAL '14 days')::DATE)
    ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;
  END LOOP;

  -- ── Quarterly TDS returns ───────────────────────────────────────────────
  -- 24Q (salaries), 26Q (non-salaries), 27Q (non-residents)
  -- Q1 → 31-Jul, Q2 → 31-Oct, Q3 → 31-Jan, Q4 → 31-May (of following year)
  FOR v_month IN 1..4 LOOP
    DECLARE
      v_q_due DATE;
      v_q_label TEXT := 'Q' || v_month;
    BEGIN
      v_q_due := CASE v_month
        WHEN 1 THEN make_date(v_fy_start, 7, 31)
        WHEN 2 THEN make_date(v_fy_start, 10, 31)
        WHEN 3 THEN make_date(v_fy_start + 1, 1, 31)
        WHEN 4 THEN make_date(v_fy_start + 1, 5, 31)
      END;
      INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date, late_fee_per_day)
      VALUES (p_user_id, 'tds_24q', 'TDS 24Q ' || v_q_label || ' (salary TDS)', p_fiscal_year, v_q_label, v_q_due, 200)
      ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;
      INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date, late_fee_per_day)
      VALUES (p_user_id, 'tds_26q', 'TDS 26Q ' || v_q_label || ' (non-salary TDS)', p_fiscal_year, v_q_label, v_q_due, 200)
      ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;
      INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date, late_fee_per_day)
      VALUES (p_user_id, 'tds_27q', 'TDS 27Q ' || v_q_label || ' (non-resident TDS)', p_fiscal_year, v_q_label, v_q_due, 200)
      ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;
    END;
  END LOOP;

  -- ── Advance Tax (4 instalments: 15%, 45%, 75%, 100%) ────────────────────
  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date)
  VALUES (p_user_id, 'advance_tax', 'Advance Tax — 15% Instalment', p_fiscal_year, 'I-15pct', make_date(v_fy_start, 6, 15))
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;
  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date)
  VALUES (p_user_id, 'advance_tax', 'Advance Tax — 45% Instalment', p_fiscal_year, 'II-45pct', make_date(v_fy_start, 9, 15))
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;
  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date)
  VALUES (p_user_id, 'advance_tax', 'Advance Tax — 75% Instalment', p_fiscal_year, 'III-75pct', make_date(v_fy_start, 12, 15))
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;
  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date)
  VALUES (p_user_id, 'advance_tax', 'Advance Tax — 100% Instalment', p_fiscal_year, 'IV-100pct', make_date(v_fy_start + 1, 3, 15))
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;

  -- ── Annual filings ──────────────────────────────────────────────────────
  -- ITR-6 due 31-Oct (audit case) / 31-Jul (non-audit). Defaulting to audit case.
  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date)
  VALUES (p_user_id, 'itr_6', 'ITR-6 (Income Tax Return)', p_fiscal_year, 'Annual',
          make_date(v_fy_start + 1, 10, 31))
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;

  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date)
  VALUES (p_user_id, 'tax_audit_report_3cd', 'Tax Audit Report (Form 3CD)', p_fiscal_year, 'Annual',
          make_date(v_fy_start + 1, 9, 30))
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;

  -- AOC-4 within 30 days of AGM; assume AGM by 30-Sep so AOC-4 by 30-Oct
  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date, late_fee_per_day)
  VALUES (p_user_id, 'aoc_4', 'AOC-4 (Financial Statements with MCA)', p_fiscal_year, 'Annual',
          make_date(v_fy_start + 1, 10, 30), 100)
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;

  -- AOC-4 XBRL — same date for cos required to file in XBRL
  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date, late_fee_per_day)
  VALUES (p_user_id, 'aoc_4_xbrl', 'AOC-4 XBRL Filing', p_fiscal_year, 'Annual',
          make_date(v_fy_start + 1, 10, 30), 100)
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;

  -- MGT-7 within 60 days of AGM = 29-Nov
  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date, late_fee_per_day)
  VALUES (p_user_id, 'mgt_7', 'MGT-7 (Annual Return)', p_fiscal_year, 'Annual',
          make_date(v_fy_start + 1, 11, 29), 100)
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;

  -- CSR-2 (filed alongside AOC-4)
  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date)
  VALUES (p_user_id, 'csr_2', 'Form CSR-2 (CSR Annual Report)', p_fiscal_year, 'Annual',
          make_date(v_fy_start + 1, 12, 31))
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;

  -- GSTR-9 + GSTR-9C (annual GST return; due 31-Dec)
  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date, late_fee_per_day)
  VALUES (p_user_id, 'gstr9', 'GSTR-9 (Annual GST Return)', p_fiscal_year, 'Annual',
          make_date(v_fy_start + 1, 12, 31), 200)
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;
  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date, late_fee_per_day)
  VALUES (p_user_id, 'gstr9c', 'GSTR-9C (GST Reconciliation Statement)', p_fiscal_year, 'Annual',
          make_date(v_fy_start + 1, 12, 31), 200)
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;

  -- DPT-3 (deposit return) - due 30-Jun
  INSERT INTO statutory_obligations (user_id, obligation_type, obligation_label, fiscal_year, period, due_date)
  VALUES (p_user_id, 'dpt_3', 'DPT-3 (Return of Deposits)', p_fiscal_year, 'Annual',
          make_date(v_fy_start + 1, 6, 30))
  ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── 4. List with filing status ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_compliance_calendar(
  p_user_id     TEXT,
  p_fiscal_year TEXT
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH obs AS (
    SELECT
      o.*,
      (SELECT json_agg(jsonb_build_object(
          'id', f.id, 'filed_date', f.filed_date,
          'acknowledgment_number', f.acknowledgment_number,
          'amount_paid', f.amount_paid,
          'late_fee_paid', f.late_fee_paid,
          'filing_url', f.filing_url
       ) ORDER BY f.filed_date DESC)
        FROM statutory_filings f
       WHERE f.obligation_id = o.id) AS filings,
      EXISTS(SELECT 1 FROM statutory_filings f WHERE f.obligation_id = o.id) AS is_filed,
      (SELECT MIN(f.filed_date) FROM statutory_filings f WHERE f.obligation_id = o.id) AS first_filed_date,
      (CURRENT_DATE > o.due_date AND NOT EXISTS(SELECT 1 FROM statutory_filings f WHERE f.obligation_id = o.id)) AS is_overdue,
      (CURRENT_DATE - o.due_date) AS days_overdue,
      GREATEST(CURRENT_DATE - o.due_date, 0) * COALESCE(o.late_fee_per_day, 0) AS estimated_late_fee
    FROM statutory_obligations o
    WHERE o.user_id = p_user_id
      AND o.fiscal_year = p_fiscal_year
      AND o.applicable = TRUE
  )
  SELECT jsonb_build_object(
    'fiscal_year', p_fiscal_year,
    'total_obligations',  (SELECT COUNT(*) FROM obs),
    'filed_count',        (SELECT COUNT(*) FROM obs WHERE is_filed),
    'overdue_count',      (SELECT COUNT(*) FROM obs WHERE is_overdue),
    'upcoming_30d_count', (SELECT COUNT(*) FROM obs WHERE NOT is_filed AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'),
    'total_estimated_late_fee', (SELECT ROUND(COALESCE(SUM(estimated_late_fee),0)::NUMERIC, 2) FROM obs WHERE is_overdue),
    'obligations', (
      SELECT jsonb_agg(jsonb_build_object(
        'id',                obs.id,
        'obligation_type',   obligation_type,
        'obligation_label',  obligation_label,
        'period',            period,
        'due_date',          due_date,
        'days_to_due',       (due_date - CURRENT_DATE),
        'is_filed',          is_filed,
        'is_overdue',        is_overdue,
        'days_overdue',      days_overdue,
        'estimated_late_fee',ROUND(estimated_late_fee::NUMERIC, 2),
        'first_filed_date',  first_filed_date,
        'filings',           filings,
        'late_fee_per_day',  late_fee_per_day
      ) ORDER BY due_date)
      FROM obs
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ── 5. FINANCIAL HEALTH SCORE ──────────────────────────────────────────────
-- Aggregates signals from across the platform into a 0-100 score.
-- Sub-scores roll up:
--   • Ledger Integrity (TB balanced, BS equation, classified accounts)
--   • Compliance (overdue obligations, filed obligations)
--   • Risk (AI critical/high findings, TDS unmatched, MSME §22 overdue)
--   • Reporting Readiness (period lock, FY close, notes generated)
CREATE OR REPLACE FUNCTION get_financial_health_score(
  p_user_id     TEXT,
  p_fiscal_year TEXT
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_start DATE; v_end DATE;
  -- Integrity
  v_integ JSONB;
  v_tb_balanced BOOLEAN; v_bs_holds BOOLEAN; v_unmapped INT;
  v_integrity_score INT := 100;
  -- Compliance
  v_calendar JSONB;
  v_total INT; v_filed INT; v_overdue INT;
  v_compliance_score INT := 100;
  -- Risk
  v_critical_findings INT;
  v_high_findings INT;
  v_msme_overdue NUMERIC;
  v_tds_book_only NUMERIC;
  v_risk_score INT := 100;
  -- Reporting Readiness
  v_has_period_lock BOOLEAN;
  v_has_fy_close   BOOLEAN;
  v_has_notes       BOOLEAN;
  v_reporting_score INT := 100;
  -- Final
  v_total_score INT;
BEGIN
  SELECT b.fy_start, b.fy_end INTO v_start, v_end FROM fy_bounds(p_fiscal_year) b;

  ----- LEDGER INTEGRITY -----
  v_integ := validate_schedule_iii_integrity(p_user_id);
  v_tb_balanced := COALESCE((v_integ ->> 'trial_balance_balanced')::BOOLEAN, FALSE);
  v_bs_holds    := COALESCE((v_integ ->> 'bs_equation_holds')::BOOLEAN, FALSE);
  v_unmapped    := COALESCE((v_integ ->> 'unclassified_accounts')::INT, 0);

  IF NOT v_tb_balanced THEN v_integrity_score := v_integrity_score - 40; END IF;
  IF NOT v_bs_holds    THEN v_integrity_score := v_integrity_score - 40; END IF;
  v_integrity_score := GREATEST(v_integrity_score - LEAST(v_unmapped * 5, 20), 0);

  ----- COMPLIANCE -----
  v_calendar := get_compliance_calendar(p_user_id, p_fiscal_year);
  v_total   := COALESCE((v_calendar ->> 'total_obligations')::INT, 0);
  v_filed   := COALESCE((v_calendar ->> 'filed_count')::INT, 0);
  v_overdue := COALESCE((v_calendar ->> 'overdue_count')::INT, 0);

  IF v_total > 0 THEN
    v_compliance_score := ROUND(100.0 * (v_total - v_overdue) / v_total);
  END IF;

  ----- RISK SIGNALS -----
  SELECT COUNT(*) FILTER (WHERE severity = 'critical' AND NOT acknowledged),
         COUNT(*) FILTER (WHERE severity = 'high'     AND NOT acknowledged)
    INTO v_critical_findings, v_high_findings
    FROM ai_findings
   WHERE user_id = p_user_id;

  SELECT COALESCE(msme_overdue_45_plus, 0) INTO v_msme_overdue
    FROM v_ap_schedule_iii_aging
   WHERE user_id = p_user_id;

  -- TDS book-only is risk (deductors didn't file)
  SELECT COALESCE(book_only_total, 0) INTO v_tds_book_only
    FROM (
      SELECT (reconcile_tds_with_26as(p_user_id, p_fiscal_year) ->> 'book_only_total')::NUMERIC AS book_only_total
    ) t;

  v_risk_score := v_risk_score - LEAST(v_critical_findings * 20, 60);
  v_risk_score := v_risk_score - LEAST(v_high_findings * 5,  20);
  IF v_msme_overdue > 0 THEN v_risk_score := v_risk_score - 10; END IF;
  IF v_tds_book_only > 0 THEN v_risk_score := v_risk_score - 5; END IF;
  v_risk_score := GREATEST(v_risk_score, 0);

  ----- REPORTING READINESS -----
  v_has_period_lock := EXISTS(
    SELECT 1 FROM accounting_periods
     WHERE user_id = p_user_id AND status = 'locked' AND period_end >= v_start
  );
  v_has_fy_close := EXISTS(
    SELECT 1 FROM journals
     WHERE user_id = p_user_id AND source_type = 'fy_close'
       AND journal_date BETWEEN v_start AND v_end AND status = 'posted'
  );
  v_has_notes := EXISTS(
    SELECT 1 FROM accounting_notes
     WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
  );

  v_reporting_score := 0;
  IF v_has_notes      THEN v_reporting_score := v_reporting_score + 40; END IF;
  IF v_has_period_lock OR v_has_fy_close THEN v_reporting_score := v_reporting_score + 40; END IF;
  IF v_filed > 0     THEN v_reporting_score := v_reporting_score + 20; END IF;
  v_reporting_score := LEAST(v_reporting_score, 100);

  -- Weighted final score: Integrity 30%, Compliance 30%, Risk 25%, Reporting 15%
  v_total_score := ROUND(
    v_integrity_score * 0.30
    + v_compliance_score * 0.30
    + v_risk_score       * 0.25
    + v_reporting_score  * 0.15
  );

  RETURN jsonb_build_object(
    'fiscal_year',   p_fiscal_year,
    'score',         v_total_score,
    'grade',
      CASE
        WHEN v_total_score >= 90 THEN 'A+'
        WHEN v_total_score >= 80 THEN 'A'
        WHEN v_total_score >= 70 THEN 'B'
        WHEN v_total_score >= 60 THEN 'C'
        WHEN v_total_score >= 50 THEN 'D'
        ELSE 'F'
      END,
    'components', jsonb_build_object(
      'integrity', jsonb_build_object(
        'score', v_integrity_score, 'weight', 30,
        'trial_balance_balanced', v_tb_balanced,
        'bs_equation_holds',      v_bs_holds,
        'unclassified_accounts',  v_unmapped
      ),
      'compliance', jsonb_build_object(
        'score', v_compliance_score, 'weight', 30,
        'total_obligations',  v_total,
        'filed_obligations',  v_filed,
        'overdue_obligations', v_overdue
      ),
      'risk', jsonb_build_object(
        'score', v_risk_score, 'weight', 25,
        'critical_findings_open', v_critical_findings,
        'high_findings_open',     v_high_findings,
        'msme_overdue_45_plus',   ROUND(COALESCE(v_msme_overdue,0)::NUMERIC, 2),
        'tds_book_only_total',    ROUND(COALESCE(v_tds_book_only,0)::NUMERIC, 2)
      ),
      'reporting', jsonb_build_object(
        'score', v_reporting_score, 'weight', 15,
        'has_period_lock',        v_has_period_lock,
        'has_fy_close',           v_has_fy_close,
        'has_notes_to_accounts',  v_has_notes
      )
    ),
    'computed_at',   NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION seed_statutory_calendar(TEXT, TEXT)            TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_compliance_calendar(TEXT, TEXT)            TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_financial_health_score(TEXT, TEXT)         TO authenticated, anon;
