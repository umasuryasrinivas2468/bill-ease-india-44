import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FinancialData,
  CashFlowStatement,
  FinancialRatios,
  NotesToAccounts,
  FixedAssetSchedule,
  CompanyDetails,
  fetchFixedAssetSchedule,
  fetchCashFlowStatement,
  fetchFinancialRatios,
  fetchNotesToAccounts,
  fetchAPAgingSchedule,
  fetchARAgingSchedule,
  APAgingSchedule,
  ARAgingSchedule,
} from '@/services/financialStatementsService';

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmtINR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '';
  if (n === 0) return '-';
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return n < 0 ? `(${abs})` : abs;
};

const fmtPct = (n: number | null | undefined): string =>
  n === null || n === undefined || isNaN(n) ? '—' : `${n.toFixed(2)}%`;

const fmtRatio = (n: number | null | undefined, dp = 2): string =>
  n === null || n === undefined || isNaN(n) ? '—' : n.toFixed(dp);

const HEADER_FILL: [number, number, number] = [40, 40, 40];

const addSectionHeader = (doc: jsPDF, title: string, subtitle?: string) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.addPage();
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 18, { align: 'center' });
  if (subtitle) {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(subtitle, pageWidth / 2, 24, { align: 'center' });
  }
  doc.setLineWidth(0.4);
  doc.line(14, 28, pageWidth - 14, 28);
  return 32; // Y position to continue from
};

// ─── Per-section renderers ──────────────────────────────────────────────────
const renderCoverPage = (doc: jsPDF, company: CompanyDetails, fy: string) => {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  doc.setFontSize(24); doc.setFont('helvetica', 'bold');
  doc.text('AUDIT WORKING PAPERS', w / 2, h / 2 - 30, { align: 'center' });

  doc.setFontSize(14); doc.setFont('helvetica', 'normal');
  doc.text(company.companyName || '—', w / 2, h / 2 - 15, { align: 'center' });
  doc.text(`Financial Year ${fy}`, w / 2, h / 2 - 6, { align: 'center' });

  doc.setFontSize(10);
  if (company.cin) doc.text(`CIN: ${company.cin}`, w / 2, h / 2 + 4, { align: 'center' });
  if (company.pan) doc.text(`PAN: ${company.pan}`, w / 2, h / 2 + 10, { align: 'center' });

  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, w / 2, h - 20, { align: 'center' });
  doc.text('Schedule III · Companies Act, 2013 · Indian GAAP', w / 2, h - 14, { align: 'center' });
  doc.setTextColor(0);
};

const renderIndex = (doc: jsPDF) => {
  let y = addSectionHeader(doc, 'INDEX', 'Contents of this audit working papers package');
  const items = [
    'Section 1 — Schedule III Balance Sheet',
    'Section 2 — Schedule III Statement of Profit & Loss',
    'Section 3 — Cash Flow Statement (Indirect Method)',
    'Section 4 — Fixed Asset Schedule (Note 12)',
    'Section 5 — Trade Receivables Aging (Note 19)',
    'Section 6 — Trade Payables Aging + MSME (Note 9)',
    'Section 7 — Ratio Analysis',
    'Section 8 — Notes to Accounts',
  ];
  doc.setFontSize(11);
  items.forEach((item, i) => {
    doc.text(`${i + 1}.   ${item}`, 20, y);
    y += 8;
  });
};

