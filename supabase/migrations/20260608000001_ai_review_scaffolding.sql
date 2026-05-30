-- ============================================================================
-- PHASE 15 — AI FINANCIAL REVIEW SCAFFOLDING
-- ----------------------------------------------------------------------------
-- Architecture-only: no LLM calls yet. Provides:
--   • ai_review_runs    — one row per "AI Review" the user kicks off
--   • ai_findings       — anomalies / disclosure suggestions / ratio commentary
--   • detect_financial_anomalies(user, fy) — deterministic, rules-based detector
--     that populates ai_findings using Schedule III line balances + ratios.
--
-- Future LLM integration plugs in by:
--   1. Inserting a row in ai_review_runs with kind = 'llm'
--   2. POSTing the BS/P&L/ratios JSON to the LLM
--   3. Inserting llm-derived findings into ai_findings linked to that run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_review_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  fiscal_year     TEXT,
  scope           TEXT NOT NULL CHECK (scope IN (
                    'anomaly_detection','disclosure_suggestion','ratio_commentary',
                    'audit_prep','full_review'
                  )),
  kind            TEXT NOT NULL DEFAULT 'rules' CHECK (kind IN ('rules','llm','manual')),
  model_name      TEXT,                 -- e.g. 'claude-opus-4-7', 'rules-engine-v1'
  input_summary   JSONB,                -- snapshot of the BS/P&L/ratios that fed the run
  total_findings  INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','running','completed','failed')),
  error_message   TEXT,
  duration_ms     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_review_runs_user_fy ON ai_review_runs(user_id, fiscal_year, created_at DESC);

ALTER TABLE ai_review_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_review_runs_owner ON ai_review_runs;
CREATE POLICY ai_review_runs_owner ON ai_review_runs
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

CREATE TABLE IF NOT EXISTS ai_findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  run_id          UUID REFERENCES ai_review_runs(id) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN (
                    'anomaly','disclosure','ratio','compliance','audit'
                  )),
  severity        TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  rule_code       TEXT,                 -- e.g. 'NEG_CASH','HIGH_DER','UNCLASSIFIED_ACCT'
  title           TEXT NOT NULL,
  body            TEXT,
  related_line    TEXT,                 -- Schedule III line_code, optional
  related_account UUID,                 -- accounts.id, optional
  metric_value    NUMERIC,
  metric_unit     TEXT,                 -- 'x', '%', '₹', 'days'
  suggested_action TEXT,
  acknowledged    BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_findings_user_run ON ai_findings(user_id, run_id, severity);
CREATE INDEX IF NOT EXISTS idx_ai_findings_active   ON ai_findings(user_id, acknowledged) WHERE NOT acknowledged;

