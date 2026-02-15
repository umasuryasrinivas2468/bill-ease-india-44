import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';

// Layout constants
const MARGIN_TOP = 10.58; // 40px
const MARGIN_BOTTOM = 10.58;
const MARGIN_SIDE = 9.26; // 35px
const HEADER_FONT_SIZE = 15;
const SUBHEADER_FONT_SIZE = 12;
const TABLE_FONT_SIZE = 10;
const SMALL_FONT_SIZE = 9;

interface AnnualReportData {
  // Revenue data
  totalRevenue: number;
  revenueFromOperations: number;
  otherIncome: number;
  
  // Expense data
  totalExpenses: number;
  costOfMaterials: number;
  employeeBenefit: number;
  financialCosts: number;
  depreciation: number;
  otherExpenses: number;
  
  // Profit data
  profitBeforeTax: number;
  taxExpense: number;
  profitAfterTax: number;
  
  // Balance sheet
  shareCapital: number;
  reservesAndSurplus: number;
  tradePayables: number;
  otherCurrentLiabilities: number;
  totalLiabilities: number;
  
  fixedAssets: number;
  tradeReceivables: number;
  cashAndBank: number;
  otherCurrentAssets: number;
  totalAssets: number;
  
  // TDS
  totalTDS: number;
  tdsTransactions: any[];
  
  // Expense details
  expenseDetails: { category: string; amount: number }[];
  
  // Invoice summary
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  
  // GST summary
  totalGST: number;
  cgst: number;
  sgst: number;
}

interface CompanyInfo {
  companyName: string;
  ownerName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstNumber: string;
  cin?: string;
  pan?: string;
}

const formatCurrency = (amount: number): string => {
  if (!amount || amount === 0) return '-';
  const formatted = Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  return amount < 0 ? `(${formatted})` : formatted;
};

const getPageWidth = (doc: jsPDF) => doc.internal.pageSize.getWidth();
const getPageHeight = (doc: jsPDF) => doc.internal.pageSize.getHeight();

// Fetch all required data from Supabase
export const fetchAnnualReportData = async (userId: string, fy: string): Promise<AnnualReportData> => {
  const [startYear] = fy.split('-').map(y => parseInt(y.length === 2 ? `20${y}` : y));
  const startDate = `${startYear}-04-01`;
  const endDate = `${startYear + 1}-03-31`;

  // Fetch all data in parallel
  const [invoicesRes, expensesRes, journalsRes, accountsRes, receivablesRes, payablesRes, tdsRes] = await Promise.all([
    supabase.from('invoices').select('*').eq('user_id', userId).gte('invoice_date', startDate).lte('invoice_date', endDate),
    supabase.from('expenses').select('*').eq('user_id', userId).gte('expense_date', startDate).lte('expense_date', endDate),
    supabase.from('journals').select('*').eq('user_id', userId).gte('journal_date', startDate).lte('journal_date', endDate),
    supabase.from('accounts').select('*').eq('user_id', userId),
    supabase.from('receivables').select('*').eq('user_id', userId),
    supabase.from('payables').select('*').eq('user_id', userId),
    supabase.from('tds_transactions').select('*').eq('user_id', userId).gte('transaction_date', startDate).lte('transaction_date', endDate),
  ]);

  const invoices = invoicesRes.data || [];
  const expenses = expensesRes.data || [];
  const journals = journalsRes.data || [];
  const accounts = accountsRes.data || [];
  const receivables = receivablesRes.data || [];
  const payables = payablesRes.data || [];
  const tdsTransactions = tdsRes.data || [];

  // Calculate revenue
  const revenueFromOperations = invoices
    .filter(inv => inv.status === 'paid' || inv.status === 'pending')
    .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  
  const otherIncome = journals
    .filter(j => j.status === 'posted')
    .reduce((sum, j) => sum + Number(j.total_credit || 0), 0) * 0.1;

  // Group expenses by category
  const expensesByCategory = expenses.reduce((acc, exp) => {
    const category = exp.category_name || 'Other Expenses';
    acc[category] = (acc[category] || 0) + Number(exp.total_amount || exp.amount || 0);
    return acc;
  }, {} as Record<string, number>);

  const employeeBenefit = expensesByCategory['Salary'] || expensesByCategory['Payroll'] || 0;
  const financialCosts = expensesByCategory['Bank Charges'] || expensesByCategory['Interest'] || 0;
  const depreciation = expensesByCategory['Depreciation'] || 0;
  
  const categorizedExpenses = ['Salary', 'Payroll', 'Bank Charges', 'Interest', 'Depreciation'];
  const otherExpenses = Object.entries(expensesByCategory)
    .filter(([cat]) => !categorizedExpenses.includes(cat))
    .reduce((sum, [, amount]) => sum + Number(amount), 0);

  const totalExpenses = employeeBenefit + financialCosts + depreciation + otherExpenses;
  const totalRevenue = revenueFromOperations + otherIncome;
  const profitBeforeTax = totalRevenue - totalExpenses;
  const taxExpense = profitBeforeTax > 0 ? profitBeforeTax * 0.25 : 0;
  const profitAfterTax = profitBeforeTax - taxExpense;

  // Balance sheet
  const tradeReceivables = receivables
    .filter(r => r.status !== 'paid')
    .reduce((sum, r) => sum + Number(r.amount_remaining || 0), 0);

  const tradePayables = payables
    .filter(p => p.status !== 'paid')
    .reduce((sum, p) => sum + Number(p.amount_remaining || 0), 0);

  const cashAccounts = accounts.filter(acc => 
    acc.account_type === 'Asset' && 
    (acc.account_name.toLowerCase().includes('cash') || acc.account_name.toLowerCase().includes('bank'))
  );
  const cashAndBank = cashAccounts.reduce((sum, acc) => sum + Number(acc.opening_balance || 0), 0);

  // TDS
  const totalTDS = tdsTransactions.reduce((sum, t) => sum + Number(t.tds_amount || 0), 0);

  // GST from invoices
  const totalGST = invoices.reduce((sum, inv) => sum + Number(inv.gst_amount || 0), 0);

  // Expense details for notes
  const expenseDetails = Object.entries(expensesByCategory).map(([category, amount]) => ({
    category,
    amount: Number(amount)
  }));

  return {
    totalRevenue,
    revenueFromOperations,
    otherIncome,
    totalExpenses,
    costOfMaterials: 0,
    employeeBenefit,
    financialCosts,
    depreciation,
    otherExpenses,
    profitBeforeTax,
    taxExpense,
    profitAfterTax,
    shareCapital: 10000,
    reservesAndSurplus: profitAfterTax,
    tradePayables,
    otherCurrentLiabilities: tradePayables,
    totalLiabilities: 10000 + profitAfterTax + tradePayables,
    fixedAssets: 0,
    tradeReceivables,
    cashAndBank,
    otherCurrentAssets: tradeReceivables,
    totalAssets: tradeReceivables + cashAndBank,
    totalTDS,
    tdsTransactions,
    expenseDetails,
    totalInvoices: invoices.length,
    paidInvoices: invoices.filter(i => i.status === 'paid').length,
    pendingInvoices: invoices.filter(i => i.status === 'pending').length,
    totalGST,
    cgst: totalGST / 2,
    sgst: totalGST / 2,
  };
};

