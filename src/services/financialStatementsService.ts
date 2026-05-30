import { supabase } from '@/lib/supabase';

export interface CompanyDetails {
  companyName: string;
  cin: string;
  pan: string;
  address: string;
  place: string;
  dateOfIncorporation: string;
  ownerName: string;
  directorDIN: string;
  secondDirectorName?: string;
  secondDirectorDIN?: string;
}

export interface FinancialData {
  revenueFromOperations: number;
  otherIncome: number;
  totalRevenue: number;
  costOfMaterialsConsumed: number;
  purchaseOfStockInTrade: number;
  changesInInventories: number;
  employeeBenefitExpense: number;
  financialCosts: number;
  depreciationExpense: number;
  otherExpenses: number;
  totalExpenses: number;
  profitBeforeTax: number;
  taxExpense: number;
  profitAfterTax: number;
  shareCapital: number;
  reservesAndSurplus: number;
  longTermBorrowings: number;
  shortTermBorrowings: number;
  tradePayables: number;
  otherCurrentLiabilities: number;
  longTermProvisions: number;
  shortTermProvisions: number;
  deferredTaxLiabilities: number;
  totalEquityAndLiabilities: number;
  tangibleAssets: number;
  intangibleAssets: number;
  capitalWorkInProgress: number;
  nonCurrentInvestments: number;
  longTermLoansAndAdvances: number;
  deferredTaxAssets: number;
  inventories: number;
  tradeReceivables: number;
  cashAndBank: number;
  shortTermLoansAndAdvances: number;
  otherCurrentAssets: number;
  totalAssets: number;
  // Aliases kept for backwards-compat with older UI references
  fixedAssets: number;
  expenseDetails: Array<{ description: string; amount: number; lineCode?: string; noteNo?: string }>;
  incomeDetails: Array<{ description: string; amount: number; lineCode?: string; noteNo?: string }>;
  scheduleIIILines: ScheduleIIIRawLine[];
  integrity?: IntegrityFlags;
}

export interface ScheduleIIIRawLine {
  line_code: string;
  section: string;
  subsection: string;
  label: string;
  note_no?: string;
  amount: number;
  prev_amount?: number;
  current_non_current?: string;
}

export interface IntegrityFlags {
  trial_balance_balanced: boolean;
  trial_balance_diff: number;
  unclassified_accounts: number;
  all_accounts_classified: boolean;
  bs_equation_holds: boolean;
  bs_equation_diff: number;
}

interface BalanceSheetRPC {
  as_of: string;
  sections: Array<{
    section: string;
    total: number;
    subsections: Array<{
      subsection: string;
      current_non_current: string;
      total: number;
      lines: ScheduleIIIRawLine[];
    }>;
  }>;
}

interface ProfitLossRPC {
  period_start: string;
  period_end: string;
  total_revenue: number;
  total_revenue_prev: number;
  total_expenses: number;
  total_expenses_prev: number;
  profit_before_tax: number;
  tax_expense: number;
  profit_after_tax: number;
  lines: ScheduleIIIRawLine[];
}

const lineMap = (lines: ScheduleIIIRawLine[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const l of lines) m[l.line_code] = Number(l.amount || 0);
  return m;
};

const flattenBS = (bs: BalanceSheetRPC): ScheduleIIIRawLine[] => {
  const out: ScheduleIIIRawLine[] = [];
  for (const sec of bs.sections || []) {
    for (const sub of sec.subsections || []) {
      for (const line of sub.lines || []) {
        out.push({ ...line, section: sec.section, subsection: sub.subsection });
      }
    }
  }
  return out;
};

const fyDates = (financialYear: string): { start: string; end: string } => {
  const [s] = financialYear.split('-').map(y => parseInt(y.length === 2 ? `20${y}` : y, 10));
  return { start: `${s}-04-01`, end: `${s + 1}-03-31` };
};

export const fetchFinancialData = async (
  userId: string,
  financialYear: string,
  options: { comparative?: boolean } = {}
): Promise<FinancialData> => {
  const { start, end } = fyDates(financialYear);
  const prevEnd = options.comparative
    ? `${parseInt(end.slice(0, 4), 10) - 1}-${end.slice(5)}`
    : null;

  const [bsRes, plRes, integRes] = await Promise.all([
    supabase.rpc('get_schedule_iii_balance_sheet', {
      p_user_id: userId,
      p_as_of: end,
      p_prev_as_of: prevEnd,
    }),
    supabase.rpc('get_schedule_iii_profit_loss',   {
      p_user_id: userId,
      p_period_start: start,
      p_period_end: end,
      p_comparative: options.comparative ?? false,
    }),
    supabase.rpc('validate_schedule_iii_integrity', { p_user_id: userId }),
  ]);

  if (bsRes.error)    console.error('[financialStatementsService] BS RPC error:', bsRes.error);
  if (plRes.error)    console.error('[financialStatementsService] PL RPC error:', plRes.error);
  if (integRes.error) console.error('[financialStatementsService] Integrity RPC error:', integRes.error);

  const bs = (bsRes.data as BalanceSheetRPC) ?? { as_of: end, sections: [] };
  const pl = (plRes.data as ProfitLossRPC) ?? {
    period_start: start, period_end: end,
    total_revenue: 0, total_revenue_prev: 0, total_expenses: 0, total_expenses_prev: 0,
    profit_before_tax: 0, tax_expense: 0, profit_after_tax: 0, lines: [],
  };
  const integrity = (integRes.data as IntegrityFlags | null) ?? undefined;

  const bsLines = flattenBS(bs);
  const bsMap   = lineMap(bsLines);
  const plMap   = lineMap(pl.lines || []);

  const revenueFromOperations = plMap['PL.R.1'] || 0;
  const otherIncome           = plMap['PL.R.2'] || 0;
  const totalRevenue          = pl.total_revenue;

  const costOfMaterialsConsumed = plMap['PL.E.1'] || 0;
  const purchaseOfStockInTrade  = plMap['PL.E.2'] || 0;
  const changesInInventories    = plMap['PL.E.3'] || 0;
  const employeeBenefitExpense  = plMap['PL.E.4'] || 0;
  const financialCosts          = plMap['PL.E.5'] || 0;
  const depreciationExpense     = plMap['PL.E.6'] || 0;
  const otherExpenses           = plMap['PL.E.7'] || 0;
  const taxExpense              = plMap['PL.E.8'] || 0;
  const totalExpenses           = pl.total_expenses;
  const profitBeforeTax         = pl.profit_before_tax;
  const profitAfterTax          = pl.profit_after_tax;

  const shareCapital            = bsMap['BS.E.1'] || 0;
  const reservesAndSurplus      = bsMap['BS.E.2'] || 0;
  const longTermBorrowings      = bsMap['BS.NCL.1'] || 0;
  const deferredTaxLiabilities  = bsMap['BS.NCL.2'] || 0;
  const longTermProvisions      = bsMap['BS.NCL.4'] || 0;
  const shortTermBorrowings     = bsMap['BS.CL.1'] || 0;
  const tradePayables           = bsMap['BS.CL.2'] || 0;
  const otherCurrentLiabilities = bsMap['BS.CL.3'] || 0;
  const shortTermProvisions     = bsMap['BS.CL.4'] || 0;

  const tangibleAssets          = bsMap['BS.NCA.1'] || 0;
  const intangibleAssets        = bsMap['BS.NCA.2'] || 0;
  const capitalWorkInProgress   = bsMap['BS.NCA.3'] || 0;
  const nonCurrentInvestments   = bsMap['BS.NCA.4'] || 0;
  const deferredTaxAssets       = bsMap['BS.NCA.5'] || 0;
  const longTermLoansAndAdvances= bsMap['BS.NCA.6'] || 0;
  const inventories             = bsMap['BS.CA.2'] || 0;
  const tradeReceivables        = bsMap['BS.CA.3'] || 0;
  const cashAndBank             = bsMap['BS.CA.4'] || 0;
  const shortTermLoansAndAdvances = bsMap['BS.CA.5'] || 0;
  const otherCurrentAssets      = bsMap['BS.CA.6'] || 0;

  const totalEquityAndLiabilities = bs.sections.find(s => s.section === 'EQUITY_AND_LIABILITIES')?.total ?? 0;
  const totalAssets               = bs.sections.find(s => s.section === 'ASSETS')?.total ?? 0;

  const expenseDetails = (pl.lines || [])
    .filter(l => l.section === 'EXPENSES' && Math.abs(Number(l.amount || 0)) > 0)
    .map(l => ({ description: l.label, amount: Number(l.amount), lineCode: l.line_code, noteNo: l.note_no }));

  const incomeDetails = (pl.lines || [])
    .filter(l => l.section === 'INCOME' && Math.abs(Number(l.amount || 0)) > 0)
    .map(l => ({ description: l.label, amount: Number(l.amount), lineCode: l.line_code, noteNo: l.note_no }));

  return {
    revenueFromOperations, otherIncome, totalRevenue,
    costOfMaterialsConsumed, purchaseOfStockInTrade, changesInInventories,
    employeeBenefitExpense, financialCosts, depreciationExpense, otherExpenses,
    totalExpenses, profitBeforeTax, taxExpense, profitAfterTax,
    shareCapital, reservesAndSurplus,
    longTermBorrowings, shortTermBorrowings, tradePayables, otherCurrentLiabilities,
    longTermProvisions, shortTermProvisions, deferredTaxLiabilities,
    totalEquityAndLiabilities,
    tangibleAssets, intangibleAssets, capitalWorkInProgress,
    nonCurrentInvestments, longTermLoansAndAdvances, deferredTaxAssets,
    inventories, tradeReceivables, cashAndBank, shortTermLoansAndAdvances, otherCurrentAssets,
    totalAssets,
    fixedAssets: tangibleAssets + intangibleAssets + capitalWorkInProgress,
    expenseDetails, incomeDetails,
    scheduleIIILines: [...bsLines, ...(pl.lines || [])],
    integrity,
  };
};