const renderBS = (doc: jsPDF, fd: FinancialData, fy: string) => {
  const y = addSectionHeader(doc, 'BALANCE SHEET', `As at 31-Mar-${parseInt(fy.split('-')[0]) + 1}`);
  autoTable(doc, {
    startY: y,
    head: [['Particulars', 'Note', `FY ${fy} (₹)`]],
    body: [
      ['I. EQUITY AND LIABILITIES', '', ''],
      ['  (1) Shareholders Funds', '', ''],
      ['      Share Capital',                            '2',  fmtINR(fd.shareCapital)],
      ['      Reserves & Surplus',                       '3',  fmtINR(fd.reservesAndSurplus)],
      ['  (2) Non-Current Liabilities', '', ''],
      ['      Long-term Borrowings',                     '4',  fmtINR(fd.longTermBorrowings)],
      ['      Deferred Tax Liabilities (Net)',           '5',  fmtINR(fd.deferredTaxLiabilities)],
      ['      Long-term Provisions',                     '7',  fmtINR(fd.longTermProvisions)],
      ['  (3) Current Liabilities', '', ''],
      ['      Short-term Borrowings',                    '8',  fmtINR(fd.shortTermBorrowings)],
      ['      Trade Payables',                           '9',  fmtINR(fd.tradePayables)],
      ['      Other Current Liabilities',                '10', fmtINR(fd.otherCurrentLiabilities)],
      ['      Short-term Provisions',                    '11', fmtINR(fd.shortTermProvisions)],
      ['  TOTAL EQUITY & LIABILITIES',                   '',   fmtINR(fd.totalEquityAndLiabilities)],
      ['', '', ''],
      ['II. ASSETS', '', ''],
      ['  (1) Non-current Assets', '', ''],
      ['      Tangible Assets',                          '12', fmtINR(fd.tangibleAssets)],
      ['      Intangible Assets',                        '12', fmtINR(fd.intangibleAssets)],
      ['      Capital Work-in-Progress',                 '12', fmtINR(fd.capitalWorkInProgress)],
      ['      Non-current Investments',                  '13', fmtINR(fd.nonCurrentInvestments)],
      ['      Deferred Tax Assets (Net)',                '14', fmtINR(fd.deferredTaxAssets)],
      ['      Long-term Loans & Advances',               '15', fmtINR(fd.longTermLoansAndAdvances)],
      ['  (2) Current Assets', '', ''],
      ['      Inventories',                              '18', fmtINR(fd.inventories)],
      ['      Trade Receivables',                        '19', fmtINR(fd.tradeReceivables)],
      ['      Cash & Cash Equivalents',                  '20', fmtINR(fd.cashAndBank)],
      ['      Short-term Loans & Advances',              '21', fmtINR(fd.shortTermLoansAndAdvances)],
      ['      Other Current Assets',                     '22', fmtINR(fd.otherCurrentAssets)],
      ['  TOTAL ASSETS',                                 '',   fmtINR(fd.totalAssets)],
    ],
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: 255 },
    columnStyles: { 0: { cellWidth: 110 }, 1: { halign: 'center', cellWidth: 18 }, 2: { halign: 'right' } },
  });
};

const renderPL = (doc: jsPDF, fd: FinancialData, fy: string) => {
  const y = addSectionHeader(doc, 'STATEMENT OF PROFIT & LOSS', `For the year ended 31-Mar-${parseInt(fy.split('-')[0]) + 1}`);
  autoTable(doc, {
    startY: y,
    head: [['Particulars', 'Note', `FY ${fy} (₹)`]],
    body: [
      ['I.   Revenue from Operations',                23, fmtINR(fd.revenueFromOperations)],
      ['II.  Other Income',                           24, fmtINR(fd.otherIncome)],
      ['III. Total Revenue (I + II)',                 '', fmtINR(fd.totalRevenue)],
      ['IV.  Expenses', '', ''],
      ['     Cost of Materials Consumed',             25, fmtINR(fd.costOfMaterialsConsumed)],
      ['     Purchases of Stock-in-Trade',            25, fmtINR(fd.purchaseOfStockInTrade)],
      ['     Changes in Inventories',                 26, fmtINR(fd.changesInInventories)],
      ['     Employee Benefit Expenses',              27, fmtINR(fd.employeeBenefitExpense)],
      ['     Finance Costs',                          28, fmtINR(fd.financialCosts)],
      ['     Depreciation & Amortisation',            29, fmtINR(fd.depreciationExpense)],
      ['     Other Expenses',                         30, fmtINR(fd.otherExpenses)],
      ['     Total Expenses',                         '', fmtINR(fd.totalExpenses)],
      ['V.   Profit / (Loss) Before Tax',             '', fmtINR(fd.profitBeforeTax)],
      ['VI.  Tax Expense',                            31, fmtINR(fd.taxExpense)],
      ['VII. Profit / (Loss) for the Period',         '', fmtINR(fd.profitAfterTax)],
    ],
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: 255 },
    columnStyles: { 0: { cellWidth: 110 }, 1: { halign: 'center', cellWidth: 18 }, 2: { halign: 'right' } },
  });
};

