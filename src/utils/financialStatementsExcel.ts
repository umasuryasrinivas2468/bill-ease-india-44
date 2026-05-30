import * as XLSX from 'xlsx';
import {
  FinancialData,
  CashFlowStatement,
  FinancialRatios,
  NotesToAccounts,
  CompanyDetails,
} from '@/services/financialStatementsService';

type Row = (string | number | null)[];

const FALLBACK_HEADER: Row = ['Particulars', 'Note No.', 'Current Period (₹)', 'Previous Period (₹)'];

const r2 = (n: number | null | undefined): number => {
  if (n === null || n === undefined || isNaN(Number(n))) return 0;
  return Math.round(Number(n) * 100) / 100;
};

const num = (n: number | null | undefined): number | null =>
  n === null || n === undefined ? null : Math.round(Number(n) * 100) / 100;

const fyLabel = (fy: string) => `FY ${fy}`;

const sheetFromRows = (rows: Row[], colWidths: number[] = []) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (colWidths.length) ws['!cols'] = colWidths.map(w => ({ wch: w }));
  return ws;
};

// ── Balance Sheet sheet ──────────────────────────────────────────────────────
const buildBSSheet = (fd: FinancialData, fy: string, company: CompanyDetails): XLSX.WorkSheet => {
  const rows: Row[] = [
    [`SCHEDULE III BALANCE SHEET — ${company.companyName || ''}`],
    [`As at 31-Mar-${fy.split('-')[0] ? Number(fy.split('-')[0]) + 1 : ''}`],
    [],
    ['Particulars', 'Note', `${fyLabel(fy)} (₹)`],
    ['I. EQUITY AND LIABILITIES', '', null],
    ['  (1) Shareholders Funds', '', null],
    ['      Share Capital', '2',  r2(fd.shareCapital)],
    ['      Reserves & Surplus', '3', r2(fd.reservesAndSurplus)],
    ['  (2) Non-Current Liabilities', '', null],
    ['      Long-term Borrowings', '4', r2(fd.longTermBorrowings)],
    ['      Deferred Tax Liabilities (Net)', '5', r2(fd.deferredTaxLiabilities)],
    ['      Long-term Provisions', '7', r2(fd.longTermProvisions)],
    ['  (3) Current Liabilities', '', null],
    ['      Short-term Borrowings', '8', r2(fd.shortTermBorrowings)],
    ['      Trade Payables', '9', r2(fd.tradePayables)],
    ['      Other Current Liabilities', '10', r2(fd.otherCurrentLiabilities)],
    ['      Short-term Provisions', '11', r2(fd.shortTermProvisions)],
    ['  TOTAL EQUITY & LIABILITIES', '', r2(fd.totalEquityAndLiabilities)],
    [],
    ['II. ASSETS', '', null],
    ['  (1) Non-current Assets', '', null],
    ['      Tangible Assets', '12', r2(fd.tangibleAssets)],
    ['      Intangible Assets', '12', r2(fd.intangibleAssets)],
    ['      Capital Work-in-Progress', '12', r2(fd.capitalWorkInProgress)],
    ['      Non-current Investments', '13', r2(fd.nonCurrentInvestments)],
    ['      Deferred Tax Assets (Net)', '14', r2(fd.deferredTaxAssets)],
    ['      Long-term Loans & Advances', '15', r2(fd.longTermLoansAndAdvances)],
    ['  (2) Current Assets', '', null],
    ['      Inventories', '18', r2(fd.inventories)],
    ['      Trade Receivables', '19', r2(fd.tradeReceivables)],
    ['      Cash & Cash Equivalents', '20', r2(fd.cashAndBank)],
    ['      Short-term Loans & Advances', '21', r2(fd.shortTermLoansAndAdvances)],
    ['      Other Current Assets', '22', r2(fd.otherCurrentAssets)],
    ['  TOTAL ASSETS', '', r2(fd.totalAssets)],
  ];
  return sheetFromRows(rows, [50, 8, 22]);
};