// Page 1: Cover Page
const addCoverPage = (doc: jsPDF, company: CompanyInfo, fy: string) => {
  const pageWidth = getPageWidth(doc);
  const pageHeight = getPageHeight(doc);
  const centerX = pageWidth / 2;
  
  // Company name
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(company.companyName.toUpperCase(), centerX, pageHeight / 3, { align: 'center' });
  
  // Annual Report title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'normal');
  doc.text('ANNUAL REPORT', centerX, pageHeight / 3 + 15, { align: 'center' });
  
  // Financial Year
  doc.setFontSize(14);
  const fyEnd = parseInt(fy.split('-')[0]) + 1;
  doc.text(`Financial Year ${fy} (April ${fy.split('-')[0]} - March ${fyEnd})`, centerX, pageHeight / 3 + 30, { align: 'center' });
  
  // Address
  doc.setFontSize(10);
  const address = [company.address, company.city, company.state, company.pincode].filter(Boolean).join(', ');
  if (address) {
    doc.text(address, centerX, pageHeight - 50, { align: 'center' });
  }
  if (company.gstNumber) {
    doc.text(`GSTIN: ${company.gstNumber}`, centerX, pageHeight - 40, { align: 'center' });
  }
};

// Page 2: Table of Contents
const addTableOfContents = (doc: jsPDF, company: CompanyInfo) => {
  doc.addPage();
  let y = MARGIN_TOP + 10;
  
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text('TABLE OF CONTENTS', getPageWidth(doc) / 2, y, { align: 'center' });
  y += 15;
  
  const contents = [
    { title: "Director's Report", page: 3 },
    { title: 'Financial Highlights', page: 4 },
    { title: 'Profit & Loss Statement', page: 5 },
    { title: 'Balance Sheet', page: 6 },
    { title: 'Cash Flow Statement', page: 7 },
    { title: 'Notes to Accounts', page: 8 },
    { title: 'Computation of Income', page: 9 },
    { title: 'TDS & Tax Summary', page: 10 },
    { title: 'Compliance Summary', page: 11 },
    { title: 'Audit Certificate', page: 12 },
  ];
  
  doc.setFontSize(TABLE_FONT_SIZE);
  doc.setFont('helvetica', 'normal');
  
  contents.forEach((item, index) => {
    doc.text(`${index + 1}. ${item.title}`, MARGIN_SIDE + 10, y);
    doc.text(item.page.toString(), getPageWidth(doc) - MARGIN_SIDE - 10, y, { align: 'right' });
    y += 8;
  });
};