export interface FixedAssetSchedule {
  fy_start: string;
  fy_end: string;
  total_opening: number;
  total_additions: number;
  total_disposals: number;
  total_proceeds: number;
  total_accum_dep: number;
  total_closing_net: number;
  by_category: Array<{
    category: string;
    asset_count: number;
    opening_gross: number;
    additions: number;
    disposals_gross: number;
    closing_gross: number;
    accumulated_dep: number;
    closing_net_block: number;
  }>;
}

export const fetchFixedAssetSchedule = async (
  userId: string,
  financialYear: string
): Promise<FixedAssetSchedule> => {
  const { start, end } = fyDates(financialYear);
  const { data, error } = await supabase.rpc('get_fixed_asset_schedule', {
    p_user_id: userId,
    p_fy_start: start,
    p_fy_end: end,
  });
  if (error) console.error('[financialStatementsService] FA schedule RPC error:', error);
  return (data as FixedAssetSchedule) ?? {
    fy_start: start, fy_end: end,
    total_opening: 0, total_additions: 0, total_disposals: 0,
    total_proceeds: 0, total_accum_dep: 0, total_closing_net: 0,
    by_category: [],
  };
};

export interface APAgingSchedule {
  not_due: number;
  days_1_365: number;
  years_1_to_2: number;
  years_2_to_3: number;
  over_3_years: number;
  total_outstanding: number;
  msme_overdue_45_plus: number;
  msme_total_outstanding: number;
  non_msme_total_outstanding: number;
}

export const fetchAPAgingSchedule = async (userId: string): Promise<APAgingSchedule | null> => {
  const { data, error } = await supabase
    .from('v_ap_schedule_iii_aging')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) console.error('[financialStatementsService] AP aging error:', error);
  return (data as APAgingSchedule) ?? null;
};

export interface ARAgingSchedule {
  not_due: number;
  days_1_180: number;
  days_181_365: number;
  years_1_to_2: number;
  years_2_to_3: number;
  over_3_years: number;
  total_outstanding: number;
}

export const fetchARAgingSchedule = async (userId: string): Promise<ARAgingSchedule | null> => {
  const { data, error } = await supabase
    .from('v_ar_schedule_iii_aging')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) console.error('[financialStatementsService] AR aging error:', error);
  return (data as ARAgingSchedule) ?? null;
};

// ─── Cash Flow Statement ─────────────────────────────────────────────────────
export interface CashFlowLine {
  label: string;
  amount: number | null;
  group: 'start' | 'adjustments_header' | 'adjustments' | 'subtotal' | 'wc_header' | 'wc' | 'tax' | 'total' | 'line';
}

export interface CashFlowSection {
  total: number;
  lines: CashFlowLine[];
}

export interface CashFlowStatement {
  period_start: string;
  period_end: string;
  method: 'indirect';
  opening_cash: number;
  closing_cash: number;
  net_change: number;
  reconciliation_diff: number;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
}

export const fetchCashFlowStatement = async (
  userId: string,
  financialYear: string
): Promise<CashFlowStatement | null> => {
  const { start, end } = fyDates(financialYear);
  const { data, error } = await supabase.rpc('get_cash_flow_statement', {
    p_user_id: userId,
    p_period_start: start,
    p_period_end: end,
  });
  if (error) {
    console.error('[financialStatementsService] CFS RPC error:', error);
    return null;
  }
  return data as CashFlowStatement;
};

// ─── Schedule III Drilldown ──────────────────────────────────────────────────
export interface DrilldownEntry {
  journal_id: string;
  journal_number: string;
  journal_date: string;
  narration: string | null;
  source_type: string | null;
  source_id: string | null;
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  signed_amount: number;
  vendor_id?: string | null;
  customer_id?: string | null;
}

export interface DrilldownResult {
  line_code: string;
  label: string;
  section: string;
  subsection: string;
  note_no: string | null;
  statement_type: 'BS' | 'PL';
  period_start: string | null;
  period_end: string;
  row_count: number;
  debit_total: number;
  credit_total: number;
  net_amount: number;
  page_limit: number;
  page_offset: number;
  entries: DrilldownEntry[];
}

export const fetchScheduleIIIDrilldown = async (
  userId: string,
  lineCode: string,
  options: { periodStart?: string; periodEnd?: string; limit?: number; offset?: number } = {}
): Promise<DrilldownResult | null> => {
  const { data, error } = await supabase.rpc('get_schedule_iii_drilldown', {
    p_user_id: userId,
    p_line_code: lineCode,
    p_period_start: options.periodStart ?? null,
    p_period_end:   options.periodEnd ?? new Date().toISOString().slice(0, 10),
    p_limit:        options.limit ?? 200,
    p_offset:       options.offset ?? 0,
  });
  if (error) {
    console.error('[financialStatementsService] Drilldown RPC error:', error);
    return null;
  }
  return data as DrilldownResult;
};

// ─── Period Locks ────────────────────────────────────────────────────────────
export interface PeriodLock {
  id: string;
  lock_through: string;
  fiscal_year: string | null;
  reason: string | null;
  locked_at: string;
  is_active: boolean;
  unlocked_at: string | null;
  unlock_reason: string | null;
}

export const fetchPeriodLocks = async (userId: string): Promise<PeriodLock[]> => {
  const { data, error } = await supabase.rpc('list_financial_period_locks', { p_user_id: userId });
  if (error) {
    console.error('[financialStatementsService] list locks error:', error);
    return [];
  }
  return (data as PeriodLock[]) ?? [];
};

export const lockPeriod = async (
  userId: string,
  lockThrough: string,
  fiscalYear?: string,
  reason?: string
): Promise<string | null> => {
  const { data, error } = await supabase.rpc('lock_financial_period', {
    p_user_id: userId,
    p_lock_through: lockThrough,
    p_fiscal_year: fiscalYear ?? null,
    p_reason: reason ?? null,
  });
  if (error) {
    console.error('[financialStatementsService] lock error:', error);
    throw error;
  }
  return data as string;
};

export const unlockPeriod = async (
  userId: string,
  lockId: string,
  reason?: string
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('unlock_financial_period', {
    p_user_id: userId,
    p_lock_id: lockId,
    p_reason: reason ?? null,
  });
  if (error) {
    console.error('[financialStatementsService] unlock error:', error);
    throw error;
  }
  return Boolean(data);
};