// ── P&L sheet ────────────────────────────────────────────────────────────────
const buildPLSheet = (fd: FinancialData, fy: string, company: CompanyDetails): XLSX.WorkSheet => {
  const rows: Row[] = [
    [`STATEMENT OF PROFIT & LOSS — ${company.companyName || ''}`],
    [`For the year ended 31-Mar-${fy.split('-')[0] ? Number(fy.split('-')[0]) + 1 : ''}`],
    [],
    ['Particulars', 'Note', `${fyLabel(fy)} (₹)`],
    ['I.   Revenue from Operations',                23, r2(fd.revenueFromOperations)],
    ['II.  Other Income',                           24, r2(fd.otherIncome)],
    ['III. Total Revenue (I + II)',                 '', r2(fd.totalRevenue)],
    [],
    ['IV.  Expenses', '', null],
    ['     Cost of Materials Consumed',             25, r2(fd.costOfMaterialsConsumed)],
    ['     Purchases of Stock-in-Trade',            25, r2(fd.purchaseOfStockInTrade)],
    ['     Changes in Inventories',                 26, r2(fd.changesInInventories)],
    ['     Employee Benefit Expenses',              27, r2(fd.employeeBenefitExpense)],
    ['     Finance Costs',                          28, r2(fd.financialCosts)],
    ['     Depreciation & Amortisation',            29, r2(fd.depreciationExpense)],
    ['     Other Expenses',                         30, r2(fd.otherExpenses)],
    ['     Total Expenses',                         '', r2(fd.totalExpenses)],
    [],
    ['V.   Profit / (Loss) Before Tax',             '', r2(fd.profitBeforeTax)],
    ['VI.  Tax Expense',                            31, r2(fd.taxExpense)],
    ['VII. Profit / (Loss) for the Period',         '', r2(fd.profitAfterTax)],
  ];
  return sheetFromRows(rows, [44, 8, 22]);
};

// ── Cash Flow sheet ──────────────────────────────────────────────────────────
const buildCFSSheet = (cfs: CashFlowStatement, company: CompanyDetails): XLSX.WorkSheet => {
  const rows: Row[] = [
    [`CASH FLOW STATEMENT — ${company.companyName || ''}`],
    [`Period: ${cfs.period_start} → ${cfs.period_end} (Indirect Method)`],
    [],
    ['Particulars', 'Amount (₹)'],
    ['A. Cash from Operating Activities', null],
    ...cfs.operating.lines.map<Row>(l => [`   ${l.label}`, num(l.amount)]),
    ['', null],
    ['B. Cash from Investing Activities', null],
    ...cfs.investing.lines.map<Row>(l => [`   ${l.label}`, num(l.amount)]),
    ['', null],
    ['C. Cash from Financing Activities', null],
    ...cfs.financing.lines.map<Row>(l => [`   ${l.label}`, num(l.amount)]),
    ['', null],
    ['Net Change in Cash & Cash Equivalents (A + B + C)', num(cfs.net_change)],
    ['Opening Cash & Cash Equivalents',                    num(cfs.opening_cash)],
    ['Closing Cash & Cash Equivalents',                    num(cfs.closing_cash)],
    ['Reconciliation Difference',                          num(cfs.reconciliation_diff)],
  ];
  return sheetFromRows(rows, [60, 22]);
};