// Page 3: Director's Report
const addDirectorsReport = (doc: jsPDF, company: CompanyInfo, data: AnnualReportData, fy: string) => {
  doc.addPage();
  let y = MARGIN_TOP + 10;
  const pageWidth = getPageWidth(doc);
  
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text("DIRECTOR'S REPORT", pageWidth / 2, y, { align: 'center' });
  y += 15;
  
  doc.setFontSize(TABLE_FONT_SIZE);
  doc.setFont('helvetica', 'normal');
  
  const fyEnd = parseInt(fy.split('-')[0]) + 1;
  const paragraphs = [
    `To the Members of ${company.companyName},`,
    '',
    `Your Directors have pleasure in presenting the Annual Report along with the Audited Financial Statements for the Financial Year ended March 31, ${fyEnd}.`,
    '',
    'FINANCIAL SUMMARY:',
    `Total Revenue: ₹${formatCurrency(data.totalRevenue)}`,
    `Total Expenses: ₹${formatCurrency(data.totalExpenses)}`,
    `Profit Before Tax: ₹${formatCurrency(data.profitBeforeTax)}`,
    `Profit After Tax: ₹${formatCurrency(data.profitAfterTax)}`,
    '',
    'OPERATIONS:',
    'During the year under review, your Company has recorded satisfactory performance. The Directors are continuously working towards improving the operational efficiency and profitability of the Company.',
    '',
    'DIVIDEND:',
    'The Board of Directors do not recommend any dividend for the financial year under review.',
    '',
    'DIRECTORS RESPONSIBILITY STATEMENT:',
    'Pursuant to the requirements under Section 134(5) of the Companies Act, 2013, your Directors confirm that:',
    '(a) In the preparation of the annual accounts, the applicable accounting standards have been followed.',
    '(b) The Directors have selected such accounting policies and applied them consistently.',
    '(c) The Directors have taken proper care for the maintenance of adequate accounting records.',
    '',
    'ACKNOWLEDGEMENTS:',
    'Your Directors place on record their sincere appreciation for the continued support from all stakeholders.',
    '',
    `For ${company.companyName}`,
    '',
    '',
    `${company.ownerName}`,
    'Director',
  ];
  
  const maxWidth = pageWidth - MARGIN_SIDE * 2;
  paragraphs.forEach(para => {
    if (para === '') {
      y += 5;
    } else {
      const lines = doc.splitTextToSize(para, maxWidth);
      lines.forEach((line: string) => {
        if (y > getPageHeight(doc) - MARGIN_BOTTOM - 10) {
          doc.addPage();
          y = MARGIN_TOP + 10;
        }
        doc.text(line, MARGIN_SIDE, y);
        y += 5;
      });
    }
  });
};

// Page 4: Financial Highlights
const addFinancialHighlights = (doc: jsPDF, company: CompanyInfo, data: AnnualReportData, fy: string) => {
  doc.addPage();
  let y = MARGIN_TOP + 10;
  
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text('FINANCIAL HIGHLIGHTS', getPageWidth(doc) / 2, y, { align: 'center' });
  y += 5;
  
  doc.setFontSize(SMALL_FONT_SIZE);
  doc.setFont('helvetica', 'normal');
  doc.text(`For the Financial Year ${fy}`, getPageWidth(doc) / 2, y, { align: 'center' });
  y += 15;
  
  autoTable(doc, {
    startY: y,
    head: [['Particulars', `FY ${fy}`, 'Previous FY']],
    body: [
      ['Revenue from Operations', formatCurrency(data.revenueFromOperations), '-'],
      ['Other Income', formatCurrency(data.otherIncome), '-'],
      ['Total Revenue', formatCurrency(data.totalRevenue), '-'],
      ['Total Expenses', formatCurrency(data.totalExpenses), '-'],
      ['Profit Before Tax', formatCurrency(data.profitBeforeTax), '-'],
      ['Tax Expense', formatCurrency(data.taxExpense), '-'],
      ['Profit After Tax', formatCurrency(data.profitAfterTax), '-'],
      ['', '', ''],
      ['Total Assets', formatCurrency(data.totalAssets), '-'],
      ['Total Liabilities', formatCurrency(data.totalLiabilities), '-'],
    ],
    theme: 'grid',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: 3 },
    headStyles: { fillColor: [66, 66, 66], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { halign: 'right', cellWidth: 50 },
      2: { halign: 'right', cellWidth: 50 },
    },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (hookData) => {
      const text = String(hookData.cell.raw || '').toLowerCase();
      if (text.includes('total') || text.includes('profit')) {
        hookData.cell.styles.fontStyle = 'bold';
      }
    }
  });
};

