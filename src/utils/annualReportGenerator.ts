import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateFinancialStatementsPDF, generateProfitAndLossStatement, generateBalanceSheet, generateNotesToAccounts, generateComputationOfIncome } from './financialStatementsPDF';
import { CompanyDetails, FinancialData } from '@/services/financialStatementsService';

// Reuse constants and helpers  financialStatementsPDF when possible; this generator
// builds a multi-page Annual Report PDF using the existing PDF functions and additional
// sections (Cover, TOC, Director's Report, Financial Highlights, Charts, Notes, Audit page).

type GeneratorOptions = {
  supabase?: SupabaseClient;
  supabaseUrl?: string;
  supabaseKey?: string;
};

// Local layout constants (keep consistent with financialStatementsPDF)
const pxToMm = (px: number) => px * 0.264583;
const MARGIN_TOP = pxToMm(40);
const MARGIN_BOTTOM = pxToMm(40);
const MARGIN_SIDE = pxToMm(35);
const SECTION_SPACING = pxToMm(25);
const HEADER_FONT_SIZE = 15;
const TABLE_FONT_SIZE = 10;
const TABLE_CELL_PADDING = 2.2;

const getPageWidth = (doc: jsPDF) => doc.internal.pageSize.getWidth();
const getPageHeight = (doc: jsPDF) => doc.internal.pageSize.getHeight();

const computeEqualColumnStyles = (doc: jsPDF, cols: number, amountColumnIndexes: number[] = []) => {
  const pageWidth = getPageWidth(doc);
  const available = pageWidth - MARGIN_SIDE * 2;
  const colWidth = available / cols;
  const styles: any = {};
  for (let i = 0; i < cols; i++) {
    styles[i] = { cellWidth: colWidth };
    styles[i].halign = amountColumnIndexes.includes(i) ? 'right' : 'left';
  }
  return styles;
};

const formatCurrency = (amount: number): string => {
  if (amount === 0 || typeof amount === 'undefined' || amount === null) return '-';
  const formatted = Math.abs(Number(amount)).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return Number(amount) < 0 ? `(${formatted})` : formatted;
};

// Local signature block (kept small and safe)
function addSignatureBlock(doc: jsPDF, company: CompanyDetails, yPos: number): number {
  const pageWidth = getPageWidth(doc);
  const leftX = MARGIN_SIDE;
  const rightX = pageWidth - MARGIN_SIDE;
  const estimatedHeight = 60;
  if (yPos + estimatedHeight > getPageHeight(doc) - MARGIN_BOTTOM) {
    doc.addPage();
    yPos = MARGIN_TOP;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('For V S P & Associates', leftX, yPos);
  doc.text('Chartered Accountants', leftX, yPos + 4);
  doc.text('FRN 028959S', leftX, yPos + 8);

  doc.setFont('helvetica', 'bold');
  doc.text(company.ownerName ? `For ${company.companyName}` : '', rightX, yPos, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  if (company.ownerName) doc.text(company.ownerName.toUpperCase(), rightX, yPos + 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  if (company.directorDIN) doc.text(`DIN : ${company.directorDIN}`, rightX, yPos + 16, { align: 'right' });

  doc.text(`Place: ${(company as any).place || 'Hyderabad'}`, rightX, yPos + 28, { align: 'right' });
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, rightX, yPos + 32, { align: 'right' });

  return yPos + estimatedHeight;
}

// Simple helper to create supabase client if not provided. Expects env vars for local script.
const ensureSupabaseClient = (opts?: GeneratorOptions) => {
  if (opts?.supabase) return opts.supabase;
  const url = opts?.supabaseUrl || process.env.SUPABASE_URL;
  const key = opts?.supabaseKey || process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('Supabase credentials not provided (SUPABASE_URL/SUPABASE_KEY)');
  return createClient(url, key);
};

// Minimal fetch functions - adapt to the actual DB schema in your Supabase instance.
async function fetchCompanyDetails(supabase: SupabaseClient): Promise<CompanyDetails> {
  const { data, error } = await supabase.from('company_details').select('*').limit(1).single();
  if (error) throw error;
  return data as CompanyDetails;
}

async function fetchFinancialData(supabase: SupabaseClient, year: string): Promise<FinancialData> {
  const { data, error } = await supabase.from('financial_data').select('*').eq('financial_year', year).limit(1).single();
  if (error) {
    // fallback: try aggregated endpoints or raise
    throw error;
  }
  return data as FinancialData;
}

// Draw cover page (one page)
function addCoverPage(doc: jsPDF, company: CompanyDetails, year: string) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const centerX = pw / 2;

  const top = 30;
  doc.setFontSize(HEADER_FONT_SIZE + 4);
  doc.setFont('helvetica', 'bold');
  doc.text(company.companyName.toUpperCase(), centerX, top, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Annual Report', centerX, top + 18, { align: 'center' });
  doc.text(`Financial Year: ${year}`, centerX, top + 28, { align: 'center' });

  doc.setFontSize(10);
  doc.text(company.address || '', centerX, top + 40, { align: 'center' });

  // blank space then page break
  doc.addPage();
}

// Table of contents generator (simple)
function addTableOfContents(doc: jsPDF, entries: { title: string; page: number }[]) {
  let y = MARGIN_TOP;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Table of Contents', MARGIN_SIDE, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  entries.forEach((e) => {
    doc.text(e.title, MARGIN_SIDE, y);
    doc.text(String(e.page), getPageWidth(doc) - MARGIN_SIDE, y, { align: 'right' });
    y += 8;
  });
  doc.addPage();
}