// ─── Financial Ratios ────────────────────────────────────────────────────────
export interface FinancialRatios {
  period_start: string;
  period_end: string;
  liquidity: {
    current_ratio: number | null;
    quick_ratio: number | null;
    cash_ratio: number | null;
    working_capital: number;
  };
  leverage: {
    debt_to_equity: number | null;
    lt_debt_to_equity: number | null;
    interest_coverage: number | null;
    total_debt: number;
    net_worth: number;
  };
  profitability: {
    gross_profit_margin_pct: number | null;
    operating_profit_margin_pct: number | null;
    net_profit_margin_pct: number | null;
    return_on_assets_pct: number | null;
    return_on_equity_pct: number | null;
    return_on_capital_employed_pct: number | null;
    ebitda: number;
    pat: number;
  };
  efficiency: {
    asset_turnover: number | null;
    receivables_turnover: number | null;
    inventory_turnover: number | null;
    payables_turnover: number | null;
    receivable_days: number | null;
    inventory_days: number | null;
    payable_days: number | null;
    cash_conversion_cycle: number;
  };
  composition: {
    total_assets: number;
    current_assets: number;
    non_current_assets: number;
    current_liabilities: number;
    non_current_liabilities: number;
    equity: number;
    share_capital: number;
    reserves_and_surplus: number;
  };
}

export const fetchFinancialRatios = async (
  userId: string,
  financialYear: string
): Promise<FinancialRatios | null> => {
  const { start, end } = fyDates(financialYear);
  const { data, error } = await supabase.rpc('get_financial_ratios', {
    p_user_id: userId,
    p_period_start: start,
    p_period_end: end,
  });
  if (error) {
    console.error('[financialStatementsService] ratios error:', error);
    return null;
  }
  return data as FinancialRatios;
};

// ─── Notes to Accounts ───────────────────────────────────────────────────────
export interface AccountingNote {
  id: string;
  note_no: string;
  title: string;
  category: string;
  body: string;
  body_format: 'markdown' | 'html' | 'plain';
  is_overridden: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

export interface NotesToAccounts {
  fiscal_year: string;
  notes: AccountingNote[];
}

export const fetchNotesToAccounts = async (
  userId: string,
  financialYear: string,
  regenerate = false
): Promise<NotesToAccounts | null> => {
  if (regenerate) {
    await supabase.rpc('generate_default_notes', { p_user_id: userId, p_fy: financialYear });
  }
  const { data, error } = await supabase.rpc('get_notes_to_accounts', {
    p_user_id: userId,
    p_fy: financialYear,
  });
  if (error) {
    console.error('[financialStatementsService] notes fetch error:', error);
    return null;
  }
  // If empty, auto-generate then re-fetch once
  const parsed = data as NotesToAccounts | null;
  if (parsed && parsed.notes.length === 0 && !regenerate) {
    return fetchNotesToAccounts(userId, financialYear, true);
  }
  return parsed;
};

export const updateNoteOverride = async (
  noteId: string,
  overrideBody: string
): Promise<void> => {
  const { error } = await supabase
    .from('accounting_notes')
    .update({ override_body: overrideBody, reviewed_at: new Date().toISOString() })
    .eq('id', noteId);
  if (error) {
    console.error('[financialStatementsService] note override error:', error);
    throw error;
  }
};

// ─── FY Close ────────────────────────────────────────────────────────────────
export interface FYCloseResult {
  closed: boolean;
  already_closed?: boolean;
  fiscal_year: string;
  fy_start?: string;
  fy_end?: string;
  reason?: string;
  journal_id?: string;
  journal_number?: string;
  income_total?: number;
  expense_total?: number;
  pat?: number;
  lock_id?: string;
  reserves_account_id?: string;
}

export const closeFinancialYear = async (
  userId: string,
  fiscalYear: string
): Promise<FYCloseResult> => {
  const { data, error } = await supabase.rpc('close_financial_year', {
    p_user_id: userId,
    p_fiscal_year: fiscalYear,
  });
  if (error) {
    console.error('[financialStatementsService] FY close error:', error);
    throw error;
  }
  return data as FYCloseResult;
};

// ─── AI Financial Review ─────────────────────────────────────────────────────
export interface AIFinding {
  id: string;
  run_id: string;
  category: 'anomaly' | 'disclosure' | 'ratio' | 'compliance' | 'audit';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  rule_code: string | null;
  title: string;
  body: string | null;
  related_line: string | null;
  related_account: string | null;
  metric_value: number | null;
  metric_unit: string | null;
  suggested_action: string | null;
  acknowledged: boolean;
  created_at: string;
}

export interface AIRunResult {
  run_id: string;
  total_findings: number;
  fiscal_year: string;
  completed_at: string;
}

export const runFinancialAnomalyDetection = async (
  userId: string,
  financialYear: string
): Promise<AIRunResult | null> => {
  const { data, error } = await supabase.rpc('detect_financial_anomalies', {
    p_user_id: userId,
    p_fiscal_year: financialYear,
  });
  if (error) {
    console.error('[financialStatementsService] anomaly detection error:', error);
    return null;
  }
  return data as AIRunResult;
};

export const listAIFindings = async (
  userId: string,
  options: { runId?: string; onlyUnacknowledged?: boolean } = {}
): Promise<AIFinding[]> => {
  const { data, error } = await supabase.rpc('list_ai_findings', {
    p_user_id: userId,
    p_run_id: options.runId ?? null,
    p_only_unack: options.onlyUnacknowledged ?? false,
  });
  if (error) {
    console.error('[financialStatementsService] list findings error:', error);
    return [];
  }
  return (data as AIFinding[]) ?? [];
};

export const acknowledgeAIFinding = async (
  userId: string,
  findingId: string
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('acknowledge_ai_finding', {
    p_user_id: userId,
    p_finding_id: findingId,
  });
  if (error) {
    console.error('[financialStatementsService] ack finding error:', error);
    throw error;
  }
  return Boolean(data);
};

// ─── LLM-Powered AI Review (Phase 16) ────────────────────────────────────────
export interface LLMReviewResult {
  has_review: boolean;
  run_id?: string;
  completed_at?: string;
  executive_summary?: string;
  narrative_commentary?: string;
  total_findings?: number;
  llm_provider?: string;
  llm_model?: string;
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    cache_read_tokens?: number | null;
  };
  findings?: AIFinding[];
}

export const fetchLatestLLMReview = async (
  userId: string,
  financialYear: string
): Promise<LLMReviewResult | null> => {
  const { data, error } = await supabase.rpc('get_latest_llm_review', {
    p_user_id: userId,
    p_fiscal_year: financialYear,
  });
  if (error) {
    console.error('[financialStatementsService] latest LLM review error:', error);
    return null;
  }
  return (data as LLMReviewResult) ?? null;
};

export const runLLMFinancialReview = async (
  userId: string,
  financialYear: string
): Promise<LLMReviewResult | null> => {
  // 1. Gather all the inputs the LLM needs (parallel)
  const { start, end } = fyDates(financialYear);
  const [bsR, plR, cfsR, ratiosR, integR, rulesFindings] = await Promise.all([
    supabase.rpc('get_schedule_iii_balance_sheet', { p_user_id: userId, p_as_of: end, p_prev_as_of: null }),
    supabase.rpc('get_schedule_iii_profit_loss',   { p_user_id: userId, p_period_start: start, p_period_end: end, p_comparative: false }),
    supabase.rpc('get_cash_flow_statement',        { p_user_id: userId, p_period_start: start, p_period_end: end }),
    supabase.rpc('get_financial_ratios',           { p_user_id: userId, p_period_start: start, p_period_end: end }),
    supabase.rpc('validate_schedule_iii_integrity',{ p_user_id: userId }),
    listAIFindings(userId, { onlyUnacknowledged: false }),
  ]);

  // 2. Call the edge function
  const { data, error } = await supabase.functions.invoke('ai-financial-review', {
    body: {
      userId,
      fiscalYear: financialYear,
      bs:        bsR.data,
      pl:        plR.data,
      cfs:       cfsR.data,
      ratios:    ratiosR.data,
      integrity: integR.data,
      rulesFindings,
    },
  });
  if (error) {
    console.error('[financialStatementsService] LLM review error:', error);
    throw error;
  }
  if (!data?.success) {
    throw new Error(data?.error ?? 'AI review failed');
  }
  return data.data as LLMReviewResult;
};

// ─── Multi-Entity Consolidation (Phase 18) ───────────────────────────────────
export interface ConsolidationGroup {
  id: string;
  name: string;
  parent_user_id: string;
  fiscal_year: string | null;
  is_active: boolean;
  member_count: number;
  created_at: string;
}

export interface ConsolidationMember {
  id?: string;
  group_id?: string;
  member_user_id: string;
  display_name: string;
  ownership_pct: number;
  is_parent: boolean;
  acquisition_date?: string | null;
  notes?: string | null;
}