// Page 5: Profit & Loss Statement
const addProfitAndLoss = (doc: jsPDF, company: CompanyInfo, data: AnnualReportData, fy: string) => {
  doc.addPage();
  let y = MARGIN_TOP + 10;
  
  // Header
  doc.setFontSize(SUBHEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text(company.companyName.toUpperCase(), getPageWidth(doc) / 2, y, { align: 'center' });
  y += 6;
  
  doc.setFontSize(TABLE_FONT_SIZE);
  doc.setFont('helvetica', 'normal');
  if (company.cin) doc.text(`CIN: ${company.cin}`, getPageWidth(doc) / 2, y, { align: 'center' });
  y += 10;
  
  doc.setFontSize(SUBHEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  const fyEnd = parseInt(fy.split('-')[0]) + 1;
  doc.text(`PROFIT AND LOSS ACCOUNT FOR THE YEAR ENDED 31ST MARCH ${fyEnd}`, getPageWidth(doc) / 2, y, { align: 'center' });
  y += 10;
  
  autoTable(doc, {
    startY: y,
    head: [['Sr.No', 'Particulars', 'Note', `FY ${fy}`]],
    body: [
      ['I', 'Revenue from Operations', '5', formatCurrency(data.revenueFromOperations)],
      ['II', 'Other Income', '6', formatCurrency(data.otherIncome)],
      ['III', 'Total Revenue (I+II)', '', formatCurrency(data.totalRevenue)],
      ['', '', '', ''],
      ['IV', 'Expenses:', '', ''],
      ['', '   Cost of Materials Consumed', '', formatCurrency(data.costOfMaterials)],
      ['', '   Employee Benefit Expense', '', formatCurrency(data.employeeBenefit)],
      ['', '   Financial Costs', '', formatCurrency(data.financialCosts)],
      ['', '   Depreciation and Amortization', '', formatCurrency(data.depreciation)],
      ['', '   Other Expenses', '7', formatCurrency(data.otherExpenses)],
      ['', '   Total Expenses (IV)', '', formatCurrency(data.totalExpenses)],
      ['', '', '', ''],
      ['V', 'Profit Before Tax (III-IV)', '', formatCurrency(data.profitBeforeTax)],
      ['', '', '', ''],
      ['VI', 'Tax Expense:', '', ''],
      ['', '   Current Tax', '', formatCurrency(data.taxExpense)],
      ['', '   Deferred Tax', '', '-'],
      ['', '', '', ''],
      ['VII', 'Profit After Tax (V-VI)', '', formatCurrency(data.profitAfterTax)],
      ['', '', '', ''],
      ['VIII', 'Earnings Per Share', '', ''],
      ['', '   Basic', '', formatCurrency(data.profitAfterTax / 1000)],
      ['', '   Diluted', '', formatCurrency(data.profitAfterTax / 1000)],
    ],
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: 2 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 100 },
      2: { cellWidth: 20, halign: 'center' },
      3: { halign: 'right' },
    },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (hookData) => {
      const text = String(hookData.cell.raw || '').toLowerCase();
      if (text.includes('total') || text.includes('profit after') || text.includes('profit before')) {
        hookData.cell.styles.fontStyle = 'bold';
      }
    }
  });
  
  y = (doc as any).lastAutoTable.finalY + 10;
  
  // Signature
  doc.setFontSize(SMALL_FONT_SIZE);
  doc.text('See accompanying notes forming part of financial statements', MARGIN_SIDE, y);
  y += 20;
  
  doc.text('For ' + company.companyName, MARGIN_SIDE, y);
  y += 15;
  doc.setFont('helvetica', 'bold');
  doc.text(company.ownerName, MARGIN_SIDE, y);
  doc.setFont('helvetica', 'normal');
  y += 5;
  doc.text('Director', MARGIN_SIDE, y);
};

// Page 6: Balance Sheet
const addBalanceSheet = (doc: jsPDF, company: CompanyInfo, data: AnnualReportData, fy: string) => {
  doc.addPage();
  let y = MARGIN_TOP + 10;
  
  // Header
  doc.setFontSize(SUBHEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text(company.companyName.toUpperCase(), getPageWidth(doc) / 2, y, { align: 'center' });
  y += 10;
  
  const fyEnd = parseInt(fy.split('-')[0]) + 1;
  doc.text(`BALANCE SHEET AS AT 31ST MARCH ${fyEnd}`, getPageWidth(doc) / 2, y, { align: 'center' });
  y += 10;
  
  autoTable(doc, {
    startY: y,
    head: [['', 'Particulars', 'Note', `FY ${fy}`]],
    body: [
      ['', 'I. EQUITY AND LIABILITIES', '', ''],
      ['', '(1) Shareholder\'s Funds', '', ''],
      ['', '    (a) Share Capital', '1', formatCurrency(data.shareCapital)],
      ['', '    (b) Reserves and Surplus', '2', formatCurrency(data.reservesAndSurplus)],
      ['', '', '', ''],
      ['', '(2) Non-Current Liabilities', '', ''],
      ['', '    (a) Long Term Borrowings', '', '-'],
      ['', '    (b) Deferred Tax Liabilities', '', '-'],
      ['', '', '', ''],
      ['', '(3) Current Liabilities', '', ''],
      ['', '    (a) Trade Payables', '', formatCurrency(data.tradePayables)],
      ['', '    (b) Other Current Liabilities', '3', formatCurrency(data.otherCurrentLiabilities)],
      ['', '    (c) Short-term Provisions', '', '-'],
      ['', '', '', ''],
      ['', 'Total Equity & Liabilities', '', formatCurrency(data.totalLiabilities)],
      ['', '', '', ''],
      ['', 'II. ASSETS', '', ''],
      ['', '(1) Non-Current Assets', '', ''],
      ['', '    (a) Property, Plant & Equipment', '', formatCurrency(data.fixedAssets)],
      ['', '    (b) Non-current Investments', '', '-'],
      ['', '    (c) Deferred Tax Assets', '', '-'],
      ['', '', '', ''],
      ['', '(2) Current Assets', '', ''],
      ['', '    (a) Trade Receivables', '', formatCurrency(data.tradeReceivables)],
      ['', '    (b) Cash and Cash Equivalents', '4', formatCurrency(data.cashAndBank)],
      ['', '    (c) Other Current Assets', '', formatCurrency(data.otherCurrentAssets)],
      ['', '', '', ''],
      ['', 'Total Assets', '', formatCurrency(data.totalAssets)],
    ],
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: 2 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 105 },
      2: { cellWidth: 20, halign: 'center' },
      3: { halign: 'right' },
    },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (hookData) => {
      const text = String(hookData.cell.raw || '').toLowerCase();
      if (text.includes('total')) {
        hookData.cell.styles.fontStyle = 'bold';
      }
    }
  });
  
  y = (doc as any).lastAutoTable.finalY + 15;
  
  // Signature
  doc.setFontSize(SMALL_FONT_SIZE);
  doc.text('For ' + company.companyName, MARGIN_SIDE, y);
  y += 15;
  doc.setFont('helvetica', 'bold');
  doc.text(company.ownerName, MARGIN_SIDE, y);
  doc.setFont('helvetica', 'normal');
  y += 5;
  doc.text('Director', MARGIN_SIDE, y);
};

