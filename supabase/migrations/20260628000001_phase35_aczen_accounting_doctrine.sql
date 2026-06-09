-- ============================================================================
-- PHASE 35 - ACZEN ACCOUNTING DOCTRINE ENFORCEMENT
-- ----------------------------------------------------------------------------
-- Codifies the operating rule for Aczen:
--
--   Transaction -> Journal Entry -> General Ledger -> Sub-Ledger -> Reports
--
-- Reports, dashboards, AR/AP, GST, inventory, assets, TDS and TCS must reconcile
-- back to posted journal_lines. Source documents can carry operational metadata,
-- but accounting truth is the posted journal.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Party accounting defaults required by customer/vendor master logic
-- ---------------------------------------------------------------------------

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS default_revenue_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_receivable_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS default_expense_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_payable_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_default_accounts
  ON clients(user_id, default_revenue_account_id, default_receivable_account_id);
CREATE INDEX IF NOT EXISTS idx_vendors_default_accounts
  ON vendors(user_id, default_expense_account_id, default_payable_account_id);

CREATE OR REPLACE FUNCTION assert_account_default(
  p_user_id TEXT,
  p_account_id UUID,
  p_allowed_types TEXT[],
  p_label TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_account accounts%ROWTYPE;
BEGIN
  IF p_account_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_account FROM accounts WHERE id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '% references a missing account.', p_label USING ERRCODE = '23503';
  END IF;

  IF v_account.user_id <> p_user_id THEN
    RAISE EXCEPTION '% account belongs to another company.', p_label USING ERRCODE = '23514';
  END IF;

  IF NOT (v_account.account_type = ANY(p_allowed_types)) THEN
    RAISE EXCEPTION '% must be one of account types %, got %.',
      p_label, array_to_string(p_allowed_types, ', '), v_account.account_type USING ERRCODE = '23514';
  END IF;

  IF COALESCE(v_account.is_group, FALSE) THEN
    RAISE EXCEPTION '% must be a posting ledger, not a group/control account.', p_label USING ERRCODE = '23514';
  END IF;

  IF COALESCE(v_account.is_active, TRUE) = FALSE THEN
    RAISE EXCEPTION '% points to an inactive account.', p_label USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_client_accounting_defaults()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_account_default(NEW.user_id, NEW.default_revenue_account_id, ARRAY['Income'], 'Customer default revenue');
  PERFORM assert_account_default(NEW.user_id, NEW.default_receivable_account_id, ARRAY['Asset'], 'Customer default receivable');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_accounting_defaults ON clients;
CREATE TRIGGER trg_clients_accounting_defaults
  BEFORE INSERT OR UPDATE OF default_revenue_account_id, default_receivable_account_id, user_id
  ON clients
  FOR EACH ROW EXECUTE FUNCTION validate_client_accounting_defaults();

CREATE OR REPLACE FUNCTION validate_vendor_accounting_defaults()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_account_default(NEW.user_id, NEW.default_expense_account_id, ARRAY['Expense','Asset'], 'Vendor default expense/inventory');
  PERFORM assert_account_default(NEW.user_id, NEW.default_payable_account_id, ARRAY['Liability'], 'Vendor default payable');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendors_accounting_defaults ON vendors;
CREATE TRIGGER trg_vendors_accounting_defaults
  BEFORE INSERT OR UPDATE OF default_expense_account_id, default_payable_account_id, user_id
  ON vendors
  FOR EACH ROW EXECUTE FUNCTION validate_vendor_accounting_defaults();

CREATE OR REPLACE FUNCTION ensure_party_accounting_defaults(p_user_id TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_client RECORD;
  v_vendor RECORD;
  v_revenue_account UUID;
  v_expense_account UUID;
  v_clients_updated INT := 0;
  v_vendors_updated INT := 0;
BEGIN
  PERFORM ensure_erp_grade_coa(p_user_id);

  FOR v_client IN SELECT id FROM clients WHERE user_id = p_user_id LOOP
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ensure_client_subledger') THEN
      PERFORM ensure_client_subledger(v_client.id);
    END IF;
  END LOOP;

  FOR v_vendor IN SELECT id FROM vendors WHERE user_id = p_user_id LOOP
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ensure_vendor_subledger') THEN
      PERFORM ensure_vendor_subledger(v_vendor.id);
    END IF;
  END LOOP;

  SELECT id INTO v_revenue_account
  FROM accounts
  WHERE user_id = p_user_id
    AND account_type = 'Income'
    AND COALESCE(is_group, FALSE) = FALSE
    AND account_name IN ('Service Revenue', 'Sales Revenue')
  ORDER BY CASE account_name WHEN 'Service Revenue' THEN 1 ELSE 2 END, account_code
  LIMIT 1;

  SELECT id INTO v_expense_account
  FROM accounts
  WHERE user_id = p_user_id
    AND account_type = 'Expense'
    AND COALESCE(is_group, FALSE) = FALSE
  ORDER BY CASE account_name WHEN 'Professional Fees' THEN 1 WHEN 'Purchases' THEN 2 ELSE 9 END, account_code
  LIMIT 1;

  UPDATE clients
     SET default_revenue_account_id = COALESCE(default_revenue_account_id, v_revenue_account),
         default_receivable_account_id = COALESCE(default_receivable_account_id, subledger_account_id)
   WHERE user_id = p_user_id
     AND (default_revenue_account_id IS NULL OR default_receivable_account_id IS NULL);
  GET DIAGNOSTICS v_clients_updated = ROW_COUNT;

  UPDATE vendors
     SET default_expense_account_id = COALESCE(default_expense_account_id, v_expense_account),
         default_payable_account_id = COALESCE(default_payable_account_id, subledger_account_id)
   WHERE user_id = p_user_id
     AND (default_expense_account_id IS NULL OR default_payable_account_id IS NULL);
  GET DIAGNOSTICS v_vendors_updated = ROW_COUNT;

  PERFORM sync_party_subledger_register(p_user_id);

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'clients_updated', v_clients_updated,
    'vendors_updated', v_vendors_updated,
    'revenue_account_id', v_revenue_account,
    'expense_account_id', v_expense_account,
    'computed_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_party_accounting_defaults(TEXT) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. Ledger-derived balances. No closing balances are stored.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_aczen_gl_balances AS
SELECT
  a.user_id,
  a.id AS account_id,
  a.account_code,
  a.account_name,
  a.account_type,
  a.account_group,
  a.account_subgroup,
  a.schedule_iii_section,
  a.schedule_iii_subsection,
  a.schedule_iii_line_code,
  a.current_non_current,
  COALESCE(a.opening_balance, 0) AS opening_balance,
  COALESCE(SUM(jl.debit) FILTER (WHERE j.status = 'posted' AND COALESCE(j.is_reversed, FALSE) = FALSE), 0) AS debit,
  COALESCE(SUM(jl.credit) FILTER (WHERE j.status = 'posted' AND COALESCE(j.is_reversed, FALSE) = FALSE), 0) AS credit,
  CASE
    WHEN a.account_type IN ('Asset','Expense')
      THEN COALESCE(a.opening_balance, 0)
           + COALESCE(SUM(jl.debit) FILTER (WHERE j.status = 'posted' AND COALESCE(j.is_reversed, FALSE) = FALSE), 0)
           - COALESCE(SUM(jl.credit) FILTER (WHERE j.status = 'posted' AND COALESCE(j.is_reversed, FALSE) = FALSE), 0)
    ELSE COALESCE(a.opening_balance, 0)
           + COALESCE(SUM(jl.credit) FILTER (WHERE j.status = 'posted' AND COALESCE(j.is_reversed, FALSE) = FALSE), 0)
           - COALESCE(SUM(jl.debit) FILTER (WHERE j.status = 'posted' AND COALESCE(j.is_reversed, FALSE) = FALSE), 0)
  END AS closing_balance
FROM accounts a
LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
LEFT JOIN journals j ON j.id = jl.journal_id AND j.user_id = a.user_id
GROUP BY a.user_id, a.id, a.account_code, a.account_name, a.account_type,
         a.account_group, a.account_subgroup, a.schedule_iii_section,
         a.schedule_iii_subsection, a.schedule_iii_line_code,
         a.current_non_current, a.opening_balance;

CREATE OR REPLACE VIEW v_aczen_customer_subledger_balances AS
SELECT
  c.user_id,
  c.id AS customer_id,
  COALESCE(NULLIF(c.trade_name, ''), NULLIF(c.legal_name, ''), NULLIF(c.company_name, ''), NULLIF(c.display_name, ''), c.name) AS customer_name,
  c.gstin,
  c.pan,
  c.billing_address_id,
  c.default_shipping_address_id AS shipping_address_id,
  c.default_revenue_account_id,
  c.default_receivable_account_id,
  COALESCE(g.closing_balance, 0) AS balance
FROM clients c
LEFT JOIN v_aczen_gl_balances g ON g.account_id = COALESCE(c.default_receivable_account_id, c.subledger_account_id);

CREATE OR REPLACE VIEW v_aczen_vendor_subledger_balances AS
SELECT
  v.user_id,
  v.id AS vendor_id,
  COALESCE(NULLIF(v.trade_name, ''), NULLIF(v.legal_name, ''), NULLIF(v.company_name, ''), v.name) AS vendor_name,
  COALESCE(v.gstin, v.gst_number) AS gstin,
  v.pan,
  v.tds_default_section,
  v.billing_address_id,
  v.default_shipping_address_id AS shipping_address_id,
  v.default_expense_account_id,
  v.default_payable_account_id,
  COALESCE(g.closing_balance, 0) AS balance
FROM vendors v
LEFT JOIN v_aczen_gl_balances g ON g.account_id = COALESCE(v.default_payable_account_id, v.subledger_account_id);

-- ---------------------------------------------------------------------------
-- 3. Doctrine validation RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_aczen_accounting_doctrine(
  p_user_id TEXT,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_from DATE;
  v_to DATE := COALESCE(p_to_date, CURRENT_DATE);
  v_checks JSONB := '[]'::jsonb;
  v_failures INT := 0;
  v_count INT := 0;
  v_amount NUMERIC := 0;
  v_subledger JSONB;
  v_health JSONB;
BEGIN
  PERFORM ensure_party_accounting_defaults(p_user_id);

  v_from := COALESCE(
    p_from_date,
    (SELECT COALESCE(financial_year_start, make_date(EXTRACT(YEAR FROM v_to)::int, 4, 1))
       FROM ensure_accounting_settings(p_user_id))
  );

  SELECT COUNT(*) INTO v_count
  FROM journals j
  WHERE j.user_id = p_user_id
    AND j.status = 'posted'
    AND j.journal_date BETWEEN v_from AND v_to
    AND ABS(COALESCE(j.total_debit, 0) - COALESCE(j.total_credit, 0)) > 0.01;
  v_failures := v_failures + CASE WHEN v_count > 0 THEN 1 ELSE 0 END;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'rule', 'journals_debit_equals_credit',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
    'count', v_count
  ));

  SELECT COUNT(*) INTO v_count
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journals j ON j.id = jl.journal_id
  WHERE j.user_id = p_user_id
    AND j.status = 'posted'
    AND j.journal_date BETWEEN v_from AND v_to
    AND COALESCE(a.is_group, FALSE) = TRUE;
  v_failures := v_failures + CASE WHEN v_count > 0 THEN 1 ELSE 0 END;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'rule', 'posted_lines_use_leaf_ledgers',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
    'count', v_count
  ));

  SELECT COUNT(*) INTO v_count
  FROM clients c
  WHERE c.user_id = p_user_id
    AND (c.subledger_account_id IS NULL
      OR c.default_receivable_account_id IS NULL
      OR c.default_revenue_account_id IS NULL
      OR COALESCE(NULLIF(c.gstin, ''), NULLIF(c.pan, '')) IS NULL);
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'rule', 'customer_master_complete',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END,
    'count', v_count
  ));

  SELECT COUNT(*) INTO v_count
  FROM vendors v
  WHERE v.user_id = p_user_id
    AND (v.subledger_account_id IS NULL
      OR v.default_payable_account_id IS NULL
      OR v.default_expense_account_id IS NULL
      OR COALESCE(NULLIF(v.gstin, ''), NULLIF(v.gst_number, ''), NULLIF(v.pan, '')) IS NULL);
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'rule', 'vendor_master_complete',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END,
    'count', v_count
  ));

  IF to_regclass('public.invoices') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM invoices i
    WHERE i.user_id = p_user_id
      AND COALESCE(i.invoice_date, i.created_at::date) BETWEEN v_from AND v_to
      AND NOT EXISTS (
        SELECT 1 FROM journals j
        WHERE j.user_id = i.user_id
          AND j.status = 'posted'
          AND j.source_type IN ('invoice','cash_memo')
          AND j.source_id = i.id
      );
    v_failures := v_failures + CASE WHEN v_count > 0 THEN 1 ELSE 0 END;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'rule', 'invoices_have_posted_journals',
      'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
      'count', v_count
    ));
  END IF;

  IF to_regclass('public.purchase_bills') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM purchase_bills b
    WHERE b.user_id = p_user_id
      AND COALESCE(b.bill_date, b.created_at::date) BETWEEN v_from AND v_to
      AND NOT EXISTS (
        SELECT 1 FROM journals j
        WHERE j.user_id = b.user_id
          AND j.status = 'posted'
          AND j.source_type IN ('bill','purchase_bill')
          AND j.source_id = b.id
      );
    v_failures := v_failures + CASE WHEN v_count > 0 THEN 1 ELSE 0 END;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'rule', 'vendor_bills_have_posted_journals',
      'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
      'count', v_count
    ));
  END IF;

  IF to_regclass('public.expenses') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM expenses e
    WHERE e.user_id = p_user_id
      AND COALESCE(e.expense_date, e.created_at::date) BETWEEN v_from AND v_to
      AND COALESCE(e.status, '') IN ('approved','posted','paid')
      AND NOT EXISTS (
        SELECT 1 FROM journals j
        WHERE j.user_id = e.user_id
          AND j.status = 'posted'
          AND j.source_type = 'expense'
          AND j.source_id = e.id
      );
    v_failures := v_failures + CASE WHEN v_count > 0 THEN 1 ELSE 0 END;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'rule', 'expenses_have_posted_journals',
      'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END,
      'count', v_count
    ));
  END IF;

  v_subledger := get_subledger_reconciliation(p_user_id, v_to);
  v_failures := v_failures + CASE WHEN COALESCE((v_subledger->>'all_reconciled')::boolean, TRUE) THEN 0 ELSE 1 END;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'rule', 'control_ledgers_equal_subledgers',
    'status', CASE WHEN COALESCE((v_subledger->>'all_reconciled')::boolean, TRUE) THEN 'pass' ELSE 'fail' END,
    'details', v_subledger->'controls'
  ));

  BEGIN
    v_health := get_accounting_health_dashboard(p_user_id, v_from, v_to);
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'rule', 'accounting_health',
      'status', CASE WHEN COALESCE((v_health->>'all_passed')::boolean, FALSE) THEN 'pass' ELSE 'warn' END,
      'details', v_health->'checks'
    ));
  EXCEPTION WHEN OTHERS THEN
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'rule', 'accounting_health',
      'status', 'warn',
      'error', SQLERRM
    ));
  END;

  SELECT ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)) INTO v_amount
  FROM v_aczen_gl_balances
  WHERE user_id = p_user_id;
  v_failures := v_failures + CASE WHEN COALESCE(v_amount, 0) <= 0.01 THEN 0 ELSE 1 END;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'rule', 'trial_balance_balances',
    'status', CASE WHEN COALESCE(v_amount, 0) <= 0.01 THEN 'pass' ELSE 'fail' END,
    'variance', ROUND(COALESCE(v_amount, 0)::numeric, 2)
  ));

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'from_date', v_from,
    'to_date', v_to,
    'doctrine', 'Transaction -> Journal Entry -> General Ledger -> Sub-Ledger -> Reports',
    'status', CASE WHEN v_failures = 0 THEN 'pass' ELSE 'fail' END,
    'failure_count', v_failures,
    'checks', v_checks,
    'computed_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_aczen_accounting_doctrine(TEXT, DATE, DATE) TO authenticated, anon;

COMMENT ON FUNCTION validate_aczen_accounting_doctrine IS
  'Phase 35: validates Aczen journal-first accounting doctrine across documents, GL, sub-ledgers, reports, GST/inventory health.';
COMMENT ON FUNCTION ensure_party_accounting_defaults IS
  'Phase 35: creates/links party subledgers and customer/vendor default posting accounts.';
COMMENT ON VIEW v_aczen_gl_balances IS
  'Phase 35: opening + posted journal debit/credit = closing balance. Closing is calculated, never stored.';
COMMENT ON VIEW v_aczen_customer_subledger_balances IS
  'Phase 35: customer balances derived from receivable subledger accounts.';
COMMENT ON VIEW v_aczen_vendor_subledger_balances IS
  'Phase 35: vendor balances derived from payable subledger accounts.';

NOTIFY pgrst, 'reload schema';