export interface ConsolidationLine {
  line_code: string;
  label: string;
  note_no: string | null;
  amount: number;
  gross_sum: number;
  elimination: number;
  nci: number;
  current_non_current?: string;
}

export interface ConsolidatedBalanceSheet {
  group_id: string;
  as_of: string;
  members: { user_id: string; name: string; ownership_pct: number; is_parent: boolean }[];
  sections: Array<{
    section: string;
    total: number;
    nci_total: number;
    subsections: Array<{
      subsection: string;
      current_non_current: string;
      total: number;
      nci_total: number;
      lines: ConsolidationLine[];
    }>;
  }>;
  minority_interest_total: number;
  eliminations_total: number;
}

export interface ConsolidatedPL {
  group_id: string;
  period_start: string;
  period_end: string;
  members: { user_id: string; name: string; ownership_pct: number; is_parent: boolean }[];
  total_revenue: number;
  total_expenses: number;
  profit_before_tax: number;
  tax_expense: number;
  profit_after_tax: number;
  minority_interest_share: number;
  eliminations_total: number;
  lines: (ConsolidationLine & { section: string; subsection: string })[];
}

export const listConsolidationGroups = async (userId: string): Promise<ConsolidationGroup[]> => {
  const { data, error } = await supabase.rpc('list_consolidation_groups', { p_owner_user_id: userId });
  if (error) { console.error('[fss] list_consolidation_groups error:', error); return []; }
  return (data as ConsolidationGroup[]) ?? [];
};

export const createConsolidationGroup = async (
  userId: string,
  name: string,
  parentUserId: string,
  fiscalYear: string,
  description?: string
): Promise<string | null> => {
  const { data, error } = await supabase
    .from('consolidation_groups')
    .insert({
      owner_user_id: userId,
      name,
      parent_user_id: parentUserId,
      fiscal_year: fiscalYear,
      description: description ?? null,
    })
    .select('id')
    .single();
  if (error) { console.error('[fss] createConsolidationGroup error:', error); throw error; }
  return (data as any)?.id ?? null;
};

export const addConsolidationMember = async (
  groupId: string,
  member: Omit<ConsolidationMember, 'id' | 'group_id'>
): Promise<void> => {
  const { error } = await supabase
    .from('consolidation_members')
    .insert({ group_id: groupId, ...member });
  if (error) { console.error('[fss] addConsolidationMember error:', error); throw error; }
};

export const removeConsolidationMember = async (memberId: string): Promise<void> => {
  const { error } = await supabase.from('consolidation_members').delete().eq('id', memberId);
  if (error) throw error;
};

export const listConsolidationMembers = async (groupId: string): Promise<ConsolidationMember[]> => {
  const { data, error } = await supabase
    .from('consolidation_members')
    .select('*')
    .eq('group_id', groupId)
    .order('is_parent', { ascending: false })
    .order('display_name');
  if (error) { console.error('[fss] listConsolidationMembers error:', error); return []; }
  return (data as ConsolidationMember[]) ?? [];
};

export const fetchConsolidatedBalanceSheet = async (
  userId: string,
  groupId: string,
  asOf: string
): Promise<ConsolidatedBalanceSheet | null> => {
  const { data, error } = await supabase.rpc('get_consolidated_balance_sheet', {
    p_owner_user_id: userId, p_group_id: groupId, p_as_of: asOf,
  });
  if (error) { console.error('[fss] consolidated BS error:', error); return null; }
  return data as ConsolidatedBalanceSheet;
};

export const fetchConsolidatedPL = async (
  userId: string,
  groupId: string,
  periodStart: string,
  periodEnd: string
): Promise<ConsolidatedPL | null> => {
  const { data, error } = await supabase.rpc('get_consolidated_pl', {
    p_owner_user_id: userId, p_group_id: groupId,
    p_period_start: periodStart, p_period_end: periodEnd,
  });
  if (error) { console.error('[fss] consolidated PL error:', error); return null; }
  return data as ConsolidatedPL;
};

export interface ConsolidatedSOCIEComponent {
  line_code: string | null;
  line_label: string | null;
  opening_parent: number;
  profit_parent: number;
  movements_parent: number;
  closing_parent: number;
  opening_nci: number;
  profit_nci: number;
  movements_nci: number;
  closing_nci: number;
  opening_gross: number;
  closing_gross: number;
}

export interface ConsolidatedSOCIE {
  group_id: string;
  period_start: string;
  period_end: string;
  members: { user_id: string; name: string; ownership_pct: number; is_parent: boolean }[];
  components: ConsolidatedSOCIEComponent[];
  totals_parent: { opening: number; profit: number; movements: number; closing: number };
  totals_nci: { opening: number; profit: number; movements: number; closing: number };
}

export const fetchConsolidatedSOCIE = async (
  userId: string,
  groupId: string,
  financialYear: string
): Promise<ConsolidatedSOCIE | null> => {
  const { start, end } = fyDates(financialYear);
  const { data, error } = await supabase.rpc('get_consolidated_socie', {
    p_owner_user_id: userId, p_group_id: groupId,
    p_period_start: start, p_period_end: end,
  });
  if (error) { console.error('[fss] consolidated SOCIE error:', error); return null; }
  return data as ConsolidatedSOCIE;
};

// ─── Statement of Changes in Equity (Phase 19) ───────────────────────────────
export interface SOCIEComponent {
  account_id: string;
  account_code: string;
  account_name: string;
  line_code: string | null;
  line_label: string | null;
  opening_balance: number;
  profit_for_period: number;
  other_movements: number;
  closing_balance: number;
}

export interface SOCIE {
  period_start: string;
  period_end: string;
  pat_for_period: number;
  components: SOCIEComponent[];
  totals: {
    opening_balance: number;
    profit_for_period: number;
    other_movements: number;
    closing_balance: number;
  };
}

export const fetchSOCIE = async (
  userId: string,
  financialYear: string
): Promise<SOCIE | null> => {
  const { start, end } = fyDates(financialYear);
  const { data, error } = await supabase.rpc('get_statement_of_changes_in_equity', {
    p_user_id: userId, p_period_start: start, p_period_end: end,
  });
  if (error) { console.error('[fss] SOCIE error:', error); return null; }
  // jsonb_agg returns NULL when zero rows match — guard the array so the UI's .length is safe
  const result = data as any;
  if (result && !Array.isArray(result.components)) result.components = [];
  if (result && !result.totals) {
    result.totals = { opening_balance: 0, profit_for_period: 0, other_movements: 0, closing_balance: 0 };
  }
  return result as SOCIE;
};

// ─── Inter-company eliminations (Phase 18 CRUD UI completion) ────────────────
export interface IntercompanyElimination {
  id?: string;
  group_id: string;
  fiscal_year: string;
  elim_type: 'intercompany_loan' | 'intercompany_sale' | 'intercompany_dividend' | 'unrealised_profit_in_stock' | 'intercompany_other';
  description: string;
  amount: number;
  line_code: string;
  affects_statement: 'BS' | 'PL' | 'BOTH';
  from_user_id: string;
  to_user_id: string;
  created_at?: string;
}

export const listEliminations = async (groupId: string, fiscalYear?: string): Promise<IntercompanyElimination[]> => {
  let q = supabase.from('intercompany_eliminations').select('*').eq('group_id', groupId);
  if (fiscalYear) q = q.eq('fiscal_year', fiscalYear);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) { console.error('[fss] listEliminations:', error); return []; }
  return (data as IntercompanyElimination[]) ?? [];
};

export const addElimination = async (
  row: Omit<IntercompanyElimination, 'id' | 'created_at'>
): Promise<void> => {
  const { error } = await supabase.from('intercompany_eliminations').insert(row);
  if (error) { console.error('[fss] addElimination:', error); throw error; }
};

export const updateElimination = async (
  id: string,
  patch: Partial<Omit<IntercompanyElimination, 'id' | 'group_id' | 'created_at'>>
): Promise<void> => {
  const { error } = await supabase.from('intercompany_eliminations').update(patch).eq('id', id);
  if (error) { console.error('[fss] updateElimination:', error); throw error; }
};

export const deleteElimination = async (id: string): Promise<void> => {
  const { error } = await supabase.from('intercompany_eliminations').delete().eq('id', id);
  if (error) throw error;
};

// ─── Ind AS Division II (Phase 20) ───────────────────────────────────────────
export interface IndASBSLine {
  line_code: string;
  label: string;
  note_no: string | null;
  amount: number;
  prev_amount: number | null;
  current_non_current?: string;
}

