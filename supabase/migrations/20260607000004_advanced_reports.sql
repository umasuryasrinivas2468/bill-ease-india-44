-- ============================================================================
-- PHASE 14 — ADVANCED REPORTS
-- ----------------------------------------------------------------------------
-- Ratio Analysis, Working Capital, Net Worth, Liability Forecast — all built
-- on top of the Schedule III line balances from Phase 10/11 so every figure
-- traces to a posted journal.
-- ============================================================================

-- ── 1. RATIO ANALYSIS RPC ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_financial_ratios(
  p_user_id      TEXT,
  p_period_start DATE,
  p_period_end   DATE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  -- BS lines as of period end
  v_cash       NUMERIC; v_recv      NUMERIC; v_inv       NUMERIC;
  v_st_inv     NUMERIC; v_st_loans  NUMERIC; v_other_ca  NUMERIC;
  v_current_assets NUMERIC;
  v_tangible   NUMERIC; v_intangible NUMERIC; v_cwip     NUMERIC;
  v_nc_invest  NUMERIC; v_lt_loans   NUMERIC; v_dta      NUMERIC; v_other_nca NUMERIC;
  v_nc_assets  NUMERIC;
  v_total_assets NUMERIC;
  v_st_borrow  NUMERIC; v_payables   NUMERIC; v_other_cl NUMERIC; v_st_prov NUMERIC;
  v_current_liab NUMERIC;
  v_lt_borrow  NUMERIC; v_dtl        NUMERIC; v_other_ll NUMERIC; v_lt_prov NUMERIC;
  v_nc_liab    NUMERIC;
  v_share_cap  NUMERIC; v_reserves   NUMERIC;
  v_equity     NUMERIC;
  v_total_borrow NUMERIC;

  -- P&L for the period
  v_revenue    NUMERIC; v_other_inc  NUMERIC;
  v_total_rev  NUMERIC;
  v_cogs       NUMERIC; v_purchases  NUMERIC; v_inv_chg NUMERIC;
  v_emp_ben    NUMERIC; v_fin_cost   NUMERIC; v_dep    NUMERIC; v_other_exp NUMERIC;
  v_total_exp  NUMERIC;
  v_pbt        NUMERIC; v_tax        NUMERIC; v_pat   NUMERIC;
  v_ebitda     NUMERIC;

  -- Ratios
  v_current    NUMERIC; v_quick     NUMERIC; v_cash_r  NUMERIC;
  v_der        NUMERIC; v_de_long   NUMERIC; v_interest_cov NUMERIC;
  v_npm        NUMERIC; v_gpm       NUMERIC; v_opm     NUMERIC;
  v_roa        NUMERIC; v_roe       NUMERIC; v_roce    NUMERIC;
  v_asset_turn NUMERIC; v_recv_turn NUMERIC; v_inv_turn NUMERIC; v_pay_turn NUMERIC;
  v_recv_days  NUMERIC; v_inv_days  NUMERIC; v_pay_days NUMERIC; v_cash_cyc NUMERIC;
  v_wc         NUMERIC; v_net_worth NUMERIC;

  v_result JSONB;
BEGIN
  -- Balance sheet lines
  v_cash       := bs_line_balance_as_of(p_user_id, 'BS.CA.4', p_period_end);
  v_recv       := bs_line_balance_as_of(p_user_id, 'BS.CA.3', p_period_end);
  v_inv        := bs_line_balance_as_of(p_user_id, 'BS.CA.2', p_period_end);
  v_st_inv     := bs_line_balance_as_of(p_user_id, 'BS.CA.1', p_period_end);
  v_st_loans   := bs_line_balance_as_of(p_user_id, 'BS.CA.5', p_period_end);
  v_other_ca   := bs_line_balance_as_of(p_user_id, 'BS.CA.6', p_period_end);
  v_current_assets := v_cash + v_recv + v_inv + v_st_inv + v_st_loans + v_other_ca;

  v_tangible   := bs_line_balance_as_of(p_user_id, 'BS.NCA.1', p_period_end);
  v_intangible := bs_line_balance_as_of(p_user_id, 'BS.NCA.2', p_period_end);
  v_cwip       := bs_line_balance_as_of(p_user_id, 'BS.NCA.3', p_period_end);
  v_nc_invest  := bs_line_balance_as_of(p_user_id, 'BS.NCA.4', p_period_end);
  v_dta        := bs_line_balance_as_of(p_user_id, 'BS.NCA.5', p_period_end);
  v_lt_loans   := bs_line_balance_as_of(p_user_id, 'BS.NCA.6', p_period_end);
  v_other_nca  := bs_line_balance_as_of(p_user_id, 'BS.NCA.7', p_period_end);
  v_nc_assets  := v_tangible + v_intangible + v_cwip + v_nc_invest + v_dta + v_lt_loans + v_other_nca;
  v_total_assets := v_current_assets + v_nc_assets;

  v_st_borrow  := bs_line_balance_as_of(p_user_id, 'BS.CL.1', p_period_end);
  v_payables   := bs_line_balance_as_of(p_user_id, 'BS.CL.2', p_period_end);
  v_other_cl   := bs_line_balance_as_of(p_user_id, 'BS.CL.3', p_period_end);
  v_st_prov    := bs_line_balance_as_of(p_user_id, 'BS.CL.4', p_period_end);
  v_current_liab := v_st_borrow + v_payables + v_other_cl + v_st_prov;

  v_lt_borrow  := bs_line_balance_as_of(p_user_id, 'BS.NCL.1', p_period_end);
  v_dtl        := bs_line_balance_as_of(p_user_id, 'BS.NCL.2', p_period_end);
  v_other_ll   := bs_line_balance_as_of(p_user_id, 'BS.NCL.3', p_period_end);
  v_lt_prov    := bs_line_balance_as_of(p_user_id, 'BS.NCL.4', p_period_end);
  v_nc_liab    := v_lt_borrow + v_dtl + v_other_ll + v_lt_prov;

  v_share_cap  := bs_line_balance_as_of(p_user_id, 'BS.E.1', p_period_end);

  v_total_borrow := v_st_borrow + v_lt_borrow;

  -- P&L lines for the period
  v_revenue    := pl_line_amount(p_user_id, 'PL.R.1', p_period_start, p_period_end);
  v_other_inc  := pl_line_amount(p_user_id, 'PL.R.2', p_period_start, p_period_end);
  v_total_rev  := v_revenue + v_other_inc;

  v_cogs       := pl_line_amount(p_user_id, 'PL.E.1', p_period_start, p_period_end);
  v_purchases  := pl_line_amount(p_user_id, 'PL.E.2', p_period_start, p_period_end);
  v_inv_chg    := pl_line_amount(p_user_id, 'PL.E.3', p_period_start, p_period_end);
  v_emp_ben    := pl_line_amount(p_user_id, 'PL.E.4', p_period_start, p_period_end);
  v_fin_cost   := pl_line_amount(p_user_id, 'PL.E.5', p_period_start, p_period_end);
  v_dep        := pl_line_amount(p_user_id, 'PL.E.6', p_period_start, p_period_end);
  v_other_exp  := pl_line_amount(p_user_id, 'PL.E.7', p_period_start, p_period_end);
  v_tax        := pl_line_amount(p_user_id, 'PL.E.8', p_period_start, p_period_end);

  v_total_exp  := v_cogs + v_purchases + v_inv_chg + v_emp_ben + v_fin_cost + v_dep + v_other_exp;
  v_pbt        := v_total_rev - v_total_exp;
  v_pat        := v_pbt - v_tax;
  v_ebitda     := v_pbt + v_fin_cost + v_dep;

  -- Retained earnings = PAT (closed-period) or net of period (for in-period view)
  v_reserves   := bs_line_balance_as_of(p_user_id, 'BS.E.2', p_period_end) + v_pat;
  v_equity     := v_share_cap + v_reserves;
  v_net_worth  := v_equity;
  v_wc         := v_current_assets - v_current_liab;

  -- Ratios (guard against div-by-zero)
  v_current      := CASE WHEN v_current_liab > 0 THEN v_current_assets / v_current_liab    END;
  v_quick        := CASE WHEN v_current_liab > 0 THEN (v_current_assets - v_inv) / v_current_liab END;
  v_cash_r       := CASE WHEN v_current_liab > 0 THEN v_cash / v_current_liab              END;
  v_der          := CASE WHEN v_equity      > 0 THEN v_total_borrow / v_equity             END;
  v_de_long      := CASE WHEN v_equity      > 0 THEN v_lt_borrow / v_equity                END;
  v_interest_cov := CASE WHEN v_fin_cost    > 0 THEN v_ebitda / v_fin_cost                 END;
  v_npm          := CASE WHEN v_total_rev   > 0 THEN v_pat * 100.0 / v_total_rev           END;
  v_gpm          := CASE WHEN v_revenue     > 0 THEN (v_revenue - v_cogs - v_purchases - v_inv_chg) * 100.0 / v_revenue END;
  v_opm          := CASE WHEN v_total_rev   > 0 THEN (v_pbt + v_fin_cost) * 100.0 / v_total_rev END;
  v_roa          := CASE WHEN v_total_assets > 0 THEN v_pat * 100.0 / v_total_assets       END;
  v_roe          := CASE WHEN v_equity      > 0 THEN v_pat * 100.0 / v_equity              END;
  v_roce         := CASE WHEN (v_equity + v_total_borrow) > 0
                          THEN (v_pbt + v_fin_cost) * 100.0 / (v_equity + v_total_borrow)  END;
  v_asset_turn   := CASE WHEN v_total_assets > 0 THEN v_total_rev / v_total_assets         END;
  v_recv_turn    := CASE WHEN v_recv         > 0 THEN v_revenue / v_recv                   END;
  v_inv_turn     := CASE WHEN v_inv          > 0 THEN (v_cogs + v_purchases + v_inv_chg) / v_inv END;
  v_pay_turn     := CASE WHEN v_payables     > 0 THEN v_purchases / v_payables             END;
  v_recv_days    := CASE WHEN v_revenue      > 0 THEN v_recv * 365.0 / v_revenue           END;
  v_inv_days     := CASE WHEN (v_cogs + v_purchases) > 0 THEN v_inv * 365.0 / (v_cogs + v_purchases) END;
  v_pay_days     := CASE WHEN v_purchases    > 0 THEN v_payables * 365.0 / v_purchases     END;
  v_cash_cyc     := COALESCE(v_recv_days,0) + COALESCE(v_inv_days,0) - COALESCE(v_pay_days,0);

  v_result := jsonb_build_object(
    'period_start', p_period_start,
    'period_end',   p_period_end,
    'liquidity', jsonb_build_object(
      'current_ratio',        v_current,
      'quick_ratio',          v_quick,
      'cash_ratio',           v_cash_r,
      'working_capital',      ROUND(v_wc::NUMERIC, 2)
    ),
    'leverage', jsonb_build_object(
      'debt_to_equity',       v_der,
      'lt_debt_to_equity',    v_de_long,
      'interest_coverage',    v_interest_cov,
      'total_debt',           ROUND(v_total_borrow::NUMERIC, 2),
      'net_worth',            ROUND(v_net_worth::NUMERIC, 2)
    ),
    'profitability', jsonb_build_object(
      'gross_profit_margin_pct',     v_gpm,
      'operating_profit_margin_pct', v_opm,
      'net_profit_margin_pct',       v_npm,
      'return_on_assets_pct',        v_roa,
      'return_on_equity_pct',        v_roe,
      'return_on_capital_employed_pct', v_roce,
      'ebitda',                      ROUND(v_ebitda::NUMERIC, 2),
      'pat',                         ROUND(v_pat::NUMERIC, 2)
    ),
    'efficiency', jsonb_build_object(
      'asset_turnover',         v_asset_turn,
      'receivables_turnover',   v_recv_turn,
      'inventory_turnover',     v_inv_turn,
      'payables_turnover',      v_pay_turn,
      'receivable_days',        v_recv_days,
      'inventory_days',         v_inv_days,
      'payable_days',           v_pay_days,
      'cash_conversion_cycle',  v_cash_cyc
    ),
    'composition', jsonb_build_object(
      'total_assets',         ROUND(v_total_assets::NUMERIC, 2),
      'current_assets',       ROUND(v_current_assets::NUMERIC, 2),
      'non_current_assets',   ROUND(v_nc_assets::NUMERIC, 2),
      'current_liabilities',  ROUND(v_current_liab::NUMERIC, 2),
      'non_current_liabilities', ROUND(v_nc_liab::NUMERIC, 2),
      'equity',               ROUND(v_equity::NUMERIC, 2),
      'share_capital',        ROUND(v_share_cap::NUMERIC, 2),
      'reserves_and_surplus', ROUND(v_reserves::NUMERIC, 2)
    )
  );

  RETURN v_result;
END;
$$;

-- ── 2. LIABILITY FORECAST (next 12 months EMI schedule by month) ───────────
CREATE OR REPLACE VIEW v_liability_forecast_12m AS
SELECT
  s.user_id,
  date_trunc('month', s.due_date)::DATE AS month_start,
  COUNT(*)                AS emi_count,
  SUM(s.principal_component) AS principal_due,
  SUM(s.interest_component)  AS interest_due,
  SUM(s.total_emi)        AS total_due
FROM loan_emi_schedule s
WHERE s.due_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '12 months')
  AND s.status <> 'paid'
GROUP BY s.user_id, date_trunc('month', s.due_date);

-- ── 3. MSME PAYABLES STANDALONE VIEW (Section 22 disclosure) ──────────────
CREATE OR REPLACE VIEW v_msme_payables_detail AS
SELECT
  pb.user_id,
  pb.id           AS bill_id,
  pb.bill_number,
  pb.vendor_id,
  pb.vendor_name,
  v.udyam_number,
  v.msme_category,
  pb.bill_date,
  pb.due_date,
  CURRENT_DATE - COALESCE(pb.due_date, pb.bill_date) AS days_outstanding,
  GREATEST(COALESCE(pb.total_amount, 0) - COALESCE(pb.paid_amount, 0), 0) AS outstanding,
  CASE
    WHEN CURRENT_DATE - COALESCE(pb.due_date, pb.bill_date) > 45 THEN TRUE
    ELSE FALSE
  END AS is_section_22_overdue
FROM purchase_bills pb
JOIN vendors v ON v.id = pb.vendor_id AND v.is_msme = TRUE
WHERE COALESCE(pb.status, '') NOT IN ('paid','cancelled','draft');

GRANT EXECUTE ON FUNCTION get_financial_ratios(TEXT, DATE, DATE) TO authenticated, anon;