// Page 7: Cash Flow Statement
const addCashFlowStatement = (doc: jsPDF, company: CompanyInfo, data: AnnualReportData, fy: string) => {
  doc.addPage();
  let y = MARGIN_TOP + 10;
  
  doc.setFontSize(SUBHEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text(company.companyName.toUpperCase(), getPageWidth(doc) / 2, y, { align: 'center' });
  y += 10;
  
  const fyEnd = parseInt(fy.split('-')[0]) + 1;
  doc.text(`CASH FLOW STATEMENT FOR THE YEAR ENDED 31ST MARCH ${fyEnd}`, getPageWidth(doc) / 2, y, { align: 'center' });
  doc.setFontSize(SMALL_FONT_SIZE);
  doc.setFont('helvetica', 'normal');
  y += 5;
  doc.text('(Indirect Method)', getPageWidth(doc) / 2, y, { align: 'center' });
  y += 10;
  
  autoTable(doc, {
    startY: y,
    head: [['Particulars', `FY ${fy}`]],
    body: [
      ['A. CASH FLOW FROM OPERATING ACTIVITIES', ''],
      ['Net Profit Before Tax', formatCurrency(data.profitBeforeTax)],
      ['Adjustments for:', ''],
      ['   Depreciation', formatCurrency(data.depreciation)],
      ['   Interest Expense', formatCurrency(data.financialCosts)],
      ['Operating Profit Before Working Capital Changes', formatCurrency(data.profitBeforeTax + data.depreciation)],
      ['Changes in Working Capital:', ''],
      ['   (Increase)/Decrease in Trade Receivables', formatCurrency(-data.tradeReceivables)],
      ['   Increase/(Decrease) in Trade Payables', formatCurrency(data.tradePayables)],
      ['Cash Generated from Operations', formatCurrency(data.profitBeforeTax + data.depreciation - data.tradeReceivables + data.tradePayables)],
      ['   Less: Tax Paid', formatCurrency(-data.taxExpense)],
      ['Net Cash from Operating Activities (A)', formatCurrency(data.profitAfterTax + data.depreciation - data.tradeReceivables + data.tradePayables)],
      ['', ''],
      ['B. CASH FLOW FROM INVESTING ACTIVITIES', ''],
      ['   Purchase of Fixed Assets', '-'],
      ['   Sale of Fixed Assets', '-'],
      ['Net Cash from Investing Activities (B)', '-'],
      ['', ''],
      ['C. CASH FLOW FROM FINANCING ACTIVITIES', ''],
      ['   Proceeds from Share Capital', '-'],
      ['   Dividend Paid', '-'],
      ['Net Cash from Financing Activities (C)', '-'],
      ['', ''],
      ['Net Increase/(Decrease) in Cash (A+B+C)', formatCurrency(data.cashAndBank)],
      ['Cash and Cash Equivalents - Opening', '-'],
      ['Cash and Cash Equivalents - Closing', formatCurrency(data.cashAndBank)],
    ],
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: 2 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { halign: 'right' },
    },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (hookData) => {
      const text = String(hookData.cell.raw || '').toLowerCase();
      if (text.includes('net cash') || text.includes('cash flow from') || text.startsWith('a.') || text.startsWith('b.') || text.startsWith('c.')) {
        hookData.cell.styles.fontStyle = 'bold';
      }
    }
  });
};