export interface IndASBalanceSheet {
  division: 'Division_II';
  as_of: string;
  prev_as_of: string | null;
  comparative: boolean;
  sections: Array<{
    section: string;
    total: number;
    prev_total: number | null;
    subsections: Array<{
      subsection: string;
      current_non_current: string;
      total: number;
      prev_total: number | null;
      lines: IndASBSLine[];
    }>;
  }>;
}

export interface IndASPLLine {
  line_code: string;
  section: string;
  subsection: string;
  label: string;
  note_no: string | null;
  amount: number;
  prev_amount: number;
}

export interface IndASOCILine {
  line_code: string;
  classification: 'OCI_NON_RECLASSIFIABLE' | 'OCI_RECLASSIFIABLE';
  label: string;
  note_no: string | null;
  amount: number;
  prev_amount: number;
}

export interface IndASProfitLossAndOCI {
  division: 'Division_II';
  period_start: string;
  period_end: string;
  comparative: boolean;
  total_revenue: number;
  total_expenses: number;
  profit_before_tax: number;
  tax_expense: number;
  profit_after_tax: number;
  oci_non_reclassifiable_total: number;
  oci_reclassifiable_total: number;
  total_oci: number;
  total_comprehensive_income: number;
  profit_loss_lines: IndASPLLine[];
  oci_lines: IndASOCILine[];
}

export const fetchIndASBalanceSheet = async (
  userId: string,
  financialYear: string,
  comparative = false
): Promise<IndASBalanceSheet | null> => {
  const { start, end } = fyDates(financialYear);
  const prevEnd = comparative ? `${parseInt(end.slice(0, 4), 10) - 1}-${end.slice(5)}` : null;
  const { data, error } = await supabase.rpc('get_ind_as_balance_sheet', {
    p_user_id: userId, p_as_of: end, p_prev_as_of: prevEnd,
  });
  if (error) { console.error('[fss] Ind AS BS error:', error); return null; }
  return data as IndASBalanceSheet;
};

export const fetchIndASPLandOCI = async (
  userId: string,
  financialYear: string,
  comparative = false
): Promise<IndASProfitLossAndOCI | null> => {
  const { start, end } = fyDates(financialYear);
  const { data, error } = await supabase.rpc('get_ind_as_profit_loss_and_oci', {
    p_user_id: userId, p_period_start: start, p_period_end: end, p_comparative: comparative,
  });
  if (error) { console.error('[fss] Ind AS P&L+OCI error:', error); return null; }
  return data as IndASProfitLossAndOCI;
};

// ─── Reporting division (Ind AS toggle) ──────────────────────────────────────
export const getReportingDivision = async (userId: string): Promise<'Division_I' | 'Division_II'> => {
  const { data, error } = await supabase.rpc('get_reporting_division', { p_user_id: userId });
  if (error) { console.warn('[fss] get_reporting_division error:', error); return 'Division_I'; }
  return (data as 'Division_I' | 'Division_II') ?? 'Division_I';
};

export const setReportingDivision = async (
  userId: string,
  division: 'Division_I' | 'Division_II'
): Promise<void> => {
  // Upsert into accounting_settings
  const { error } = await supabase
    .from('accounting_settings')
    .upsert({ user_id: userId, reporting_division: division }, { onConflict: 'user_id' });
  if (error) { console.error('[fss] setReportingDivision:', error); throw error; }
};

// ─── Related Party Transactions (Phase 22) ───────────────────────────────────
export type RPRelationship =
  | 'holding_company' | 'subsidiary_company' | 'fellow_subsidiary' | 'associate'
  | 'joint_venture' | 'kmp' | 'kmp_relative' | 'director' | 'director_relative'
  | 'enterprise_with_common_kmp' | 'post_employment_benefit_plan' | 'controlled_other';

export type RPTType =
  | 'sale_goods' | 'sale_services' | 'purchase_goods' | 'purchase_services'
  | 'loan_given' | 'loan_taken' | 'interest_received' | 'interest_paid'
  | 'rent_received' | 'rent_paid' | 'royalty_received' | 'royalty_paid'
  | 'dividend_received' | 'dividend_paid' | 'guarantee_given' | 'guarantee_taken'
  | 'deposit_placed' | 'deposit_received' | 'advance_given' | 'advance_received'
  | 'remuneration' | 'sitting_fees' | 'reimbursement'
  | 'sale_fixed_asset' | 'purchase_fixed_asset' | 'investment' | 'divestment' | 'other';

export interface RelatedParty {
  id?: string;
  party_name: string;
  relationship: RPRelationship;
  pan?: string | null;
  cin?: string | null;
  gstin?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  kmp_position?: string | null;
  appointment_date?: string | null;
  cessation_date?: string | null;
  is_active?: boolean;
  remarks?: string | null;
}

export interface RPTransaction {
  id?: string;
  related_party_id: string;
  transaction_date: string;
  transaction_type: RPTType;
  description: string;
  amount: number;
  is_arms_length: boolean;
  approval_required: boolean;
  approval_obtained: boolean;
  approval_date?: string | null;
  approval_reference?: string | null;
  journal_id?: string | null;
  invoice_id?: string | null;
  bill_id?: string | null;
  fiscal_year: string;
  notes?: string | null;
}

export interface RPTDisclosureSchedule {
  fiscal_year: string;
  grand_total: number;
  arms_length_total: number;
  non_arms_length_total: number;
  total_txn_count: number;
  total_pending_approvals: number;
  relationships: Array<{
    relationship: RPRelationship;
    total_amount: number;
    arms_length_amount: number;
    non_arms_length_amount: number;
    pending_approvals: number;
    txn_count: number;
    rows: Array<{
      related_party_id: string;
      party_name: string;
      transaction_type: RPTType;
      total_amount: number;
      arms_length_amount: number;
      non_arms_length_amount: number;
      txn_count: number;
      pending_approvals: number;
    }>;
  }>;
}

export const listRelatedParties = async (userId: string): Promise<RelatedParty[]> => {
  const { data, error } = await supabase
    .from('related_parties').select('*').eq('user_id', userId)
    .order('party_name');
  if (error) { console.error('[fss] listRelatedParties:', error); return []; }
  return (data as RelatedParty[]) ?? [];
};

export const upsertRelatedParty = async (userId: string, rp: RelatedParty): Promise<string | null> => {
  const payload = { ...rp, user_id: userId };
  const { data, error } = rp.id
    ? await supabase.from('related_parties').update(payload).eq('id', rp.id).select('id').single()
    : await supabase.from('related_parties').insert(payload).select('id').single();
  if (error) { console.error('[fss] upsertRelatedParty:', error); throw error; }
  return (data as any)?.id ?? null;
};

export const deleteRelatedParty = async (id: string): Promise<void> => {
  const { error } = await supabase.from('related_parties').delete().eq('id', id);
  if (error) throw error;
};

export const listRPTransactions = async (userId: string, fiscalYear: string): Promise<RPTransaction[]> => {
  const { data, error } = await supabase
    .from('related_party_transactions').select('*')
    .eq('user_id', userId).eq('fiscal_year', fiscalYear)
    .order('transaction_date', { ascending: false });
  if (error) { console.error('[fss] listRPTransactions:', error); return []; }
  return (data as RPTransaction[]) ?? [];
};

export const addRPTransaction = async (userId: string, t: RPTransaction): Promise<void> => {
  const { error } = await supabase
    .from('related_party_transactions')
    .insert({ ...t, user_id: userId });
  if (error) { console.error('[fss] addRPTransaction:', error); throw error; }
};

export const deleteRPTransaction = async (id: string): Promise<void> => {
  const { error } = await supabase.from('related_party_transactions').delete().eq('id', id);
  if (error) throw error;
};

export const fetchRPTDisclosure = async (userId: string, fiscalYear: string): Promise<RPTDisclosureSchedule | null> => {
  const { data, error } = await supabase.rpc('get_rpt_disclosure_schedule', {
    p_user_id: userId, p_fiscal_year: fiscalYear,
  });
  if (error) { console.error('[fss] RPT disclosure:', error); return null; }
  // jsonb_agg returns NULL when there are zero rows — coerce so .map / .length are safe
  const result = data as any;
  if (result && !Array.isArray(result.relationships)) result.relationships = [];
  if (result) {
    for (const rel of result.relationships) {
      if (!Array.isArray(rel.rows)) rel.rows = [];
    }
  }
  return result as RPTDisclosureSchedule;
};