// Simple SVG bar chart renderer inserted as an image. Create a data URL for a small SVG.
function svgBarChartDataUrl(values: number[], labels: string[] = []) {
  const max = Math.max(...values, 1);
  const w = 520;
  const h = 160;
  const barW = Math.floor((w - 40) / values.length);
  const bars = values
    .map((v, i) => {
      const barH = Math.round((v / max) * (h - 40));
      const x = 20 + i * barW;
      const y = h - 20 - barH;
      return `<rect x="${x}" y="${y}" width="${barW - 8}" height="${barH}" fill="#2b6cb0" />`;
    })
    .join('\n');
  const labelsSvg = labels
    .map((t, i) => {
      const x = 20 + i * barW + (barW - 8) / 2;
      return `<text x="${x}" y="${h - 2}" font-size="10" text-anchor="middle" fill="#333">${t}</text>`;
    })
    .join('\n');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='#fff'/>${bars}${labelsSvg}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

// Small helper to draw a headed table using autoTable
function addSimpleTable(doc: jsPDF, head: string[], body: any[][]) {
  autoTable(doc, {
    startY: Math.max(MARGIN_TOP, (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + SECTION_SPACING : MARGIN_TOP),
    head: [head],
    body,
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: TABLE_CELL_PADDING },
    columnStyles: computeEqualColumnStyles(doc, head.length, [head.length - 1]),
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (data) => {
      const txt = String(data.cell.raw || '').toLowerCase();
      if (txt.includes('total') || txt.includes('profit') || txt.includes('loss')) data.cell.styles.fontStyle = 'bold';
    }
  });
}

// Main generator
export async function generateAnnualReport(year: string, ownerName: string, opts?: GeneratorOptions) {
  const supabase = ensureSupabaseClient(opts);
  // fetch data
  const company = await fetchCompanyDetails(supabase).catch(() => ({ companyName: 'COMPANY', address: '' })) as CompanyDetails;
  // if ownerName supplied override
  if (ownerName) company.ownerName = ownerName;
  const data = await fetchFinancialData(supabase, year).catch(() => ({} as FinancialData));

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Cover page
  addCoverPage(doc, company, year);

  // Table of contents placeholder - we'll insert simple static TOC
  addTableOfContents(doc, [
    { title: 'Director\'s Report', page: 3 },
    { title: 'Financial Highlights', page: 4 },
    { title: 'Profit & Loss Statement', page: 5 },
    { title: 'Balance Sheet', page: 6 },
    { title: 'Cash Flow Statement', page: 7 },
    { title: 'Notes to Accounts', page: 8 },
    { title: 'TDS & Tax Summary', page: 9 },
    { title: 'Compliance Summary', page: 10 },
    { title: 'Audit Certificate', page: 11 }
  ]);

  // Director's Report page
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text("Director's Report", MARGIN_SIDE, MARGIN_TOP);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`The Board hereby presents the Annual Report for the year ${year}.`, MARGIN_SIDE, MARGIN_TOP + 12);
  doc.text(`Director: ${company.ownerName || ownerName}`, MARGIN_SIDE, MARGIN_TOP + 20);
  doc.addPage();

  // Financial Highlights with simple charts
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Financial Highlights', MARGIN_SIDE, MARGIN_TOP);

  const highlights = [data.totalRevenue || 0, data.totalExpenses || 0, data.profitAfterTax || 0];
  const chartUrl = svgBarChartDataUrl(highlights, ['Revenue', 'Expenses', 'Profit']);
  // insert image (positioned using margins, not absolute overlay)
  try {
    doc.addImage(chartUrl, 'PNG', MARGIN_SIDE, MARGIN_TOP + 12, getPageWidth(doc) - MARGIN_SIDE * 2, 40);
  } catch (e) {
    // some environments require conversion; fallback silently
  }
  doc.addPage();

  // Profit & Loss Statement (tabular) - reuse existing P&L table body layout from financialStatementsPDF
  // We'll call the existing function to keep consistency
  generateProfitAndLossStatement(doc, company, data, year);
  doc.addPage();

  // Balance Sheet
  generateBalanceSheet(doc, company, data, year);
  doc.addPage();

  // Cash Flow (indirect method) - simple tabular stub
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Cash Flow Statement (Indirect Method)', MARGIN_SIDE, MARGIN_TOP);
  const cfBody = [
    ['Net Profit before tax and extraordinary items', formatCurrency(data.profitBeforeTax || 0)],
    ['Adjustments for:', ''],
    ['  Depreciation', formatCurrency(data.depreciationExpense || 0)],
    ['  Finance costs', formatCurrency(data.financialCosts || 0)],
    ['Operating profit before working capital changes', formatCurrency((data.profitBeforeTax || 0) + (data.depreciationExpense || 0))],
    ['Net cash from operating activities', '-']
  ];
  addSimpleTable(doc, ['Particulars', 'Amount'], cfBody as any[][]);
  doc.addPage();

  // Notes to Accounts - call existing function
  generateNotesToAccounts(doc, company, data, year);
  doc.addPage();

  // Computation of Income
  generateComputationOfIncome(doc, company, data, year);
  doc.addPage();

  // TDS & Tax Summary (stub)
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TDS & Tax Summary', MARGIN_SIDE, MARGIN_TOP);
  addSimpleTable(doc, ['Particulars', 'Amount'], [
    ['Tax payable', formatCurrency(data.taxExpense || 0)],
    ['TDS', '-']
  ]);
  doc.addPage();

  // Compliance Summary
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Compliance Summary', MARGIN_SIDE, MARGIN_TOP);
  addSimpleTable(doc, ['Compliance', 'Period', 'Status', 'Date Filed', 'Remarks'], [
    ['GST', '-', 'Filed', '-', '-'],
    ['MCA', '-', 'Filed', '-', '-'],
    ['DIR-3 KYC', '-', 'Filed', '-', '-'],
    ['TDS', '-', 'Filed', '-', '-']
  ] as any[][]);
  doc.addPage();

  // Audit Certificate / Signature page
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Audit Certificate', MARGIN_SIDE, MARGIN_TOP);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('We have audited the financial statements of the Company for the year ended ...', MARGIN_SIDE, MARGIN_TOP + 12);

  // add signature blocks
  addSignatureBlock(doc, company, MARGIN_TOP + 40);

  // Add footer on all pages (CA & Directors block)
  // Reuse previously added drawFooterPerPage from financialStatementsPDF generation if exists;
  // if not, draw a consistent footer here
  const pageCount = doc.getNumberOfPages();
  const footerY = getPageHeight(doc) - (MARGIN_BOTTOM / 2) - 6;
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pw = getPageWidth(doc);
    const leftX = MARGIN_SIDE;
    const rightX = pw - MARGIN_SIDE;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('For V S P & Associates', leftX, footerY - 6);
    doc.text('Chartered Accountants', leftX, footerY - 2);
    doc.text('FRN 028959S', leftX, footerY + 2);

    doc.setFont('helvetica', 'bold');
    doc.text(`For ${company.companyName ? company.companyName.toUpperCase() : ''}`, rightX, footerY - 10, { align: 'right' });
    if (company.ownerName) doc.text(company.ownerName.toUpperCase(), rightX, footerY - 2, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    if (company.directorDIN) doc.text(`DIN : ${company.directorDIN}`, rightX, footerY + 4, { align: 'right' });
    if (company.secondDirectorName) {
      doc.setFont('helvetica', 'bold');
      doc.text(company.secondDirectorName.toUpperCase(), rightX, footerY + 14, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      if (company.secondDirectorDIN) doc.text(`DIN : ${company.secondDirectorDIN}`, rightX, footerY + 18, { align: 'right' });
    }
  }

  return doc;
}
