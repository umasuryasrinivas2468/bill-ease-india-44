-- ============================================================================
-- PHASE 17 — MCA AOC-4 XBRL TAGGING & DATA EMITTER
-- ----------------------------------------------------------------------------
-- Tag every Schedule III line with its MCA Commercial & Industrial (C&I)
-- taxonomy concept URI so an XBRL XML can be emitted for AOC-4 filing under
-- the Companies Act 2013.
--
-- Taxonomy: MCA C&I 2019 (in-bse/in-mca/2019-04-01)
-- Concept naming convention: in-bse:ConceptName
-- ============================================================================

-- ── 1. Add xbrl_tag to schedule_iii_lines master ───────────────────────────
ALTER TABLE schedule_iii_lines
  ADD COLUMN IF NOT EXISTS xbrl_concept TEXT;        -- e.g. 'in-bse:TradeReceivablesCurrent'

-- Map Schedule III lines → MCA C&I taxonomy concepts.
-- Reference: https://www.mca.gov.in/MinistryV2/xbrl.html  (Commercial-Industrial taxonomy)
UPDATE schedule_iii_lines SET xbrl_concept = CASE line_code
  -- Equity
  WHEN 'BS.E.1'   THEN 'in-bse:PaidUpEquityShareCapital'
  WHEN 'BS.E.2'   THEN 'in-bse:ReservesAndSurplus'
  WHEN 'BS.E.3'   THEN 'in-bse:MoneyReceivedAgainstShareWarrants'
  -- Non-Current Liabilities
  WHEN 'BS.NCL.1' THEN 'in-bse:LongTermBorrowings'
  WHEN 'BS.NCL.2' THEN 'in-bse:DeferredTaxLiabilitiesNet'
  WHEN 'BS.NCL.3' THEN 'in-bse:OtherLongTermLiabilities'
  WHEN 'BS.NCL.4' THEN 'in-bse:LongTermProvisions'
  -- Current Liabilities
  WHEN 'BS.CL.1'  THEN 'in-bse:ShortTermBorrowings'
  WHEN 'BS.CL.2'  THEN 'in-bse:TradePayablesCurrent'
  WHEN 'BS.CL.3'  THEN 'in-bse:OtherCurrentLiabilities'
  WHEN 'BS.CL.4'  THEN 'in-bse:ShortTermProvisions'
  -- Non-Current Assets
  WHEN 'BS.NCA.1' THEN 'in-bse:TangibleAssets'
  WHEN 'BS.NCA.2' THEN 'in-bse:IntangibleAssets'
  WHEN 'BS.NCA.3' THEN 'in-bse:CapitalWorkInProgress'
  WHEN 'BS.NCA.4' THEN 'in-bse:NonCurrentInvestments'
  WHEN 'BS.NCA.5' THEN 'in-bse:DeferredTaxAssetsNet'
  WHEN 'BS.NCA.6' THEN 'in-bse:LongTermLoansAndAdvances'
  WHEN 'BS.NCA.7' THEN 'in-bse:OtherNonCurrentAssets'
  -- Current Assets
  WHEN 'BS.CA.1'  THEN 'in-bse:CurrentInvestments'
  WHEN 'BS.CA.2'  THEN 'in-bse:Inventories'
  WHEN 'BS.CA.3'  THEN 'in-bse:TradeReceivablesCurrent'
  WHEN 'BS.CA.4'  THEN 'in-bse:CashAndBankBalances'
  WHEN 'BS.CA.5'  THEN 'in-bse:ShortTermLoansAndAdvances'
  WHEN 'BS.CA.6'  THEN 'in-bse:OtherCurrentAssets'
  -- P&L Revenue
  WHEN 'PL.R.1'   THEN 'in-bse:RevenueFromOperations'
  WHEN 'PL.R.2'   THEN 'in-bse:OtherIncome'
  -- P&L Expenses
  WHEN 'PL.E.1'   THEN 'in-bse:CostOfMaterialsConsumed'
  WHEN 'PL.E.2'   THEN 'in-bse:PurchasesOfStockInTrade'
  WHEN 'PL.E.3'   THEN 'in-bse:ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade'
  WHEN 'PL.E.4'   THEN 'in-bse:EmployeeBenefitExpense'
  WHEN 'PL.E.5'   THEN 'in-bse:FinanceCosts'
  WHEN 'PL.E.6'   THEN 'in-bse:DepreciationAndAmortisationExpense'
  WHEN 'PL.E.7'   THEN 'in-bse:OtherExpenses'
  WHEN 'PL.E.8'   THEN 'in-bse:TaxExpense'
  ELSE NULL
END
WHERE xbrl_concept IS NULL;

-- Optional: also tag individual accounts that need granular XBRL emission.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS xbrl_concept TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_xbrl ON accounts(user_id, xbrl_concept) WHERE xbrl_concept IS NOT NULL;

-- ── 2. AOC-4 XBRL DATA EMITTER RPC ─────────────────────────────────────────
-- Emits a structured JSON envelope with all Schedule III line values + XBRL
-- concept URIs + period context + entity-level info. The frontend converts
-- this to XBRL XML.
CREATE OR REPLACE FUNCTION get_aoc4_xbrl_data(
  p_user_id     TEXT,
  p_fiscal_year TEXT
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_start DATE; v_end DATE; v_prev_end DATE;
  v_company JSONB;
  v_facts   JSONB := '[]'::jsonb;
  v_l RECORD;
  v_amount NUMERIC; v_prev_amount NUMERIC;
  v_result JSONB;
BEGIN
  SELECT b.fy_start, b.fy_end INTO v_start, v_end FROM fy_bounds(p_fiscal_year) b;
  v_prev_end := (v_end - INTERVAL '1 year')::DATE;

  -- Entity / company info
  SELECT to_jsonb(s) INTO v_company
    FROM (
      SELECT a.user_id, a.cin, a.date_of_incorporation, a.reporting_currency,
             a.msme_classification, a.is_listed
        FROM accounting_settings a
       WHERE a.user_id = p_user_id
    ) s;

  IF v_company IS NULL THEN
    v_company := jsonb_build_object('user_id', p_user_id);
  END IF;

  -- For each Schedule III line with a taxonomy mapping, get current + prev values
  FOR v_l IN
    SELECT line_code, statement_type, display_label, xbrl_concept, sort_order
      FROM schedule_iii_lines
     WHERE xbrl_concept IS NOT NULL
     ORDER BY statement_type, sort_order
  LOOP
    IF v_l.statement_type = 'BS' THEN
      v_amount       := bs_line_balance_as_of(p_user_id, v_l.line_code, v_end);
      v_prev_amount  := bs_line_balance_as_of(p_user_id, v_l.line_code, v_prev_end);
    ELSE
      v_amount       := pl_line_amount(p_user_id, v_l.line_code, v_start, v_end);
      v_prev_amount  := pl_line_amount(p_user_id, v_l.line_code,
                                       (v_start - INTERVAL '1 year')::DATE,
                                       v_prev_end);
    END IF;

    v_facts := v_facts || jsonb_build_array(jsonb_build_object(
      'concept',        v_l.xbrl_concept,
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
    'taxonomy',         'in-bse/in-mca/2019-04-01',
    'taxonomy_label',   'MCA Commercial & Industrial Taxonomy 2019',
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

GRANT EXECUTE ON FUNCTION get_aoc4_xbrl_data(TEXT, TEXT) TO authenticated, anon;