// ─── Segment Reporting (Phase 22) ─────────────────────────────────────────────
export interface BusinessSegment {
  id?: string;
  segment_code: string;
  segment_name: string;
  segment_type: 'business' | 'geographical';
  driver: 'cost_center' | 'project' | 'branch' | 'department';
  driver_value: string;
  description?: string | null;
  is_reportable?: boolean;
  is_active?: boolean;
}

export interface SegmentPerformance {
  period_start: string;
  period_end: string;
  segments: Array<{
    segment_id: string;
    segment_code: string;
    segment_name: string;
    segment_type: 'business' | 'geographical';
    driver: string;
    description: string | null;
    revenue: number;
    expenses: number;
    profit: number;
    segment_assets: number;
    segment_liabilities: number;
    capex: number;
    depreciation: number;
    revenue_pct: number;
    assets_pct: number;
    is_reportable_threshold: boolean;
  }>;
  totals: {
    revenue: number;
    expenses: number;
    profit: number;
    segment_assets: number;
    segment_liabilities: number;
    capex: number;
    depreciation: number;
  };
}

export const listSegments = async (userId: string): Promise<BusinessSegment[]> => {
  const { data, error } = await supabase
    .from('business_segments').select('*').eq('user_id', userId)
    .order('segment_name');
  if (error) { console.error('[fss] listSegments:', error); return []; }
  return (data as BusinessSegment[]) ?? [];
};

export const upsertSegment = async (userId: string, seg: BusinessSegment): Promise<string | null> => {
  const payload = { ...seg, user_id: userId };
  const { data, error } = seg.id
    ? await supabase.from('business_segments').update(payload).eq('id', seg.id).select('id').single()
    : await supabase.from('business_segments').insert(payload).select('id').single();
  if (error) { console.error('[fss] upsertSegment:', error); throw error; }
  return (data as any)?.id ?? null;
};

export const deleteSegment = async (id: string): Promise<void> => {
  const { error } = await supabase.from('business_segments').delete().eq('id', id);
  if (error) throw error;
};

export const fetchSegmentPerformance = async (
  userId: string, financialYear: string
): Promise<SegmentPerformance | null> => {
  const { start, end } = fyDates(financialYear);
  const { data, error } = await supabase.rpc('get_segment_performance', {
    p_user_id: userId, p_period_start: start, p_period_end: end,
  });
  if (error) { console.error('[fss] segment performance:', error); return null; }
  // jsonb_agg returns NULL when zero segments exist — coerce so UI's .length / .map are safe
  const result = data as any;
  if (result && !Array.isArray(result.segments)) result.segments = [];
  if (result && !result.totals) {
    result.totals = {
      revenue: 0, expenses: 0, profit: 0,
      segment_assets: 0, segment_liabilities: 0,
      capex: 0, depreciation: 0,
    };
  }
  return result as SegmentPerformance;
};

// ─── CSR Module (Phase 23) ───────────────────────────────────────────────────
export type ScheduleVIIItem =
  | 'i_eradication_hunger_poverty' | 'ii_promoting_education' | 'iii_gender_equality'
  | 'iv_environmental_sustainability' | 'v_national_heritage_art_culture'
  | 'vi_armed_forces_veterans' | 'vii_training_sports' | 'viii_pm_relief_fund'
  | 'ix_technology_incubators' | 'x_rural_development' | 'xi_slum_area_development'
  | 'xii_disaster_management';

export type CSRImplementationMode =
  | 'direct' | 'implementing_agency_sec8' | 'implementing_agency_trust'
  | 'implementing_agency_society' | 'implementing_agency_govt';

export interface CSRProject {
  id?: string;
  fiscal_year: string;
  project_code: string;
  project_name: string;
  schedule_vii_item: ScheduleVIIItem;
  is_ongoing: boolean;
  implementation_mode: CSRImplementationMode;
  implementing_agency_name?: string | null;
  implementing_agency_csr_reg_no?: string | null;
  location_state?: string | null;
  location_district?: string | null;
  is_local_area?: boolean;
  budgeted_amount: number;
  status: 'planned' | 'in_progress' | 'completed' | 'dropped' | 'transferred_unspent';
  start_date?: string | null;
  expected_end_date?: string | null;
  completion_date?: string | null;
  notes?: string | null;
}

export interface CSRObligation {
  fiscal_year: string;
  applicability_threshold_met: boolean;
  applicability_declared: boolean;
  pat_preceding_fy_1: number;
  pat_preceding_fy_2: number;
  pat_preceding_fy_3: number;
  sum_3yr: number;
  average_net_profit_3yr: number;
  obligation_2pct: number;
  amount_spent: number;
  amount_transferred_to_funds: number;
  unspent_balance: number;
  compliance_status: 'compliant' | 'marginal' | 'non_compliant';
}

export interface CSRUnspentTransfer {
  id?: string;
  fiscal_year: string;
  transfer_date: string;
  amount: number;
  transfer_type: 'unspent_csr_account' | 'schedule_vii_fund';
  destination: string;
  reference_number?: string | null;
  related_project_id?: string | null;
  notes?: string | null;
}

export interface CSRAnnualReport {
  fiscal_year: string;
  obligation: CSRObligation;
  policy: {
    is_applicable: boolean;
    committee_constituted: boolean;
    committee_members: Array<{ name: string; designation: string; role: string }>;
    policy_url: string | null;
    policy_adopted_on: string | null;
    focus_areas: string[];
  };
  projects: Array<CSRProject & { project_id: string; amount_spent: number; capex_amount: number }>;
  unspent_transfers: CSRUnspentTransfer[];
  project_count: number;
  ongoing_project_count: number;
}

export const fetchCSRObligation = async (userId: string, fy: string): Promise<CSRObligation | null> => {
  const { data, error } = await supabase.rpc('compute_csr_obligation', { p_user_id: userId, p_fiscal_year: fy });
  if (error) { console.error('[fss] CSR obligation:', error); return null; }
  return data as CSRObligation;
};

export const fetchCSRAnnualReport = async (userId: string, fy: string): Promise<CSRAnnualReport | null> => {
  const { data, error } = await supabase.rpc('get_csr_annual_report', { p_user_id: userId, p_fiscal_year: fy });
  if (error) { console.error('[fss] CSR report:', error); return null; }
  return data as CSRAnnualReport;
};

export const listCSRProjects = async (userId: string, fy: string): Promise<CSRProject[]> => {
  const { data, error } = await supabase.from('csr_projects')
    .select('*').eq('user_id', userId).eq('fiscal_year', fy)
    .order('project_code');
  if (error) { console.error('[fss] listCSRProjects:', error); return []; }
  return (data as CSRProject[]) ?? [];
};

export const upsertCSRProject = async (userId: string, project: CSRProject): Promise<string | null> => {
  const payload = { ...project, user_id: userId };
  const { data, error } = project.id
    ? await supabase.from('csr_projects').update(payload).eq('id', project.id).select('id').single()
    : await supabase.from('csr_projects').insert(payload).select('id').single();
  if (error) { console.error('[fss] upsertCSRProject:', error); throw error; }
  return (data as any)?.id ?? null;
};

export const deleteCSRProject = async (id: string): Promise<void> => {
  const { error } = await supabase.from('csr_projects').delete().eq('id', id);
  if (error) throw error;
};

export const addCSRExpense = async (
  userId: string,
  projectId: string,
  fy: string,
  expenseDate: string,
  amount: number,
  description: string,
  isCapex = false
): Promise<void> => {
  const { error } = await supabase.from('csr_project_expenses').insert({
    user_id: userId,
    project_id: projectId,
    fiscal_year: fy,
    expense_date: expenseDate,
    amount,
    description,
    is_capex: isCapex,
  });
  if (error) { console.error('[fss] addCSRExpense:', error); throw error; }
};

export const addCSRUnspentTransfer = async (
  userId: string, transfer: Omit<CSRUnspentTransfer, 'id'>
): Promise<void> => {
  const { error } = await supabase.from('csr_unspent_transfers').insert({
    user_id: userId, ...transfer,
  });
  if (error) { console.error('[fss] addCSRTransfer:', error); throw error; }
};

// ─── TDS Reconciliation (Phase 24) ───────────────────────────────────────────
export interface TDS26ASImportRow {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  deductor_name: string;
  deductor_tan: string;
  tds_section?: string;
  date_of_payment?: string;
  amount_paid: number;
  tds_amount: number;
  deductor_return_status?: string;
}