ALTER TABLE ai_findings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_findings_owner ON ai_findings;
CREATE POLICY ai_findings_owner ON ai_findings
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── Rules-based anomaly detector ───────────────────────────────────────────
-- Pulls live BS/P&L/ratio data and emits findings. Idempotent per (run_id).
CREATE OR REPLACE FUNCTION detect_financial_anomalies(
  p_user_id      TEXT,
  p_fiscal_year  TEXT
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_start DATE; v_end DATE;
  v_run_id UUID;
  v_ratios JSONB;
  v_bs     JSONB;
  v_integ  JSONB;
  v_started TIMESTAMPTZ := clock_timestamp();
  v_findings INT := 0;
  -- Pulled metrics
  v_cash NUMERIC; v_cl NUMERIC; v_der NUMERIC; v_current NUMERIC; v_quick NUMERIC;
  v_npm NUMERIC; v_roe NUMERIC; v_ccc NUMERIC; v_pat NUMERIC;
  v_recv_days NUMERIC; v_inv_days NUMERIC; v_int_cov NUMERIC;
  v_unmapped INT; v_tb_balanced BOOLEAN; v_bs_holds BOOLEAN;
BEGIN
  SELECT b.fy_start, b.fy_end INTO v_start, v_end FROM fy_bounds(p_fiscal_year) b;

  -- Create run
  INSERT INTO ai_review_runs(user_id, fiscal_year, scope, kind, model_name, status)
  VALUES (p_user_id, p_fiscal_year, 'anomaly_detection', 'rules', 'rules-engine-v1', 'running')
  RETURNING id INTO v_run_id;

  -- Snapshot inputs
  v_ratios := get_financial_ratios(p_user_id, v_start, v_end);
  v_bs     := get_schedule_iii_balance_sheet(p_user_id, v_end, NULL);
  v_integ  := validate_schedule_iii_integrity(p_user_id);

  UPDATE ai_review_runs SET input_summary = jsonb_build_object(
    'ratios', v_ratios, 'integrity', v_integ
  ) WHERE id = v_run_id;

  -- Extract metrics
  v_cash      := bs_line_balance_as_of(p_user_id, 'BS.CA.4', v_end);
  v_current   := (v_ratios -> 'liquidity' ->> 'current_ratio')::NUMERIC;
  v_quick     := (v_ratios -> 'liquidity' ->> 'quick_ratio')::NUMERIC;
  v_der       := (v_ratios -> 'leverage'  ->> 'debt_to_equity')::NUMERIC;
  v_int_cov   := (v_ratios -> 'leverage'  ->> 'interest_coverage')::NUMERIC;
  v_npm       := (v_ratios -> 'profitability' ->> 'net_profit_margin_pct')::NUMERIC;
  v_roe       := (v_ratios -> 'profitability' ->> 'return_on_equity_pct')::NUMERIC;
  v_pat       := (v_ratios -> 'profitability' ->> 'pat')::NUMERIC;
  v_recv_days := (v_ratios -> 'efficiency' ->> 'receivable_days')::NUMERIC;
  v_inv_days  := (v_ratios -> 'efficiency' ->> 'inventory_days')::NUMERIC;
  v_ccc       := (v_ratios -> 'efficiency' ->> 'cash_conversion_cycle')::NUMERIC;
  v_unmapped  := (v_integ ->> 'unclassified_accounts')::INT;
  v_tb_balanced := (v_integ ->> 'trial_balance_balanced')::BOOLEAN;
  v_bs_holds  := (v_integ ->> 'bs_equation_holds')::BOOLEAN;

  -- ── COMPLIANCE ───────────────────────────────────────────────────────────
  IF v_tb_balanced IS FALSE THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, suggested_action)
    VALUES (p_user_id, v_run_id, 'compliance', 'critical', 'TB_UNBALANCED',
            'Trial balance does not tie',
            'Total debits and credits across posted journals differ by ₹' || (v_integ ->> 'trial_balance_diff'),
            'Run the unbalanced-journal report and rectify before generating financial statements.');
    v_findings := v_findings + 1;
  END IF;

  IF v_bs_holds IS FALSE THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, suggested_action)
    VALUES (p_user_id, v_run_id, 'compliance', 'critical', 'BS_EQUATION_FAIL',
            'Assets ≠ Equity + Liabilities',
            'Balance-sheet equation diff ₹' || (v_integ ->> 'bs_equation_diff') ||
            '. This indicates one or more accounts are misclassified or journals are not posting properly.',
            'Re-run the Schedule III backfill and reclassify accounts missing a schedule_iii_line_code.');
    v_findings := v_findings + 1;
  END IF;

  IF v_unmapped > 0 THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, suggested_action)
    VALUES (p_user_id, v_run_id, 'compliance', 'high', 'UNCLASSIFIED_ACCTS',
            v_unmapped::TEXT || ' account(s) not classified under Schedule III',
            'These accounts will not appear in the BS/P&L until classified.',
            'Open Chart of Accounts → filter Unclassified → assign Schedule III line code.');
    v_findings := v_findings + 1;
  END IF;

  -- ── LIQUIDITY ────────────────────────────────────────────────────────────
  IF v_current IS NOT NULL AND v_current < 1 THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, metric_value, metric_unit, suggested_action)
    VALUES (p_user_id, v_run_id, 'ratio', 'high', 'LOW_CURRENT_RATIO',
            'Current ratio below 1.0 — short-term liquidity risk',
            'Current ratio of ' || ROUND(v_current::NUMERIC, 2) || ' means current liabilities exceed current assets.',
            v_current, 'x',
            'Review payment terms; consider working-capital line or staggered vendor payments.');
    v_findings := v_findings + 1;
  END IF;

  IF v_quick IS NOT NULL AND v_quick < 0.5 THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, metric_value, metric_unit)
    VALUES (p_user_id, v_run_id, 'ratio', 'medium', 'LOW_QUICK_RATIO',
            'Quick ratio below 0.5 — heavy reliance on inventory liquidation',
            'Quick ratio is ' || ROUND(v_quick::NUMERIC, 2) || '. Even excluding inventory, current assets are insufficient.',
            v_quick, 'x');
    v_findings := v_findings + 1;
  END IF;

  IF v_cash < 0 THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, related_line, metric_value, metric_unit)
    VALUES (p_user_id, v_run_id, 'anomaly', 'critical', 'NEG_CASH',
            'Cash & cash equivalents balance is negative',
            'Closing cash balance of ₹' || ROUND(v_cash::NUMERIC, 2) || ' indicates an overdraft posted to a cash account, or reconciliation errors.',
            'BS.CA.4', v_cash, '₹');
    v_findings := v_findings + 1;
  END IF;

  -- ── LEVERAGE ─────────────────────────────────────────────────────────────
  IF v_der IS NOT NULL AND v_der > 2 THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, metric_value, metric_unit, suggested_action)
    VALUES (p_user_id, v_run_id, 'ratio', 'medium', 'HIGH_DER',
            'Debt-to-Equity above 2.0 — high leverage',
            'D/E of ' || ROUND(v_der::NUMERIC, 2) || ' indicates the business is significantly debt-funded.',
            v_der, 'x',
            'Disclose covenant compliance status. Consider deleveraging plan in MD&A.');
    v_findings := v_findings + 1;
  END IF;

  IF v_int_cov IS NOT NULL AND v_int_cov < 1.5 THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, metric_value, metric_unit)
    VALUES (p_user_id, v_run_id, 'ratio', 'high', 'LOW_INT_COV',
            'Interest coverage below 1.5x',
            'EBITDA covers finance costs only ' || ROUND(v_int_cov::NUMERIC, 2) || ' times. Going-concern disclosure may be required.',
            v_int_cov, 'x');
    v_findings := v_findings + 1;
  END IF;

  -- ── EFFICIENCY ───────────────────────────────────────────────────────────
  IF v_recv_days IS NOT NULL AND v_recv_days > 90 THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, related_line, metric_value, metric_unit, suggested_action)
    VALUES (p_user_id, v_run_id, 'ratio', 'medium', 'HIGH_RECV_DAYS',
            'Receivable days > 90 — slow collections',
            'Average receivable days of ' || ROUND(v_recv_days::NUMERIC, 0) || ' is significantly above industry-norm 30-60 days.',
            'BS.CA.3', v_recv_days, 'days',
            'Run aging analysis; consider stricter credit terms or factoring.');
    v_findings := v_findings + 1;
  END IF;

  IF v_inv_days IS NOT NULL AND v_inv_days > 120 THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, related_line, metric_value, metric_unit)
    VALUES (p_user_id, v_run_id, 'ratio', 'medium', 'HIGH_INV_DAYS',
            'Inventory days > 120 — slow-moving stock',
            'Inventory days of ' || ROUND(v_inv_days::NUMERIC, 0) || ' suggests obsolescence risk.',
            'BS.CA.2', v_inv_days, 'days');
    v_findings := v_findings + 1;
  END IF;

  IF v_ccc IS NOT NULL AND v_ccc > 90 THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, metric_value, metric_unit)
    VALUES (p_user_id, v_run_id, 'ratio', 'low', 'HIGH_CCC',
            'Cash conversion cycle > 90 days',
            'Working-capital is tied up for ' || ROUND(v_ccc::NUMERIC, 0) || ' days on average.',
            v_ccc, 'days');
    v_findings := v_findings + 1;
  END IF;

  -- ── PROFITABILITY ────────────────────────────────────────────────────────
  IF v_pat IS NOT NULL AND v_pat < 0 THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, metric_value, metric_unit, suggested_action)
    VALUES (p_user_id, v_run_id, 'ratio', 'medium', 'NET_LOSS',
            'Net loss for the period',
            'Profit after tax of ₹' || ROUND(v_pat::NUMERIC, 2) || ' — disclose under Reserves & Surplus as accumulated deficit.',
            v_pat, '₹',
            'Add MD&A note explaining the loss and recovery plan.');
    v_findings := v_findings + 1;
  END IF;

  IF v_npm IS NOT NULL AND v_npm > 0 AND v_npm < 2 THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, metric_value, metric_unit)
    VALUES (p_user_id, v_run_id, 'ratio', 'low', 'THIN_MARGIN',
            'Net profit margin below 2%',
            'Net margin of ' || ROUND(v_npm::NUMERIC, 2) || '% leaves limited buffer for shocks.',
            v_npm, '%');
    v_findings := v_findings + 1;
  END IF;

  -- ── DISCLOSURE SUGGESTIONS (driven from data, not just thresholds) ──────
  IF EXISTS (
    SELECT 1 FROM v_ap_schedule_iii_aging
     WHERE user_id = p_user_id AND COALESCE(msme_overdue_45_plus, 0) > 0
  ) THEN
    INSERT INTO ai_findings(user_id, run_id, category, severity, rule_code, title, body, suggested_action)
    VALUES (p_user_id, v_run_id, 'disclosure', 'high', 'MSME_OVERDUE',
            'MSME payables overdue beyond 45 days — Section 22 MSMED Act disclosure required',
            'Interest at bank rate +3% may be payable under Section 16 of the MSMED Act.',
            'Review Note 9 (auto-generated) and add interest provision if applicable.');
    v_findings := v_findings + 1;
  END IF;

  -- Close run
  UPDATE ai_review_runs
     SET status = 'completed',
         total_findings = v_findings,
         completed_at = NOW(),
         duration_ms = EXTRACT(MILLISECOND FROM clock_timestamp() - v_started)::INT
   WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id',        v_run_id,
    'total_findings', v_findings,
    'fiscal_year',   p_fiscal_year,
    'completed_at',  NOW()
  );