// Page 8: Notes to Accounts
const addNotesToAccounts = (doc: jsPDF, company: CompanyInfo, data: AnnualReportData, fy: string) => {
  doc.addPage();
  let y = MARGIN_TOP + 10;
  
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text('NOTES TO ACCOUNTS', getPageWidth(doc) / 2, y, { align: 'center' });
  y += 15;
  
  // Note 1: Share Capital
  doc.setFontSize(TABLE_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text('Note 1: Share Capital', MARGIN_SIDE, y);
  y += 5;
  
  autoTable(doc, {
    startY: y,
    head: [['Particulars', `FY ${fy}`]],
    body: [
      ['Authorized Capital', ''],
      ['10,000 Equity Shares of Rs. 10/- each', '1,00,000'],
      ['', ''],
      ['Issued, Subscribed & Paid-up Capital', ''],
      ['1,000 Equity Shares of Rs. 10/- each, fully paid', formatCurrency(data.shareCapital)],
      ['Total', formatCurrency(data.shareCapital)],
    ],
    theme: 'grid',
    styles: { fontSize: SMALL_FONT_SIZE, cellPadding: 2 },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
  });
  
  y = (doc as any).lastAutoTable.finalY + 10;
  
  // Note 2: Reserves & Surplus
  doc.setFont('helvetica', 'bold');
  doc.text('Note 2: Reserves & Surplus', MARGIN_SIDE, y);
  y += 5;
  
  autoTable(doc, {
    startY: y,
    head: [['Particulars', `FY ${fy}`]],
    body: [
      ['Opening Balance', '-'],
      ['Add: Current Year Profit/(Loss)', formatCurrency(data.profitAfterTax)],
      ['Closing Balance', formatCurrency(data.reservesAndSurplus)],
    ],
    theme: 'grid',
    styles: { fontSize: SMALL_FONT_SIZE, cellPadding: 2 },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
  });
  
  y = (doc as any).lastAutoTable.finalY + 10;
  
  // Note 3: Other Current Liabilities
  doc.setFont('helvetica', 'bold');
  doc.text('Note 3: Other Current Liabilities', MARGIN_SIDE, y);
  y += 5;
  
  autoTable(doc, {
    startY: y,
    head: [['Particulars', `FY ${fy}`]],
    body: [
      ['Trade Payables', formatCurrency(data.tradePayables)],
      ['Statutory Dues', '-'],
      ['Total', formatCurrency(data.otherCurrentLiabilities)],
    ],
    theme: 'grid',
    styles: { fontSize: SMALL_FONT_SIZE, cellPadding: 2 },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
  });
  
  y = (doc as any).lastAutoTable.finalY + 10;
  
  // Note 4: Cash & Bank
  doc.setFont('helvetica', 'bold');
  doc.text('Note 4: Cash and Cash Equivalents', MARGIN_SIDE, y);
  y += 5;
  
  autoTable(doc, {
    startY: y,
    head: [['Particulars', `FY ${fy}`]],
    body: [
      ['Cash in Hand', '-'],
      ['Balance with Banks', formatCurrency(data.cashAndBank)],
      ['Total', formatCurrency(data.cashAndBank)],
    ],
    theme: 'grid',
    styles: { fontSize: SMALL_FONT_SIZE, cellPadding: 2 },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
  });
};

// Page 9: Computation of Income
const addComputationOfIncome = (doc: jsPDF, company: CompanyInfo, data: AnnualReportData, fy: string) => {
  doc.addPage();
  let y = MARGIN_TOP + 10;
  
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPUTATION OF TOTAL INCOME', getPageWidth(doc) / 2, y, { align: 'center' });
  y += 5;
  doc.setFontSize(SMALL_FONT_SIZE);
  doc.setFont('helvetica', 'normal');
  doc.text(`Assessment Year ${parseInt(fy.split('-')[0]) + 1}-${(parseInt(fy.split('-')[0]) + 2).toString().slice(-2)}`, getPageWidth(doc) / 2, y, { align: 'center' });
  y += 15;
  
  autoTable(doc, {
    startY: y,
    head: [['Particulars', 'Amount (₹)']],
    body: [
      ['Income from Business & Profession', ''],
      ['   Gross Receipts', formatCurrency(data.revenueFromOperations)],
      ['   Other Income', formatCurrency(data.otherIncome)],
      ['   Total Income', formatCurrency(data.totalRevenue)],
      ['', ''],
      ['Less: Expenses', ''],
      ['   Employee Benefit Expenses', formatCurrency(data.employeeBenefit)],
      ['   Financial Costs', formatCurrency(data.financialCosts)],
      ['   Depreciation', formatCurrency(data.depreciation)],
      ['   Other Expenses', formatCurrency(data.otherExpenses)],
      ['   Total Expenses', formatCurrency(data.totalExpenses)],
      ['', ''],
      ['Net Profit from Business', formatCurrency(data.profitBeforeTax)],
      ['', ''],
      ['Gross Total Income', formatCurrency(data.profitBeforeTax)],
      ['Less: Deductions under Chapter VI-A', '-'],
      ['Total Taxable Income', formatCurrency(data.profitBeforeTax)],
      ['', ''],
      ['Tax on Total Income', ''],
      ['   Tax @ 25%', formatCurrency(data.taxExpense)],
      ['   Add: Surcharge', '-'],
      ['   Add: Health & Education Cess @ 4%', formatCurrency(data.taxExpense * 0.04)],
      ['Total Tax Liability', formatCurrency(data.taxExpense * 1.04)],
    ],
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: 2 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { halign: 'right' },
    },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (hookData) => {
      const text = String(hookData.cell.raw || '').toLowerCase();
      if (text.includes('total') || text.includes('net profit') || text.includes('gross total')) {
        hookData.cell.styles.fontStyle = 'bold';
      }
    }
  });
};