export interface MatchedTDSRow {
  id: string;
  match_type: 'auto' | 'manual' | 'review';
  amount_diff: number;
  notes: string | null;
  book_id: string;
  customer_name: string;
  customer_tan: string | null;
  book_tds: number;
  invoice_date: string | null;
  book_quarter: string;
  as26_id: string;
  deductor_name: string;
  deductor_tan: string;
  as26_tds: number;
  date_of_payment: string | null;
  tds_section: string | null;
}

export interface TDSBookOnlyRow {
  id: string;
  customer_name: string;
  customer_tan: string | null;
  tds_amount: number;
  invoice_date: string | null;
  quarter: string;
  description: string | null;
}

export interface TDS26ASOnlyRow {
  id: string;
  deductor_name: string;
  deductor_tan: string;
  tds_amount: number;
  date_of_payment: string | null;
  quarter: string;
  tds_section: string | null;
  deductor_return_status: string | null;
}

export interface TDSReconciliation {
  fiscal_year: string;
  book_total: number;
  book_count: number;
  '26as_total': number;
  '26as_count': number;
  matched_count: number;
  matched_book_total: number;
  matched_26as_total: number;
  book_only_count: number;
  book_only_total: number;
  '26as_only_count': number;
  '26as_only_total': number;
  matched: MatchedTDSRow[];
  book_only: TDSBookOnlyRow[];
  '26as_only': TDS26ASOnlyRow[];
}

export const refreshTDSBookEntries = async (userId: string, fy: string): Promise<number> => {
  const { data, error } = await supabase.rpc('refresh_tds_book_entries', {
    p_user_id: userId, p_fiscal_year: fy,
  });
  if (error) { console.error('[fss] refreshTDSBookEntries:', error); throw error; }
  return (data as number) ?? 0;
};

export const autoMatchTDS = async (userId: string, fy: string): Promise<number> => {
  const { data, error } = await supabase.rpc('auto_match_tds', {
    p_user_id: userId, p_fiscal_year: fy,
  });
  if (error) { console.error('[fss] autoMatchTDS:', error); throw error; }
  return (data as number) ?? 0;
};

export const fetchTDSReconciliation = async (userId: string, fy: string): Promise<TDSReconciliation | null> => {
  const { data, error } = await supabase.rpc('reconcile_tds_with_26as', {
    p_user_id: userId, p_fiscal_year: fy,
  });
  if (error) { console.error('[fss] reconcile:', error); return null; }
  return data as TDSReconciliation;
};

export const import26ASBatch = async (
  userId: string, fy: string, assesseePan: string, rows: TDS26ASImportRow[]
): Promise<{ batch_id: string; rows_imported: number } | null> => {
  const { data, error } = await supabase.rpc('import_26as_batch', {
    p_user_id: userId, p_fiscal_year: fy, p_assessee_pan: assesseePan, p_rows: rows,
  });
  if (error) { console.error('[fss] import_26as_batch:', error); throw error; }
  return data as { batch_id: string; rows_imported: number };
};

export const manuallyMatchTDS = async (
  userId: string, bookEntryId: string, entry26asId: string, notes?: string
): Promise<void> => {
  const { error } = await supabase.from('tds_reconciliation_matches').insert({
    user_id: userId, book_entry_id: bookEntryId, entry_26as_id: entry26asId,
    match_type: 'manual', notes: notes ?? null,
  });
  if (error) { console.error('[fss] manuallyMatchTDS:', error); throw error; }
};

export const unmatchTDS = async (matchId: string): Promise<void> => {
  const { error } = await supabase.from('tds_reconciliation_matches').delete().eq('id', matchId);
  if (error) throw error;
};

// ─── CSR Policy (Phase 24 polish) ───────────────────────────────────────────
export interface CSRCommitteeMember { name: string; designation: string; role: string; }
export interface CSRPolicy {
  user_id?: string;
  is_applicable: boolean;
  applicability_reason?: string | null;
  committee_constituted: boolean;
  committee_members: CSRCommitteeMember[];
  policy_url?: string | null;
  policy_adopted_on?: string | null;
  focus_areas: string[];
}

export const fetchCSRPolicy = async (userId: string): Promise<CSRPolicy | null> => {
  const { data, error } = await supabase.from('csr_policy').select('*').eq('user_id', userId).maybeSingle();
  if (error) { console.error('[fss] fetchCSRPolicy:', error); return null; }
  return (data as CSRPolicy) ?? null;
};

export const upsertCSRPolicy = async (userId: string, policy: Partial<CSRPolicy>): Promise<void> => {
  const payload = { user_id: userId, ...policy };
  const { error } = await supabase.from('csr_policy').upsert(payload, { onConflict: 'user_id' });
  if (error) { console.error('[fss] upsertCSRPolicy:', error); throw error; }
};

// ─── Statutory Compliance Calendar + Health Score (Phase 25) ─────────────────
export interface StatutoryObligation {
  id: string;
  obligation_type: string;
  obligation_label: string;
  period: string | null;
  due_date: string;
  days_to_due: number;
  is_filed: boolean;
  is_overdue: boolean;
  days_overdue: number;
  estimated_late_fee: number;
  first_filed_date: string | null;
  filings: Array<{
    id: string;
    filed_date: string;
    acknowledgment_number: string | null;
    amount_paid: number;
    late_fee_paid: number;
    filing_url: string | null;
  }> | null;
  late_fee_per_day: number | null;
}

export interface ComplianceCalendar {
  fiscal_year: string;
  total_obligations: number;
  filed_count: number;
  overdue_count: number;
  upcoming_30d_count: number;
  total_estimated_late_fee: number;
  obligations: StatutoryObligation[];
}

export interface FinancialHealthScore {
  fiscal_year: string;
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  components: {
    integrity:  { score: number; weight: number; trial_balance_balanced: boolean; bs_equation_holds: boolean; unclassified_accounts: number };
    compliance: { score: number; weight: number; total_obligations: number; filed_obligations: number; overdue_obligations: number };
    risk:       { score: number; weight: number; critical_findings_open: number; high_findings_open: number; msme_overdue_45_plus: number; tds_book_only_total: number };
    reporting:  { score: number; weight: number; has_period_lock: boolean; has_fy_close: boolean; has_notes_to_accounts: boolean };
  };
  computed_at: string;
}

export const seedStatutoryCalendar = async (userId: string, fy: string): Promise<number> => {
  const { data, error } = await supabase.rpc('seed_statutory_calendar', { p_user_id: userId, p_fiscal_year: fy });
  if (error) { console.error('[fss] seed_statutory_calendar:', error); throw error; }
  return (data as number) ?? 0;
};

export const fetchComplianceCalendar = async (userId: string, fy: string): Promise<ComplianceCalendar | null> => {
  const { data, error } = await supabase.rpc('get_compliance_calendar', { p_user_id: userId, p_fiscal_year: fy });
  if (error) { console.error('[fss] get_compliance_calendar:', error); return null; }
  return data as ComplianceCalendar;
};

export const fetchHealthScore = async (userId: string, fy: string): Promise<FinancialHealthScore | null> => {
  const { data, error } = await supabase.rpc('get_financial_health_score', { p_user_id: userId, p_fiscal_year: fy });
  if (error) { console.error('[fss] get_financial_health_score:', error); return null; }
  return data as FinancialHealthScore;
};

export const recordFiling = async (
  userId: string, obligationId: string,
  filedDate: string, ackNumber?: string,
  amountPaid?: number, lateFeePaid?: number, filingUrl?: string
): Promise<void> => {
  const { error } = await supabase.from('statutory_filings').insert({
    user_id: userId, obligation_id: obligationId,
    filed_date: filedDate, acknowledgment_number: ackNumber ?? null,
    amount_paid: amountPaid ?? 0, late_fee_paid: lateFeePaid ?? 0,
    filing_url: filingUrl ?? null,
  });
  if (error) { console.error('[fss] recordFiling:', error); throw error; }
};

export const deleteFiling = async (filingId: string): Promise<void> => {
  const { error } = await supabase.from('statutory_filings').delete().eq('id', filingId);
  if (error) throw error;
};

export const getFinancialYearOptions = (): string[] => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const fyStart = currentMonth >= 3 ? currentYear : currentYear - 1;

  return Array.from({ length: 5 }, (_, i) => {
    const start = fyStart - i;
    const end = (start + 1).toString().slice(-2);
    return `${start}-${end}`;
  });
};

