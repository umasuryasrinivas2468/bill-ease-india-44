-- ============================================================================
-- PHASE 21 — Ind AS XBRL TAXONOMY + CONSOLIDATED SOCIE
-- ----------------------------------------------------------------------------
-- 1. Adds xbrl_concept_ind_as column with MCA Ind AS 2019 (in-ind-as) concept
--    mappings so listed companies can file in Ind AS XBRL format.
-- 2. Extends get_aoc4_xbrl_data with a p_division parameter so the same RPC
--    can emit either taxonomy.
-- 3. New RPC get_consolidated_socie aggregating equity movement across all
--    members of a consolidation group with NCI separation.
-- ============================================================================

-- ── 1. Ind AS XBRL concept tagging ──────────────────────────────────────────
ALTER TABLE schedule_iii_lines
  ADD COLUMN IF NOT EXISTS xbrl_concept_ind_as TEXT;

UPDATE schedule_iii_lines SET xbrl_concept_ind_as = CASE line_code
  -- Equity
  WHEN 'BS.E.1'   THEN 'in-ind-as:EquityShareCapital'
  WHEN 'BS.E.2'   THEN 'in-ind-as:OtherEquity'
  WHEN 'BS.E.3'   THEN 'in-ind-as:MoneyReceivedAgainstShareWarrants'
  WHEN 'BS.E.4'   THEN 'in-ind-as:OtherComprehensiveIncomeReserves'
  -- Non-Current Liabilities
  WHEN 'BS.NCL.1' THEN 'in-ind-as:BorrowingsNonCurrent'
  WHEN 'BS.NCL.2' THEN 'in-ind-as:DeferredTaxLiabilitiesNet'
  WHEN 'BS.NCL.3' THEN 'in-ind-as:OtherNonCurrentLiabilities'
  WHEN 'BS.NCL.4' THEN 'in-ind-as:ProvisionsNonCurrent'
  -- Current Liabilities
  WHEN 'BS.CL.1'  THEN 'in-ind-as:BorrowingsCurrent'
  WHEN 'BS.CL.2'  THEN 'in-ind-as:TradePayablesCurrent'
  WHEN 'BS.CL.3'  THEN 'in-ind-as:OtherCurrentLiabilities'
  WHEN 'BS.CL.4'  THEN 'in-ind-as:ProvisionsCurrent'
  -- Non-Current Assets
  WHEN 'BS.NCA.1' THEN 'in-ind-as:PropertyPlantAndEquipment'
  WHEN 'BS.NCA.2' THEN 'in-ind-as:IntangibleAssets'
  WHEN 'BS.NCA.3' THEN 'in-ind-as:CapitalWorkInProgress'
  WHEN 'BS.NCA.4' THEN 'in-ind-as:InvestmentsNonCurrent'
  WHEN 'BS.NCA.5' THEN 'in-ind-as:DeferredTaxAssetsNet'
  WHEN 'BS.NCA.6' THEN 'in-ind-as:LoansNonCurrent'
  WHEN 'BS.NCA.7' THEN 'in-ind-as:OtherNonCurrentAssets'
  -- Current Assets
  WHEN 'BS.CA.1'  THEN 'in-ind-as:InvestmentsCurrent'
  WHEN 'BS.CA.2'  THEN 'in-ind-as:Inventories'
  WHEN 'BS.CA.3'  THEN 'in-ind-as:TradeReceivablesCurrent'
  WHEN 'BS.CA.4'  THEN 'in-ind-as:CashAndCashEquivalents'
  WHEN 'BS.CA.5'  THEN 'in-ind-as:LoansCurrent'
  WHEN 'BS.CA.6'  THEN 'in-ind-as:OtherCurrentAssets'
  -- P&L Revenue
  WHEN 'PL.R.1'   THEN 'in-ind-as:RevenueFromOperations'
  WHEN 'PL.R.2'   THEN 'in-ind-as:OtherIncome'
  -- P&L Expenses
  WHEN 'PL.E.1'   THEN 'in-ind-as:CostOfMaterialsConsumed'
  WHEN 'PL.E.2'   THEN 'in-ind-as:PurchasesOfStockInTrade'
  WHEN 'PL.E.3'   THEN 'in-ind-as:ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade'
  WHEN 'PL.E.4'   THEN 'in-ind-as:EmployeeBenefitsExpense'
  WHEN 'PL.E.5'   THEN 'in-ind-as:FinanceCosts'
  WHEN 'PL.E.6'   THEN 'in-ind-as:DepreciationDepletionAndAmortisationExpense'
  WHEN 'PL.E.7'   THEN 'in-ind-as:OtherExpenses'
  WHEN 'PL.E.8'   THEN 'in-ind-as:TaxExpense'
  -- OCI items (Ind AS only)
  WHEN 'PL.OCI.NR.2' THEN 'in-ind-as:RemeasurementsOfDefinedBenefitPlansNetOfTax'
  WHEN 'PL.OCI.NR.3' THEN 'in-ind-as:EquityInstrumentsThroughOtherComprehensiveIncomeNetOfTax'
  WHEN 'PL.OCI.NR.4' THEN 'in-ind-as:RevaluationSurplusOnPropertyPlantAndEquipmentNetOfTax'
  WHEN 'PL.OCI.R.2'  THEN 'in-ind-as:DebtInstrumentsThroughOtherComprehensiveIncomeNetOfTax'
  WHEN 'PL.OCI.R.3'  THEN 'in-ind-as:ExchangeDifferencesOnTranslatingFinancialStatementsOfForeignOperationsNetOfTax'
  WHEN 'PL.OCI.R.4'  THEN 'in-ind-as:EffectivePortionOfGainsLossOnHedgingInstrumentsInCashFlowHedgeNetOfTax'
  ELSE NULL