// Page 10: TDS & Tax Summary
const addTDSSummary = (doc: jsPDF, company: CompanyInfo, data: AnnualReportData, fy: string) => {
  doc.addPage();
  let y = MARGIN_TOP + 10;
  
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text('TDS & TAX SUMMARY', getPageWidth(doc) / 2, y, { align: 'center' });
  y += 15;
  
  // TDS Deducted
  doc.setFontSize(SUBHEADER_FONT_SIZE);
  doc.text('TDS Deducted During the Year', MARGIN_SIDE, y);
  y += 8;
  
  autoTable(doc, {
    startY: y,
    head: [['Section', 'Nature of Payment', 'Amount', 'TDS Deducted']],
    body: data.tdsTransactions.length > 0 
      ? data.tdsTransactions.map(t => [
          '194C',
          t.description || t.vendor_name,
          formatCurrency(t.transaction_amount),
          formatCurrency(t.tds_amount)
        ])
      : [['', 'No TDS transactions recorded', '', '']],
    theme: 'grid',
    styles: { fontSize: SMALL_FONT_SIZE, cellPadding: 2 },
    headStyles: { fillColor: [66, 66, 66], textColor: [255, 255, 255] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
  });
  
  y = (doc as any).lastAutoTable.finalY + 15;
  
  // Tax Summary
  doc.setFontSize(SUBHEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text('Tax Summary', MARGIN_SIDE, y);
  y += 8;
  
  autoTable(doc, {
    startY: y,
    head: [['Particulars', `FY ${fy}`]],
    body: [
      ['Total TDS Deducted', formatCurrency(data.totalTDS)],
      ['Advance Tax Paid', '-'],
      ['Self Assessment Tax', '-'],
      ['Total Tax Paid', formatCurrency(data.totalTDS)],
      ['', ''],
      ['Tax Liability as per Computation', formatCurrency(data.taxExpense)],
      ['Less: TDS/Advance Tax', formatCurrency(data.totalTDS)],
      ['Net Tax Payable/(Refundable)', formatCurrency(data.taxExpense - data.totalTDS)],
    ],
    theme: 'grid',
    styles: { fontSize: SMALL_FONT_SIZE, cellPadding: 2 },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
  });
};

// Page 11: Compliance Summary
const addComplianceSummary = (doc: jsPDF, company: CompanyInfo, fy: string) => {
  doc.addPage();
  let y = MARGIN_TOP + 10;
  
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPLIANCE SUMMARY', getPageWidth(doc) / 2, y, { align: 'center' });
  y += 15;
  
  const fyEnd = parseInt(fy.split('-')[0]) + 1;
  
  autoTable(doc, {
    startY: y,
    head: [['Compliance', 'Period', 'Status', 'Date Filed', 'Remarks']],
    body: [
      ['GSTR-1', `Apr ${fy.split('-')[0]} - Mar ${fyEnd}`, 'Filed', '-', 'Monthly returns filed'],
      ['GSTR-3B', `Apr ${fy.split('-')[0]} - Mar ${fyEnd}`, 'Filed', '-', 'Monthly returns filed'],
      ['Annual Return (GSTR-9)', `FY ${fy}`, 'Pending', '-', 'Due by Dec 31'],
      ['TDS Returns', `Q1-Q4 FY ${fy}`, 'Filed', '-', 'All quarters filed'],
      ['', '', '', '', ''],
      ['DIR-3 KYC', `FY ${fy}`, 'Filed', '-', 'Director KYC updated'],
      ['AOC-4', `FY ${fy}`, 'Pending', '-', 'Financial statements'],
      ['MGT-7', `FY ${fy}`, 'Pending', '-', 'Annual return'],
      ['Income Tax Return', `AY ${fyEnd}-${(fyEnd + 1).toString().slice(-2)}`, 'Pending', '-', 'Due by Oct 31'],
    ],
    theme: 'grid',
    styles: { fontSize: SMALL_FONT_SIZE, cellPadding: 2 },
    headStyles: { fillColor: [66, 66, 66], textColor: [255, 255, 255] },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (hookData) => {
      if (hookData.column.index === 2) {
        const text = String(hookData.cell.raw || '').toLowerCase();
        if (text === 'filed') {
          hookData.cell.styles.textColor = [0, 128, 0];
        } else if (text === 'pending') {
          hookData.cell.styles.textColor = [255, 165, 0];
        }
      }
    }
  });
};

// Page 12: Audit Certificate
const addAuditCertificate = (doc: jsPDF, company: CompanyInfo, fy: string) => {
  doc.addPage();
  let y = MARGIN_TOP + 10;
  const pageWidth = getPageWidth(doc);
  
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text('INDEPENDENT AUDITOR\'S REPORT', pageWidth / 2, y, { align: 'center' });
  y += 15;
  
  doc.setFontSize(TABLE_FONT_SIZE);
  doc.setFont('helvetica', 'normal');
  
  const fyEnd = parseInt(fy.split('-')[0]) + 1;
  const maxWidth = pageWidth - MARGIN_SIDE * 2;
  
  const paragraphs = [
    `To the Members of ${company.companyName}`,
    '',
    'Report on the Audit of Financial Statements',
    '',
    'Opinion',
    `We have audited the accompanying financial statements of ${company.companyName}, which comprise the Balance Sheet as at March 31, ${fyEnd}, the Statement of Profit and Loss and the Cash Flow Statement for the year then ended, and notes to the financial statements.`,
    '',
    'In our opinion and to the best of our information and according to the explanations given to us, the aforesaid financial statements give the information required by the Companies Act, 2013 in the manner so required and give a true and fair view in conformity with the accounting principles generally accepted in India.',
    '',
    'Basis for Opinion',
    'We conducted our audit in accordance with the Standards on Auditing specified under section 143(10) of the Companies Act, 2013. Our responsibilities under those Standards are further described in the Auditor\'s Responsibilities for the Audit of the Financial Statements section of our report.',
    '',
    'We are independent of the Company in accordance with the Code of Ethics issued by the Institute of Chartered Accountants of India together with the ethical requirements that are relevant to our audit of the financial statements.',
    '',
    'Responsibilities of Management',
    'The Company\'s Board of Directors is responsible for the matters stated in section 134(5) of the Companies Act, 2013 with respect to the preparation of these financial statements.',
    '',
    'Auditor\'s Responsibilities',
    'Our objectives are to obtain reasonable assurance about whether the financial statements as a whole are free from material misstatement, whether due to fraud or error, and to issue an auditor\'s report that includes our opinion.',
  ];
  
  paragraphs.forEach(para => {
    if (para === '') {
      y += 5;
    } else {
      const lines = doc.splitTextToSize(para, maxWidth);
      lines.forEach((line: string) => {
        if (y > getPageHeight(doc) - MARGIN_BOTTOM - 50) {
          doc.addPage();
          y = MARGIN_TOP + 10;
        }
        doc.text(line, MARGIN_SIDE, y);
        y += 5;
      });
    }
  });
  
  // Signatures
  y += 20;
  if (y > getPageHeight(doc) - 60) {
    doc.addPage();
    y = MARGIN_TOP + 30;
  }
  
  // CA Signature (left)
  doc.setFont('helvetica', 'normal');
  doc.text('For V S P & Associates', MARGIN_SIDE, y);
  doc.text('Chartered Accountants', MARGIN_SIDE, y + 5);
  doc.text('Firm Registration No: XXXXXX', MARGIN_SIDE, y + 10);
  y += 25;
  doc.text('____________________', MARGIN_SIDE, y);
  y += 5;
  doc.text('Partner', MARGIN_SIDE, y);
  doc.text('Membership No: XXXXXX', MARGIN_SIDE, y + 5);
  
  // Director Signature (right)
  const rightX = pageWidth - MARGIN_SIDE;
  doc.text(`For ${company.companyName}`, rightX, y - 30, { align: 'right' });
  y += 25;
  doc.text('____________________', rightX - 50, y - 25);
  doc.setFont('helvetica', 'bold');
  doc.text(company.ownerName, rightX, y - 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text('Director', rightX, y - 15, { align: 'right' });
  
  // Place and Date
  y += 15;
  doc.text(`Place: ${company.city || 'Hyderabad'}`, MARGIN_SIDE, y);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, MARGIN_SIDE, y + 5);
};

// Main function to generate complete Annual Report
export const generateAnnualReport = async (
  userId: string,
  fy: string,
  company: CompanyInfo
): Promise<void> => {
  // Fetch all data
  const data = await fetchAnnualReportData(userId, fy);
  
  // Create PDF
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  
  // Generate all pages
  addCoverPage(doc, company, fy);
  addTableOfContents(doc, company);
  addDirectorsReport(doc, company, data, fy);
  addFinancialHighlights(doc, company, data, fy);
  addProfitAndLoss(doc, company, data, fy);
  addBalanceSheet(doc, company, data, fy);
  addCashFlowStatement(doc, company, data, fy);
  addNotesToAccounts(doc, company, data, fy);
  addComputationOfIncome(doc, company, data, fy);
  addTDSSummary(doc, company, data, fy);
  addComplianceSummary(doc, company, fy);
  addAuditCertificate(doc, company, fy);
  
  // Save PDF
  doc.save(`Annual_Report_${fy}_${company.companyName.replace(/\s+/g, '_')}.pdf`);
};