// ── Ratios sheet ─────────────────────────────────────────────────────────────
const buildRatiosSheet = (r: FinancialRatios, fy: string): XLSX.WorkSheet => {
  const rows: Row[] = [
    [`RATIO ANALYSIS — ${fyLabel(fy)}`],
    [`Period: ${r.period_start} → ${r.period_end}`],
    [],
    ['Category', 'Ratio', 'Value', 'Unit'],

    ['Liquidity', 'Current Ratio',     num(r.liquidity.current_ratio), 'x'],
    ['Liquidity', 'Quick Ratio',       num(r.liquidity.quick_ratio),   'x'],
    ['Liquidity', 'Cash Ratio',        num(r.liquidity.cash_ratio),    'x'],
    ['Liquidity', 'Working Capital',   num(r.liquidity.working_capital), '₹'],

    ['Leverage',  'Debt-to-Equity',    num(r.leverage.debt_to_equity),    'x'],
    ['Leverage',  'LT Debt-to-Equity', num(r.leverage.lt_debt_to_equity), 'x'],
    ['Leverage',  'Interest Coverage', num(r.leverage.interest_coverage), 'x'],
    ['Leverage',  'Total Debt',        num(r.leverage.total_debt),        '₹'],
    ['Leverage',  'Net Worth',         num(r.leverage.net_worth),         '₹'],

    ['Profitability', 'Gross Profit Margin',     num(r.profitability.gross_profit_margin_pct), '%'],
    ['Profitability', 'Operating Profit Margin', num(r.profitability.operating_profit_margin_pct), '%'],
    ['Profitability', 'Net Profit Margin',       num(r.profitability.net_profit_margin_pct), '%'],
    ['Profitability', 'Return on Assets',        num(r.profitability.return_on_assets_pct), '%'],
    ['Profitability', 'Return on Equity',        num(r.profitability.return_on_equity_pct), '%'],
    ['Profitability', 'Return on Capital Employed', num(r.profitability.return_on_capital_employed_pct), '%'],
    ['Profitability', 'EBITDA',                  num(r.profitability.ebitda), '₹'],
    ['Profitability', 'PAT',                     num(r.profitability.pat),    '₹'],

    ['Efficiency', 'Asset Turnover',         num(r.efficiency.asset_turnover),         'x'],
    ['Efficiency', 'Receivables Turnover',   num(r.efficiency.receivables_turnover),   'x'],
    ['Efficiency', 'Inventory Turnover',     num(r.efficiency.inventory_turnover),     'x'],
    ['Efficiency', 'Payables Turnover',      num(r.efficiency.payables_turnover),      'x'],
    ['Efficiency', 'Receivable Days',        num(r.efficiency.receivable_days),        'days'],
    ['Efficiency', 'Inventory Days',         num(r.efficiency.inventory_days),         'days'],
    ['Efficiency', 'Payable Days',           num(r.efficiency.payable_days),           'days'],
    ['Efficiency', 'Cash Conversion Cycle',  num(r.efficiency.cash_conversion_cycle),  'days'],

    ['Composition', 'Total Assets',              num(r.composition.total_assets),         '₹'],
    ['Composition', 'Current Assets',            num(r.composition.current_assets),       '₹'],
    ['Composition', 'Non-Current Assets',        num(r.composition.non_current_assets),   '₹'],
    ['Composition', 'Current Liabilities',       num(r.composition.current_liabilities),  '₹'],
    ['Composition', 'Non-Current Liabilities',   num(r.composition.non_current_liabilities), '₹'],
    ['Composition', 'Equity',                    num(r.composition.equity),               '₹'],
    ['Composition', 'Share Capital',             num(r.composition.share_capital),        '₹'],
    ['Composition', 'Reserves & Surplus',        num(r.composition.reserves_and_surplus), '₹'],
  ];
  return sheetFromRows(rows, [18, 30, 18, 8]);
};

// ── Notes sheet ──────────────────────────────────────────────────────────────
const buildNotesSheet = (notes: NotesToAccounts, fy: string, company: CompanyDetails): XLSX.WorkSheet => {
  const rows: Row[] = [
    [`NOTES TO ACCOUNTS — ${company.companyName || ''} — ${fyLabel(fy)}`],
    [],
    ['Note No.', 'Title', 'Body'],
    ...notes.notes.map<Row>(n => [
      n.note_no,
      n.title,
      (n.body || '').replace(/[#*]/g, ''),
    ]),
  ];
  return sheetFromRows(rows, [10, 40, 90]);
};

// ── Public API ──────────────────────────────────────────────────────────────
export interface ExcelExportInput {
  fy: string;
  company: CompanyDetails;
  financialData?: FinancialData | null;
  cashFlow?: CashFlowStatement | null;
  ratios?: FinancialRatios | null;
  notes?: NotesToAccounts | null;
}

export const exportFinancialStatementsExcel = (input: ExcelExportInput): void => {
  const wb = XLSX.utils.book_new();

  if (input.financialData) {
    XLSX.utils.book_append_sheet(wb, buildBSSheet(input.financialData, input.fy, input.company),   'Balance Sheet');
    XLSX.utils.book_append_sheet(wb, buildPLSheet(input.financialData, input.fy, input.company),   'Profit & Loss');
  }
  if (input.cashFlow) {
    XLSX.utils.book_append_sheet(wb, buildCFSSheet(input.cashFlow, input.company), 'Cash Flow');
  }
  if (input.ratios) {
    XLSX.utils.book_append_sheet(wb, buildRatiosSheet(input.ratios, input.fy), 'Ratios');
  }
  if (input.notes && input.notes.notes.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildNotesSheet(input.notes, input.fy, input.company), 'Notes');
  }

  const filename = `Financial_Statements_${(input.company.companyName || 'Company').replace(/\s+/g, '_')}_FY${input.fy}.xlsx`;
  XLSX.writeFile(wb, filename);
};