END
WHERE xbrl_concept_ind_as IS NULL;

-- ── 2. Replace get_aoc4_xbrl_data with division-aware version ──────────────
DROP FUNCTION IF EXISTS get_aoc4_xbrl_data(TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_aoc4_xbrl_data(
  p_user_id     TEXT,
  p_fiscal_year TEXT,
  p_division    TEXT DEFAULT 'Division_I'
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_start DATE; v_end DATE; v_prev_end DATE;
  v_company JSONB;
  v_facts   JSONB := '[]'::jsonb;
  v_l RECORD;
  v_amount NUMERIC; v_prev_amount NUMERIC;
  v_concept TEXT;
  v_taxonomy TEXT;
  v_namespace_uri TEXT;
  v_result JSONB;
BEGIN
  SELECT b.fy_start, b.fy_end INTO v_start, v_end FROM fy_bounds(p_fiscal_year) b;
  v_prev_end := (v_end - INTERVAL '1 year')::DATE;

  IF p_division = 'Division_II' THEN
    v_taxonomy      := 'in-ind-as/2019-04-01';
    v_namespace_uri := 'http://www.mca.gov.in/xbrl/in-ind-as/2019-04-01/in-ind-as-fin';
  ELSE
    v_taxonomy      := 'in-bse/in-mca/2019-04-01';
    v_namespace_uri := 'http://www.bseindia.com/xbrl/fin/2019-04-01/in-bse-fin';
  END IF;

  -- Entity info
  SELECT to_jsonb(s) INTO v_company
    FROM (
      SELECT a.user_id, a.cin, a.date_of_incorporation, a.reporting_currency,
             a.msme_classification, a.is_listed, a.reporting_division
        FROM accounting_settings a
       WHERE a.user_id = p_user_id
    ) s;

  IF v_company IS NULL THEN
    v_company := jsonb_build_object('user_id', p_user_id);
  END IF;

  FOR v_l IN
    SELECT line_code, statement_type, display_label,
           xbrl_concept, xbrl_concept_ind_as, sort_order
      FROM schedule_iii_lines
     WHERE (CASE p_division
              WHEN 'Division_II' THEN xbrl_concept_ind_as
              ELSE xbrl_concept END) IS NOT NULL
     ORDER BY statement_type, sort_order
  LOOP
    v_concept := CASE p_division WHEN 'Division_II' THEN v_l.xbrl_concept_ind_as ELSE v_l.xbrl_concept END;

    IF v_l.statement_type = 'BS' THEN
      v_amount      := bs_line_balance_as_of(p_user_id, v_l.line_code, v_end);
      v_prev_amount := bs_line_balance_as_of(p_user_id, v_l.line_code, v_prev_end);
    ELSE
      v_amount      := pl_line_amount(p_user_id, v_l.line_code, v_start, v_end);
      v_prev_amount := pl_line_amount(p_user_id, v_l.line_code,
                                      (v_start - INTERVAL '1 year')::DATE,
                                      v_prev_end);
    END IF;

    v_facts := v_facts || jsonb_build_array(jsonb_build_object(
      'concept',        v_concept,
      'line_code',      v_l.line_code,
      'label',          v_l.display_label,
      'statement_type', v_l.statement_type,
      'period_type',    CASE WHEN v_l.statement_type = 'BS' THEN 'instant' ELSE 'duration' END,
      'current_value',  ROUND(COALESCE(v_amount, 0)::NUMERIC, 2),
      'previous_value', ROUND(COALESCE(v_prev_amount, 0)::NUMERIC, 2),
      'decimals',       0,
      'unit',           'INR'
    ));
  END LOOP;

  v_result := jsonb_build_object(
    'division',         p_division,
    'taxonomy',         v_taxonomy,
    'namespace_uri',    v_namespace_uri,
    'taxonomy_label',   CASE p_division
                         WHEN 'Division_II' THEN 'MCA Ind AS Taxonomy 2019'
                         ELSE 'MCA Commercial & Industrial Taxonomy 2019' END,
    'fiscal_year',      p_fiscal_year,
    'period_start',     v_start,
    'period_end',       v_end,
    'previous_period_start', (v_start - INTERVAL '1 year')::DATE,
    'previous_period_end',   v_prev_end,
    'entity',           v_company,
    'fact_count',       jsonb_array_length(v_facts),
    'facts',            v_facts
  );

  RETURN v_result;
END;
$$;

-- ── 3. Consolidated SOCIE ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_consolidated_socie(
  p_owner_user_id TEXT,
  p_group_id      UUID,
  p_period_start  DATE,
  p_period_end    DATE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM consolidation_groups
                  WHERE id = p_group_id AND owner_user_id = p_owner_user_id) THEN
    RAISE EXCEPTION 'Consolidation group not accessible' USING ERRCODE = '42501';
  END IF;

  WITH members AS (
    SELECT m.member_user_id, m.display_name, m.ownership_pct, m.is_parent
      FROM consolidation_members m
     WHERE m.group_id = p_group_id
  ),
  -- Per-member SOCIE components (extract from the standalone RPC then weight)
  per_member AS (
    SELECT
      m.member_user_id,
      m.display_name,
      m.ownership_pct,
      m.is_parent,
      get_statement_of_changes_in_equity(m.member_user_id, p_period_start, p_period_end) AS socie
    FROM members m
  ),
  member_components AS (
    SELECT
      pm.member_user_id, pm.display_name, pm.ownership_pct, pm.is_parent,
      (comp ->> 'account_id')                    AS account_id,
      (comp ->> 'account_name')                  AS account_name,
      (comp ->> 'line_code')                     AS line_code,
      (comp ->> 'line_label')                    AS line_label,
      (comp ->> 'opening_balance')::NUMERIC      AS opening_balance,
      (comp ->> 'profit_for_period')::NUMERIC    AS profit_for_period,
      (comp ->> 'other_movements')::NUMERIC      AS other_movements,
      (comp ->> 'closing_balance')::NUMERIC      AS closing_balance
    FROM per_member pm
    CROSS JOIN LATERAL jsonb_array_elements(pm.socie -> 'components') AS comp
  ),
  -- Aggregate by Schedule III line code with parent/NCI split
  by_line AS (
    SELECT
      line_code,
      MIN(line_label) AS line_label,
      ROUND(SUM(opening_balance     * ownership_pct / 100.0)::NUMERIC, 2) AS opening_parent,
      ROUND(SUM(profit_for_period   * ownership_pct / 100.0)::NUMERIC, 2) AS profit_parent,
      ROUND(SUM(other_movements     * ownership_pct / 100.0)::NUMERIC, 2) AS movements_parent,
      ROUND(SUM(closing_balance     * ownership_pct / 100.0)::NUMERIC, 2) AS closing_parent,
      ROUND(SUM(CASE WHEN is_parent THEN 0
                     ELSE opening_balance     * (100 - ownership_pct) / 100.0 END)::NUMERIC, 2) AS opening_nci,
      ROUND(SUM(CASE WHEN is_parent THEN 0
                     ELSE profit_for_period   * (100 - ownership_pct) / 100.0 END)::NUMERIC, 2) AS profit_nci,
      ROUND(SUM(CASE WHEN is_parent THEN 0
                     ELSE other_movements     * (100 - ownership_pct) / 100.0 END)::NUMERIC, 2) AS movements_nci,
      ROUND(SUM(CASE WHEN is_parent THEN 0
                     ELSE closing_balance     * (100 - ownership_pct) / 100.0 END)::NUMERIC, 2) AS closing_nci,
      ROUND(SUM(opening_balance)::NUMERIC, 2) AS opening_gross,
      ROUND(SUM(closing_balance)::NUMERIC, 2) AS closing_gross
    FROM member_components
    GROUP BY line_code
  )
  SELECT jsonb_build_object(
    'group_id',     p_group_id,
    'period_start', p_period_start,
    'period_end',   p_period_end,
    'members',      (SELECT jsonb_agg(jsonb_build_object(
                       'user_id', member_user_id, 'name', display_name,
                       'ownership_pct', ownership_pct, 'is_parent', is_parent))
                     FROM members),
    'components', (
      SELECT jsonb_agg(jsonb_build_object(
        'line_code',         line_code,
        'line_label',        line_label,
        'opening_parent',    opening_parent,
        'profit_parent',     profit_parent,
        'movements_parent',  movements_parent,
        'closing_parent',    closing_parent,
        'opening_nci',       opening_nci,
        'profit_nci',        profit_nci,
        'movements_nci',     movements_nci,
        'closing_nci',       closing_nci,
        'opening_gross',     opening_gross,
        'closing_gross',     closing_gross
      ) ORDER BY line_code)
      FROM by_line
    ),
    'totals_parent', jsonb_build_object(
      'opening',    (SELECT ROUND(COALESCE(SUM(opening_parent),0)::NUMERIC,2)  FROM by_line),
      'profit',     (SELECT ROUND(COALESCE(SUM(profit_parent),0)::NUMERIC,2)   FROM by_line),
      'movements',  (SELECT ROUND(COALESCE(SUM(movements_parent),0)::NUMERIC,2) FROM by_line),
      'closing',    (SELECT ROUND(COALESCE(SUM(closing_parent),0)::NUMERIC,2)  FROM by_line)
    ),
    'totals_nci', jsonb_build_object(
      'opening',    (SELECT ROUND(COALESCE(SUM(opening_nci),0)::NUMERIC,2)  FROM by_line),
      'profit',     (SELECT ROUND(COALESCE(SUM(profit_nci),0)::NUMERIC,2)   FROM by_line),
      'movements',  (SELECT ROUND(COALESCE(SUM(movements_nci),0)::NUMERIC,2) FROM by_line),
      'closing',    (SELECT ROUND(COALESCE(SUM(closing_nci),0)::NUMERIC,2)  FROM by_line)
    )
  ) INTO v_result;

  RETURN COALESCE(v_result, jsonb_build_object(
    'group_id', p_group_id, 'period_start', p_period_start, 'period_end', p_period_end,
    'components', '[]'::jsonb,
    'totals_parent', jsonb_build_object('opening',0,'profit',0,'movements',0,'closing',0),
    'totals_nci',    jsonb_build_object('opening',0,'profit',0,'movements',0,'closing',0)
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION get_aoc4_xbrl_data(TEXT, TEXT, TEXT)              TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_consolidated_socie(TEXT, UUID, DATE, DATE)    TO authenticated, anon;