// ════════════════════════════════════════════════════════════════════════════
// PHASE 26 — Unified Financial Engine
// ════════════════════════════════════════════════════════════════════════════

export interface UnifiedDashboard {
  fiscal_year: string;
  period_start: string;
  period_end: string;
  financial: {
    revenue: number; expenses: number; profit: number; cash: number; margin_pct: number;
  };
  gst: {
    output_tax: number; input_tax: number; net_liability: number;
    itc_eligible: number; itc_blocked: number; itc_claimed: number; itc_pending: number;
    itc_leakage: number;
  };
  ap: { total: number; overdue: number };
  ar: { total: number; overdue: number; collection_efficiency_pct: number };
  assets: { value: number; accumulated_depreciation: number; net_book_value: number };
  liabilities: { outstanding: number; next_month_emi: number };
  integrity: { open_findings: number; critical: number };
}

export const fetchUnifiedDashboard = async (
  userId: string, fiscalYear: string,
): Promise<UnifiedDashboard | null> => {
  const { data, error } = await supabase.rpc('get_unified_financial_dashboard', {
    p_user_id: userId, p_fiscal_year: fiscalYear,
  });
  if (error) { console.error('[fss] unified dashboard:', error); return null; }
  return data as UnifiedDashboard;
};

export interface IntegrityFinding {
  id: string;
  scan_run_id: string;
  fiscal_year: string;
  finding_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  entity_type: string | null;
  entity_id: string | null;
  entity_ref: string | null;
  amount: number | null;
  message: string;
  details: Record<string, unknown>;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  created_at: string;
}

export interface IntegrityScanResult {
  scan_run_id: string;
  fiscal_year: string;
  period_start: string;
  period_end: string;
  total: number; critical: number; high: number; medium: number; low: number;
  ran_at: string;
}

export const runIntegrityScan = async (
  userId: string, fiscalYear: string,
): Promise<IntegrityScanResult | null> => {
  const { data, error } = await supabase.rpc('run_financial_integrity_scan', {
    p_user_id: userId, p_fiscal_year: fiscalYear,
  });
  if (error) { console.error('[fss] integrity scan:', error); throw error; }
  return data as IntegrityScanResult;
};

export const fetchOpenIntegrityFindings = async (
  userId: string, fiscalYear: string,
): Promise<IntegrityFinding[]> => {
  const { data, error } = await supabase
    .from('financial_integrity_findings')
    .select('*')
    .eq('user_id', userId)
    .eq('fiscal_year', fiscalYear)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) { console.error('[fss] open findings:', error); return []; }
  return (data as IntegrityFinding[]) ?? [];
};

export const acknowledgeIntegrityFinding = async (
  findingId: string,
  newStatus: 'acknowledged' | 'resolved' | 'dismissed',
): Promise<void> => {
  const { error } = await supabase
    .from('financial_integrity_findings')
    .update({
      status: newStatus,
      resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null,
    })
    .eq('id', findingId);
  if (error) throw error;
};

export interface CfoInsightItem {
  metric: string;
  direction: 'up' | 'down' | 'flat' | 'opportunity';
  change_pct?: number;
  message: string;
}

export interface CfoRiskyVendor {
  vendor_name: string; bill_count: number; gst_at_risk: number; risk_reason: string;
}

export interface CfoSlowCustomer {
  customer: string; outstanding: number; avg_days_overdue: number; invoice_count: number;
}

export interface CfoRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  action: string;
  detail: string;
}

export interface CfoInsights {
  fiscal_year: string;
  generated_at: string;
  insights: CfoInsightItem[];
  risky_vendors: CfoRiskyVendor[];
  slow_customers: CfoSlowCustomer[];
  recommendations: CfoRecommendation[];
}

export const fetchCfoInsights = async (
  userId: string, fiscalYear: string,
): Promise<CfoInsights | null> => {
  const { data, error } = await supabase.rpc('get_cfo_insights', {
    p_user_id: userId, p_fiscal_year: fiscalYear,
  });
  if (error) { console.error('[fss] cfo insights:', error); return null; }
  return data as CfoInsights;
};

export interface ReconciliationRow {
  domain: 'gst_2b' | 'ar' | 'ap' | 'inventory' | 'bank' | 'tds_26as';
  period: string;
  books_amount: number;
  external_amount: number;
  matched_amount: number;
  variance: number;
  match_pct: number | null;
  open_items: number;
  last_run_at: string;
  health: 'no_data' | 'perfect' | 'good' | 'warning' | 'critical';
}

export const fetchReconciliationStatus = async (userId: string): Promise<ReconciliationRow[]> => {
  const { data, error } = await supabase.rpc('get_reconciliation_status', { p_user_id: userId });
  if (error) { console.error('[fss] reconciliation status:', error); return []; }
  return (data as ReconciliationRow[]) ?? [];
};

export const autoClassifyItcForBill = async (
  userId: string, billId: string,
): Promise<{ bill_id: string; status: string; reason: string | null; classified: number } | null> => {
  const { data, error } = await supabase.rpc('auto_classify_itc_for_bill', {
    p_user_id: userId, p_bill_id: billId,
  });
  if (error) { console.error('[fss] auto classify itc:', error); return null; }
  return data as { bill_id: string; status: string; reason: string | null; classified: number };
};

// ════════════════════════════════════════════════════════════════════════════
// PHASE 27 — Engine Runtime (Reconciliation refresh, ITC Dashboard, Expense Routing)
// ════════════════════════════════════════════════════════════════════════════

export interface ReconciliationRefreshResult {
  domains_refreshed: number;
  fiscal_year: string;
  period_mtd: string;
  ran_at: string;
}

export const refreshReconciliationStatus = async (
  userId: string,
): Promise<ReconciliationRefreshResult | null> => {
  const { data, error } = await supabase.rpc('refresh_reconciliation_status', {
    p_user_id: userId,
  });
  if (error) { console.error('[fss] refresh reconciliation:', error); throw error; }
  return data as ReconciliationRefreshResult;
};

export interface ItcByComponent {
  component: 'cgst' | 'sgst' | 'igst' | 'utgst' | 'cess';
  eligible: number;
  claimed: number;
  blocked: number;
}

export interface ItcByStatus {
  status: 'eligible' | 'blocked' | 'partial' | 'rcm' | 'claimed' | 'reversed' | 'pending';
  amount: number;
  count: number;
}

export interface ItcVendorRisk {
  vendor: string;
  unclaimed_itc: number;
  bill_count: number;
  oldest_days: number;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
}

export interface ItcDashboard {
  fiscal_year: string;
  total_available: number;
  claimed: number;
  unclaimed: number;
  blocked: number;
  rcm: number;
  reversed: number;
  leakage: number;
  by_component: ItcByComponent[];
  by_status: ItcByStatus[];
  vendor_risk: ItcVendorRisk[];
  generated_at: string;
}

export const fetchItcDashboard = async (
  userId: string, fiscalYear: string,
): Promise<ItcDashboard | null> => {
  const { data, error } = await supabase.rpc('get_itc_dashboard', {
    p_user_id: userId, p_fiscal_year: fiscalYear,
  });
  if (error) { console.error('[fss] itc dashboard:', error); return null; }
  return data as ItcDashboard;
};

export interface ExpenseRoutingHints {
  useful_life_months?: number;
  prepaid_months?: number;
  is_inventory?: boolean;
  is_cwip?: boolean;
  is_blocked_itc?: boolean;
  gst_treatment?: 'eligible_itc' | 'blocked_itc' | 'rcm' | 'exempt' | 'composition';
  cost_center_id?: string | null;
  project_id?: string | null;
}

export interface ExpenseRoutingResult {
  expense_id: string;
  routed_as: 'fixed_asset' | 'expense' | 'inventory_purchase' | 'prepaid_expense' | 'cwip' | 'blocked';
  reason: string;
  amount: number;
  gst_treatment: string;
  capitalization_threshold: number;
}

export const routeExpense = async (
  userId: string,
  expenseId: string,
  capitalizationThreshold: number = 5000,
  hints: ExpenseRoutingHints = {},
): Promise<ExpenseRoutingResult | null> => {
  const { data, error } = await supabase.rpc('route_expense', {
    p_user_id: userId,
    p_expense_id: expenseId,
    p_capitalization_threshold: capitalizationThreshold,
    p_hints: hints,
  });
  if (error) { console.error('[fss] route expense:', error); throw error; }
  return data as ExpenseRoutingResult;
};