const renderCFS = (doc: jsPDF, cfs: CashFlowStatement) => {
  const y = addSectionHeader(doc, 'CASH FLOW STATEMENT', `Indirect Method · ${cfs.period_start} → ${cfs.period_end}`);
  const body: (string | number | null)[][] = [];
  body.push(['A. Cash from Operating Activities', null]);
  cfs.operating.lines.forEach(l => body.push([`   ${l.label}`, l.amount === null ? '' : fmtINR(l.amount)]));
  body.push(['', '']);
  body.push(['B. Cash from Investing Activities', null]);
  cfs.investing.lines.forEach(l => body.push([`   ${l.label}`, l.amount === null ? '' : fmtINR(l.amount)]));
  body.push(['', '']);
  body.push(['C. Cash from Financing Activities', null]);
  cfs.financing.lines.forEach(l => body.push([`   ${l.label}`, l.amount === null ? '' : fmtINR(l.amount)]));
  body.push(['', '']);
  body.push(['Net Change in Cash & Cash Equivalents (A+B+C)', fmtINR(cfs.net_change)]);
  body.push(['Opening Cash & Cash Equivalents',               fmtINR(cfs.opening_cash)]);
  body.push(['Closing Cash & Cash Equivalents',               fmtINR(cfs.closing_cash)]);
  body.push(['Reconciliation Difference',                     fmtINR(cfs.reconciliation_diff)]);

  autoTable(doc, {
    startY: y,
    head: [['Particulars', 'Amount (₹)']],
    body: body as any,
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: 255 },
    columnStyles: { 0: { cellWidth: 130 }, 1: { halign: 'right' } },
  });
};

const renderFASchedule = (doc: jsPDF, fa: FixedAssetSchedule) => {
  const y = addSectionHeader(doc, 'FIXED ASSET SCHEDULE — NOTE 12', `FY ${fa.fy_start} → ${fa.fy_end}`);
  autoTable(doc, {
    startY: y,
    head: [['Category', 'Opening', 'Additions', 'Disposals', 'Closing Gross', 'Accum Dep', 'Net Block']],
    body: fa.by_category.map(c => [
      c.category,
      fmtINR(c.opening_gross),
      fmtINR(c.additions),
      fmtINR(c.disposals_gross),
      fmtINR(c.closing_gross),
      fmtINR(c.accumulated_dep),
      fmtINR(c.closing_net_block),
    ]).concat([[
      'TOTAL',
      fmtINR(fa.total_opening),
      fmtINR(fa.total_additions),
      fmtINR(fa.total_disposals),
      fmtINR(fa.total_opening + fa.total_additions - fa.total_disposals),
      fmtINR(fa.total_accum_dep),
      fmtINR(fa.total_closing_net),
    ]]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: 255 },
    columnStyles: { 0: { cellWidth: 38 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
  });
};

const renderARAging = (doc: jsPDF, ar: ARAgingSchedule) => {
  const y = addSectionHeader(doc, 'TRADE RECEIVABLES AGING — NOTE 19', 'Outstanding amounts by aging bucket');
  autoTable(doc, {
    startY: y,
    head: [['Bucket', 'Amount (₹)']],
    body: [
      ['Not Due',                fmtINR(ar.not_due)],
      ['Outstanding 1–180 days', fmtINR(ar.days_1_180)],
      ['181–365 days',           fmtINR(ar.days_181_365)],
      ['1–2 years',              fmtINR(ar.years_1_to_2)],
      ['2–3 years',              fmtINR(ar.years_2_to_3)],
      ['> 3 years',              fmtINR(ar.over_3_years)],
      ['Total Outstanding',      fmtINR(ar.total_outstanding)],
    ],
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: 255 },
    columnStyles: { 0: { cellWidth: 80 }, 1: { halign: 'right' } },
  });
};

const renderAPAging = (doc: jsPDF, ap: APAgingSchedule) => {
  const y = addSectionHeader(doc, 'TRADE PAYABLES AGING + MSME — NOTE 9', 'Section 22 MSMED Act disclosure');
  autoTable(doc, {
    startY: y,
    head: [['Bucket', 'Amount (₹)']],
    body: [
      ['Not Due',                       fmtINR(ap.not_due)],
      ['1–365 days',                    fmtINR(ap.days_1_365)],
      ['1–2 years',                     fmtINR(ap.years_1_to_2)],
      ['2–3 years',                     fmtINR(ap.years_2_to_3)],
      ['> 3 years',                     fmtINR(ap.over_3_years)],
      ['Total Outstanding',             fmtINR(ap.total_outstanding)],
      ['', ''],
      ['MSME Total Outstanding',        fmtINR(ap.msme_total_outstanding)],
      ['MSME Overdue > 45 days (Sec 22)', fmtINR(ap.msme_overdue_45_plus)],
      ['Non-MSME Total Outstanding',    fmtINR(ap.non_msme_total_outstanding)],
    ],
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: 255 },
    columnStyles: { 0: { cellWidth: 80 }, 1: { halign: 'right' } },
  });
};