END;
$$;

-- ── List findings for a run (or all unacknowledged) ────────────────────────
CREATE OR REPLACE FUNCTION list_ai_findings(
  p_user_id      TEXT,
  p_run_id       UUID DEFAULT NULL,
  p_only_unack   BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  id UUID, run_id UUID, category TEXT, severity TEXT, rule_code TEXT,
  title TEXT, body TEXT, related_line TEXT, related_account UUID,
  metric_value NUMERIC, metric_unit TEXT, suggested_action TEXT,
  acknowledged BOOLEAN, created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  SELECT id, run_id, category, severity, rule_code, title, body,
         related_line, related_account, metric_value, metric_unit, suggested_action,
         acknowledged, created_at
    FROM ai_findings
   WHERE user_id = p_user_id
     AND (p_run_id IS NULL OR run_id = p_run_id)
     AND (NOT p_only_unack OR acknowledged = FALSE)
   ORDER BY
     CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
     created_at DESC;
$$;

CREATE OR REPLACE FUNCTION acknowledge_ai_finding(p_user_id TEXT, p_finding_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ai_findings
     SET acknowledged = TRUE,
         acknowledged_by = p_user_id,
         acknowledged_at = NOW()
   WHERE id = p_finding_id AND user_id = p_user_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION detect_financial_anomalies(TEXT, TEXT)        TO authenticated, anon;
GRANT EXECUTE ON FUNCTION list_ai_findings(TEXT, UUID, BOOLEAN)         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION acknowledge_ai_finding(TEXT, UUID)            TO authenticated, anon;