const renderRatios = (doc: jsPDF, r: FinancialRatios) => {
  const y = addSectionHeader(doc, 'RATIO ANALYSIS', `Period: ${r.period_start} → ${r.period_end}`);
  autoTable(doc, {
    startY: y,
    head: [['Category', 'Ratio', 'Value', 'Unit']],
    body: [
      ['Liquidity',     'Current Ratio',            fmtRatio(r.liquidity.current_ratio), 'x'],
      ['Liquidity',     'Quick Ratio',              fmtRatio(r.liquidity.quick_ratio),   'x'],
      ['Liquidity',     'Cash Ratio',               fmtRatio(r.liquidity.cash_ratio),    'x'],
      ['Liquidity',     'Working Capital',          fmtINR(r.liquidity.working_capital), '₹'],
      ['Leverage',      'Debt-to-Equity',           fmtRatio(r.leverage.debt_to_equity), 'x'],
      ['Leverage',      'Interest Coverage',        fmtRatio(r.leverage.interest_coverage), 'x'],
      ['Leverage',      'Net Worth',                fmtINR(r.leverage.net_worth),        '₹'],
      ['Profitability', 'Gross Profit Margin',      fmtPct(r.profitability.gross_profit_margin_pct), '%'],
      ['Profitability', 'Net Profit Margin',        fmtPct(r.profitability.net_profit_margin_pct),   '%'],
      ['Profitability', 'Return on Equity',         fmtPct(r.profitability.return_on_equity_pct),    '%'],
      ['Profitability', 'EBITDA',                   fmtINR(r.profitability.ebitda),                   '₹'],
      ['Profitability', 'PAT',                      fmtINR(r.profitability.pat),                      '₹'],
      ['Efficiency',    'Receivable Days',          fmtRatio(r.efficiency.receivable_days, 0),        'days'],
      ['Efficiency',    'Inventory Days',           fmtRatio(r.efficiency.inventory_days, 0),         'days'],
      ['Efficiency',    'Payable Days',             fmtRatio(r.efficiency.payable_days, 0),           'days'],
      ['Efficiency',    'Cash Conversion Cycle',    fmtRatio(r.efficiency.cash_conversion_cycle, 0),  'days'],
    ],
    styles: { fontSize: 8, cellPadding: 1.3 },
    headStyles: { fillColor: HEADER_FILL, textColor: 255 },
    columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 70 }, 2: { halign: 'right' }, 3: { halign: 'center', cellWidth: 18 } },
  });
};

const renderNotes = (doc: jsPDF, notes: NotesToAccounts) => {
  const y = addSectionHeader(doc, 'NOTES TO ACCOUNTS', `${notes.notes.length} notes`);
  const pageW = doc.internal.pageSize.getWidth();
  let cursorY = y;
  notes.notes.forEach((n) => {
    if (cursorY > 260) {
      doc.addPage();
      cursorY = 20;
    }
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(`Note ${n.note_no}: ${n.title}`, 14, cursorY);
    cursorY += 5;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    const body = (n.body || '').replace(/[#*]/g, '');
    const wrapped = doc.splitTextToSize(body, pageW - 28);
    doc.text(wrapped, 14, cursorY);
    cursorY += wrapped.length * 3.5 + 4;
  });
};

// ─── Public API ─────────────────────────────────────────────────────────────
export interface AuditPackageInput {
  userId: string;
  fiscalYear: string;
  company: CompanyDetails;
  financialData: FinancialData;
}

export const generateAuditWorkingPapersPDF = async (input: AuditPackageInput): Promise<void> => {
  // Fetch every supporting schedule in parallel
  const [cfs, fa, ar, ap, ratios, notes] = await Promise.all([
    fetchCashFlowStatement(input.userId, input.fiscalYear),
    fetchFixedAssetSchedule(input.userId, input.fiscalYear),
    fetchARAgingSchedule(input.userId),
    fetchAPAgingSchedule(input.userId),
    fetchFinancialRatios(input.userId, input.fiscalYear),
    fetchNotesToAccounts(input.userId, input.fiscalYear),
  ]);

  const doc = new jsPDF('p', 'mm', 'a4');
  renderCoverPage(doc, input.company, input.fiscalYear);
  renderIndex(doc);
  renderBS(doc, input.financialData, input.fiscalYear);
  renderPL(doc, input.financialData, input.fiscalYear);
  if (cfs)    renderCFS(doc, cfs);
  if (fa)     renderFASchedule(doc, fa);
  if (ar)     renderARAging(doc, ar);
  if (ap)     renderAPAging(doc, ap);
  if (ratios) renderRatios(doc, ratios);
  if (notes && notes.notes.length > 0) renderNotes(doc, notes);

  const filename = `Audit_Working_Papers_${(input.company.companyName || 'Company').replace(/\s+/g, '_')}_FY${input.fiscalYear}.pdf`;
  doc.save(filename);
};
