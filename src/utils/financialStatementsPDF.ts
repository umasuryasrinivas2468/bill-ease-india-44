import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CompanyDetails, FinancialData } from '@/services/financialStatementsService';

// Layout constants (values provided by user converted from px -> mm using 1px = 0.264583 mm)
const pxToMm = (px: number) => px * 0.264583;
const MARGIN_TOP = pxToMm(40); // ~10.58mm
const MARGIN_BOTTOM = pxToMm(40);
const MARGIN_SIDE = pxToMm(35);
const SECTION_SPACING = pxToMm(25); // ~25px gap between sections
const HEADER_FONT_SIZE = 15; // 14-16 as requested
const TABLE_FONT_SIZE = 10; // 10-11 for table content
const TABLE_CELL_PADDING = 2.2; // creates healthy line spacing

const getPageWidth = (doc: jsPDF) => doc.internal.pageSize.getWidth();
const getPageHeight = (doc: jsPDF) => doc.internal.pageSize.getHeight();

const computeEqualColumnStyles = (doc: jsPDF, cols: number, amountColumnIndexes: number[] = []) => {
  const pageWidth = getPageWidth(doc);
  const available = pageWidth - MARGIN_SIDE * 2;
  const colWidth = available / cols;
  const styles: any = {};
  for (let i = 0; i < cols; i++) {
    styles[i] = { cellWidth: colWidth };
    if (amountColumnIndexes.includes(i)) styles[i].halign = 'right';
    else styles[i].halign = 'left';
  }
  return styles;
};

const formatCurrency = (amount: number): string => {
  if (amount === 0) return '-';
  const formatted = Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  return amount < 0 ? `(${formatted})` : formatted;
};

const addCompanyHeader = (doc: jsPDF, company: CompanyDetails, yPos: number): number => {
  const pageWidth = getPageWidth(doc);
  const centerX = pageWidth / 2;

  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  // Company name (wrap if necessary)
  const availableWidth = pageWidth - MARGIN_SIDE * 2;
  const nameLines = doc.splitTextToSize(company.companyName.toUpperCase(), availableWidth);
  doc.text(nameLines, centerX, yPos, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  yPos += nameLines.length * 6; // move down depending on name lines

  if (company.cin) {
    const cinLines = doc.splitTextToSize(company.cin, availableWidth);
    doc.text(cinLines, centerX, yPos + 4, { align: 'center' });
    yPos += cinLines.length * 5;
  }

  if (company.address) {
    const addrLines = doc.splitTextToSize(company.address, availableWidth);
    doc.text(addrLines, centerX, yPos + 4, { align: 'center' });
    yPos += addrLines.length * 5;
  }

  // leave a larger gap between header and document title to avoid overlap
  return yPos + SECTION_SPACING;
};

const addDocumentTitle = (doc: jsPDF, title: string, subtitle: string, yPos: number): number => {
  const pageWidth = getPageWidth(doc);
  const centerX = pageWidth / 2;

  // ensure a little breathing room before title
  yPos += 4;
  doc.setFontSize(HEADER_FONT_SIZE - 1);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(title.toUpperCase(), getPageWidth(doc) - MARGIN_SIDE * 2);
  doc.text(titleLines, centerX, yPos, { align: 'center' });
  yPos += titleLines.length * 7;

  if (subtitle) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const subLines = doc.splitTextToSize(subtitle, getPageWidth(doc) - MARGIN_SIDE * 2);
    doc.text(subLines, centerX, yPos + 4, { align: 'center' });
    yPos += subLines.length * 6;
  }

  return yPos + SECTION_SPACING / 2;
};

const addSignatureBlock = (doc: jsPDF, company: CompanyDetails, yPos: number): number => {
  const pageWidth = getPageWidth(doc);
  const leftX = MARGIN_SIDE;
  const rightX = pageWidth - MARGIN_SIDE;
  // Ensure there's space for signature block; if not, start a new page
  const estimatedHeight = 60; // approximate block height in mm
  if (yPos + estimatedHeight > getPageHeight(doc) - MARGIN_BOTTOM) {
    doc.addPage();
    yPos = MARGIN_TOP;
  }
  // CA area on the left
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Chartered Accountant', leftX, yPos);
  doc.text('', leftX, yPos + 4); // blank line for signature
  doc.text('__________________________', leftX, yPos + 16);
  doc.text('Chartered Accountant', leftX, yPos + 20);

  // Company area on the right
  doc.setFont('helvetica', 'bold');
  doc.text(company.ownerName ? `Director: ${company.ownerName}` : 'Director:', rightX, yPos + 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text('', rightX, yPos + 24, { align: 'right' });

  // Place and date below signatures (move to right side to avoid colliding with tables)
  doc.setFontSize(9);
  doc.text(`Place: ${company.place || 'Hyderabad'}`, rightX, yPos + 34, { align: 'right' });
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, rightX, yPos + 38, { align: 'right' });

  return yPos + 44;
};

export const generateProfitAndLossStatement = (
  doc: jsPDF,
  company: CompanyDetails,
  data: FinancialData,
  fy: string
): void => {
  let yPos = MARGIN_TOP;
  
  yPos = addCompanyHeader(doc, company, yPos);
  yPos = addDocumentTitle(doc, 'PROFIT AND LOSS ACCOUNT FOR THE YEAR ENDED 31ST MARCH ' + (parseInt(fy.split('-')[0]) + 1), '', yPos);
  
  const tableData = [
    ['I', 'Revenue from Operations', '5', formatCurrency(data.revenueFromOperations)],
    ['II', 'Other Income', '6', formatCurrency(data.otherIncome)],
    ['III', 'Total Revenue (I+II)', '', formatCurrency(data.totalRevenue)],
    ['', '', '', ''],
    ['IV', 'Expenses:', '', ''],
    ['', '   Cost of Materials Consumed', '', formatCurrency(data.costOfMaterialsConsumed)],
    ['', '   Employee Benefit Expense', '', formatCurrency(data.employeeBenefitExpense)],
    ['', '   Financial Costs', '', formatCurrency(data.financialCosts)],
    ['', '   Depreciation and Amortization Expenses', '', formatCurrency(data.depreciationExpense)],
    ['', '   Other Expenses', '7', formatCurrency(data.otherExpenses)],
    ['', '   Total Expenses (IV)', '', formatCurrency(data.totalExpenses)],
    ['', 'Profit Before Exceptional and', '', ''],
    ['V', 'Extraordinary Items &Tax', '', formatCurrency(data.profitBeforeTax)],
    ['', 'Exceptional Items', '', '-'],
    ['', 'Profit Before Extraordinary Items And Tax', '', formatCurrency(data.profitBeforeTax)],
    ['', 'Extraordinary Items', '', '-'],
    ['', 'Profit/(Loss) Before Tax', '', formatCurrency(data.profitBeforeTax)],
    ['', '', '', ''],
    ['VI', 'Tax expense:', '', ''],
    ['', '   Less: Current tax', '', formatCurrency(data.taxExpense)],
    ['', '   Add: Deferred tax', '', '-'],
    ['', '', '', ''],
    ['VII', 'Profit/(Loss) from continuing operations', '(V-VI)', formatCurrency(data.profitAfterTax)],
    ['', '', '', ''],
    ['', 'Profit /(Loss) from discontinuing operations', '', '-'],
    ['', '', '', ''],
    ['', 'Profit /(Loss) from Previous Year', '', '-'],
    ['', '', '', ''],
    ['', 'Tax Expense of Discontinuing Operations', '', '-'],
    ['', '', '', ''],
    ['', 'Profit/(loss) from Discontinuing', '', ''],
    ['', 'Operations (After Tax )', '', '-'],
    ['', '', '', ''],
    ['VIII', 'Profit/(Loss) for the period', '', formatCurrency(data.profitAfterTax)],
    ['', '', '', ''],
    ['IX', 'Earning Per Share', '', ''],
    ['', '   (1) Basic', '', formatCurrency(data.profitAfterTax / 1000)],
    ['', '   (2) Diluted', '', formatCurrency(data.profitAfterTax / 1000)],
  ];
  
  autoTable(doc, {
    startY: Math.max(yPos, MARGIN_TOP),
    head: [['Sr.No', 'Particulars', 'Note No', `FY ${fy}`]],
    body: tableData,
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: TABLE_CELL_PADDING },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: computeEqualColumnStyles(doc, 4, [3]),
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (data) => {
      const txt = String(data.cell.raw || '').toLowerCase();
      if (txt.includes('total') || txt.includes('subtotal') || txt.includes('profit') || txt.includes('loss')) {
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + SECTION_SPACING;
  
  // Add note
  doc.setFontSize(8);
  doc.text('See accompanying notes forming part of financial statements', MARGIN_SIDE, yPos);
  doc.text('This is the Profit & Loss Statement referred to in our Report of even date.', MARGIN_SIDE, yPos + 4);

  yPos += SECTION_SPACING / 2;
  addSignatureBlock(doc, company, yPos);
};

export const generateBalanceSheet = (
  doc: jsPDF,
  company: CompanyDetails,
  data: FinancialData,
  fy: string
): void => {
  doc.addPage();
  let yPos = MARGIN_TOP;
  
  yPos = addCompanyHeader(doc, company, yPos);
  yPos = addDocumentTitle(doc, 'BALANCE SHEET AS AT 31ST MARCH ' + (parseInt(fy.split('-')[0]) + 1), '', yPos);
  
  const tableData = [
    ['', 'Particulars', 'Note No', `FY ${fy}`],
    ['', 'I. EQUITY AND LIABILITIES', '', ''],
    ['', '(1) Shareholder\'s Funds', '', ''],
    ['', '    (a) Share Capital', '1', formatCurrency(data.shareCapital)],
    ['', '    (b) Reserves and Surplus', '2', formatCurrency(data.reservesAndSurplus)],
    ['', '', '', ''],
    ['', '(2) Share Application money pending allotment', '', '-'],
    ['', '', '', ''],
    ['', '(3) Non-Current Liabilities:', '', ''],
    ['', '    (a) Long Term Borrowings', '', '-'],
    ['', '    (b) Deferred Tax Liabilities(net)', '', '-'],
    ['', '    (c) Other Long Term Liabilities', '', '-'],
    ['', '    (d) Long Term Provisions', '', '-'],
    ['', '', '', ''],
    ['', '(4) Current liabilities:', '', ''],
    ['', '    (a) Short-term borrowings', '', '-'],
    ['', '    (b) Trade payables', '', formatCurrency(data.tradePayables)],
    ['', '    (c) Other current liabilities', '3', formatCurrency(data.otherCurrentLiabilities)],
    ['', '    (d) Short-term provisions', '', '-'],
    ['', '    Total Equity & Liabilities', '', formatCurrency(data.totalEquityAndLiabilities)],
    ['', '', '', ''],
    ['', 'II.ASSETS', '', ''],
    ['', '(1) Non-Current Assets', '', ''],
    ['', '    (a) Property, Plant & Equipment', '', ''],
    ['', '        (i) Gross Block', '', '-'],
    ['', '        (ii) Depreciation', '', '-'],
    ['', '        (iii) Net Block', '', '-'],
    ['', '    (b) Non-current investments', '', '-'],
    ['', '    (c) Deferred tax assets (net)', '', '-'],
    ['', '    (d) Long term loans and advances', '', '-'],
    ['', '    (e) Other Non-current assets', '', '-'],
    ['', '', '', ''],
    ['', '(2) Current Assets', '', ''],
    ['', '    (a) Current investments', '', '-'],
    ['', '    (b) Inventories', '', '-'],
    ['', '    (c) Trade receivables', '', formatCurrency(data.tradeReceivables)],
    ['', '    (d) Cash and cash equivalents', '4', formatCurrency(data.cashAndBank)],
    ['', '    (e)Short-term loans and advances', '', '-'],
    ['', '    (f) Other current assets', '', '-'],
    ['', '    Total Assets', '', formatCurrency(data.totalAssets)],
  ];
  
  autoTable(doc, {
    startY: Math.max(yPos, MARGIN_TOP),
    body: tableData,
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: TABLE_CELL_PADDING },
    columnStyles: computeEqualColumnStyles(doc, 4, [3]),
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (data) => {
      const txt = String(data.cell.raw || '').toLowerCase();
      if (txt.includes('total')) data.cell.styles.fontStyle = 'bold';
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + SECTION_SPACING;
  
  doc.setFontSize(8);
  doc.text('See accompanying notes forming part of financial statements', MARGIN_SIDE, yPos);
  doc.text('This is the Balance Sheet referred to in our Report of even date.', MARGIN_SIDE, yPos + 4);

  yPos += SECTION_SPACING / 2;
  addSignatureBlock(doc, company, yPos);
};

export const generateNotesToAccounts = (
  doc: jsPDF,
  company: CompanyDetails,
  data: FinancialData,
  fy: string
): void => {
  doc.addPage();
  let yPos = MARGIN_TOP;
  
  yPos = addCompanyHeader(doc, company, yPos);
  yPos = addDocumentTitle(doc, `Notes forming part of Balance Sheet as on 31.03.${parseInt(fy.split('-')[0]) + 1}`, '', yPos);
  
  // Note 1: Share Capital
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Note : 1 Share Capital', MARGIN_SIDE, yPos);
  yPos += 5;
  
  autoTable(doc, {
    startY: Math.max(yPos, MARGIN_TOP),
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: [
      ['1', 'AUTHORIZED CAPITAL', ''],
      ['', '10,000 Equity Shares of Rs. 10/- each.', '1,00,000'],
      ['', '', '1,00,000'],
      ['2', 'ISSUED, SUBSCRIBED & PAID UP CAPITAL', ''],
      ['', 'To the Subscribers of Memorandum', ''],
      ['', '1000 Equity Shares of Rs. 10/- each, Fully', formatCurrency(data.shareCapital)],
      ['', 'Total in', formatCurrency(data.shareCapital)],
    ],
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: TABLE_CELL_PADDING },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: computeEqualColumnStyles(doc, 3, [2]),
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (data) => {
      const txt = String(data.cell.raw || '').toLowerCase();
      if (txt.includes('total')) data.cell.styles.fontStyle = 'bold';
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + SECTION_SPACING;
  
  // Note 2: Reserve & Surplus
  doc.setFont('helvetica', 'bold');
  doc.text('Note :2 Reserve & Surplus', MARGIN_SIDE, yPos);
  yPos += 5;
  
  autoTable(doc, {
    startY: Math.max(yPos, MARGIN_TOP),
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: [
      ['1', 'Opening Surplus', '-'],
      ['', 'Add/less :Current Year Profit /(loss)', formatCurrency(data.profitAfterTax)],
      ['', '', formatCurrency(data.reservesAndSurplus)],
    ],
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: TABLE_CELL_PADDING },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: computeEqualColumnStyles(doc, 3, [2]),
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (data) => {
      const txt = String(data.cell.raw || '').toLowerCase();
      if (txt.includes('total')) data.cell.styles.fontStyle = 'bold';
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + SECTION_SPACING;
  
  // Note 3: Other Current Liabilities
  doc.setFont('helvetica', 'bold');
  doc.text('Note :3 Other Current Liabilities', MARGIN_SIDE, yPos);
  yPos += 5;
  
  autoTable(doc, {
    startY: Math.max(yPos, MARGIN_TOP),
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: [
      ['1', 'Trade Payables', formatCurrency(data.tradePayables)],
      ['', '', formatCurrency(data.otherCurrentLiabilities)],
    ],
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: TABLE_CELL_PADDING },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: computeEqualColumnStyles(doc, 3, [2]),
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (data) => {
      const txt = String(data.cell.raw || '').toLowerCase();
      if (txt.includes('total')) data.cell.styles.fontStyle = 'bold';
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + SECTION_SPACING;
  
  // Note 4: Cash and Cash Equivalence
  doc.setFont('helvetica', 'bold');
  doc.text('Note : 4 Cash and Cash Equivalence', MARGIN_SIDE, yPos);
  yPos += 5;
  
  autoTable(doc, {
    startY: Math.max(yPos, MARGIN_TOP),
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: [
      ['1', 'Cash Balance', '-'],
      ['2', 'Cash at bank', formatCurrency(data.cashAndBank)],
      ['', 'Total in', formatCurrency(data.cashAndBank)],
    ],
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: TABLE_CELL_PADDING },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: computeEqualColumnStyles(doc, 3, [2]),
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (data) => {
      const txt = String(data.cell.raw || '').toLowerCase();
      if (txt.includes('total')) data.cell.styles.fontStyle = 'bold';
    }
  });
  
  // Add P&L Notes page
  doc.addPage();
  yPos = 15;
  
  yPos = addCompanyHeader(doc, company, yPos);
  yPos = addDocumentTitle(doc, `Notes forming part of Profit and Loss Account for the period ended 31.03.${parseInt(fy.split('-')[0]) + 1}`, '', yPos);
  
  // Note 5: Revenue from operations
  doc.setFont('helvetica', 'bold');
  doc.text('Note : 5 Revenue from operations', MARGIN_SIDE, yPos);
  yPos += 5;
  
  const revenueBody = data.incomeDetails
    .filter(item => item.description !== 'Other Income')
    .map((item, idx) => [(idx + 1).toString(), item.description, formatCurrency(item.amount)]);
  revenueBody.push(['', 'Total in', formatCurrency(data.revenueFromOperations)]);
  
  autoTable(doc, {
    startY: Math.max(yPos, MARGIN_TOP),
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: revenueBody,
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: TABLE_CELL_PADDING },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: computeEqualColumnStyles(doc, 3, [2]),
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (data) => {
      const txt = String(data.cell.raw || '').toLowerCase();
      if (txt.includes('total')) data.cell.styles.fontStyle = 'bold';
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + SECTION_SPACING;
  
  // Note 6: Other income
  doc.setFont('helvetica', 'bold');
  doc.text('Note : 6 Other income', MARGIN_SIDE, yPos);
  yPos += 5;
  
  autoTable(doc, {
    startY: Math.max(yPos, MARGIN_TOP),
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: [
      ['1', 'Other Income / Rounding off', formatCurrency(data.otherIncome)],
      ['', 'Total in', formatCurrency(data.otherIncome)],
    ],
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: TABLE_CELL_PADDING },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: computeEqualColumnStyles(doc, 3, [2]),
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (data) => {
      const txt = String(data.cell.raw || '').toLowerCase();
      if (txt.includes('total')) data.cell.styles.fontStyle = 'bold';
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + SECTION_SPACING;
  
  // Note 7: Other Expenses
  doc.setFont('helvetica', 'bold');
  doc.text('Note : 7 Other Expenses', MARGIN_SIDE, yPos);
  yPos += 5;
  
  const expenseBody = data.expenseDetails.map((item, idx) => 
    [(idx + 1).toString(), item.description, formatCurrency(item.amount)]
  );
  expenseBody.push(['', 'Total in', formatCurrency(data.otherExpenses)]);
  
  autoTable(doc, {
    startY: Math.max(yPos, MARGIN_TOP),
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: expenseBody,
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: TABLE_CELL_PADDING },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: computeEqualColumnStyles(doc, 3, [2]),
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (data) => {
      const txt = String(data.cell.raw || '').toLowerCase();
      if (txt.includes('total')) data.cell.styles.fontStyle = 'bold';
    }
  });
};

export const generateComputationOfIncome = (
  doc: jsPDF,
  company: CompanyDetails,
  data: FinancialData,
  fy: string
): void => {
  doc.addPage();
  let yPos = MARGIN_TOP;
  
  yPos = addCompanyHeader(doc, company, yPos);
  
  // Add company details table
  const assessmentYear = `${parseInt(fy.split('-')[0]) + 1}-${(parseInt(fy.split('-')[0]) + 2).toString().slice(-2)}`;
  
  doc.setFontSize(9);
  const leftCol = MARGIN_SIDE;
  const rightCol = MARGIN_SIDE + 60;
  doc.text(`PAN`, leftCol, yPos);
  doc.text(company.pan || '-', rightCol, yPos);
  yPos += 4;
  doc.text(`Date of Incorporation`, leftCol, yPos);
  doc.text(company.dateOfIncorporation || '-', rightCol, yPos);
  yPos += 4;
  doc.text(`Status`, leftCol, yPos);
  doc.text('COMPANY', rightCol, yPos);
  yPos += 4;
  doc.text(`Financial Year`, leftCol, yPos);
  doc.text(fy, rightCol, yPos);
  yPos += 4;
  doc.text(`Assessment Year`, leftCol, yPos);
  doc.text(assessmentYear, rightCol, yPos);
  yPos += 8;
  
  yPos = addDocumentTitle(doc, 'COMPUTATION OF TOTAL INCOME', '', yPos);
  
  doc.setFontSize(8);
  doc.text('(Amount in Rupees)', doc.internal.pageSize.getWidth() - 14, yPos, { align: 'right' });
  yPos += 5;
  
  const tableData = [
    ['Income From Business:', ''],
    ['Net Profit as per Profit and Loss Account', formatCurrency(data.profitAfterTax)],
    ['', ''],
    ['Add: Dep. as per Companies Act, 2013', '-'],
    ['Profit Before Depreciation', formatCurrency(data.profitBeforeTax)],
    ['', ''],
    ['Less. Dep. as per Income Tax Act, 1961', '-'],
    ['Income From Business', formatCurrency(data.profitBeforeTax)],
    ['', ''],
    ['Gross Total Income', formatCurrency(data.profitBeforeTax)],
    ['', ''],
    ['Net Total Income', formatCurrency(data.profitBeforeTax)],
    ['', ''],
    ['Tax on Total Income', ''],
    ['Income Tax @ 25 %', formatCurrency(data.taxExpense)],
    ['Add: Health & Education cess @ 4%', formatCurrency(data.taxExpense * 0.04)],
    ['Total Tax Payable', formatCurrency(data.taxExpense * 1.04)],
    ['Less : TDS as per 26AS', '-'],
    ['Balance Tax Refundable', '-'],
  ];
  
  autoTable(doc, {
    startY: Math.max(yPos, MARGIN_TOP),
    head: [['Particulars', 'Amount']],
    body: tableData,
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: TABLE_CELL_PADDING },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: computeEqualColumnStyles(doc, 2, [1]),
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (data) => {
      const txt = String(data.cell.raw || '').toLowerCase();
      if (txt.includes('total') || txt.includes('tax')) data.cell.styles.fontStyle = 'bold';
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + SECTION_SPACING;
  addSignatureBlock(doc, company, yPos);
};

export const generateFinancialStatementsPDF = (
  company: CompanyDetails,
  data: FinancialData,
  fy: string
): jsPDF => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  // Generate all sections
  generateComputationOfIncome(doc, company, data, fy);
  generateProfitAndLossStatement(doc, company, data, fy);
  generateBalanceSheet(doc, company, data, fy);
  generateNotesToAccounts(doc, company, data, fy);
  // Draw footer on every page: Chartered Accountant block (left) and Directors block (right)
  const drawFooterPerPage = (d: jsPDF, c: CompanyDetails) => {
    const pageCount = d.getNumberOfPages();
    const pageH = getPageHeight(d);
    const footerY = pageH - (MARGIN_BOTTOM / 2) - 6; // position within bottom margin

    for (let p = 1; p <= pageCount; p++) {
      d.setPage(p);
      const pw = getPageWidth(d);
      const leftX = MARGIN_SIDE;
      const rightX = pw - MARGIN_SIDE;

      d.setFontSize(9);
      d.setFont('helvetica', 'normal');
      // Left: Chartered Accountant block (kept from original layout)
      d.text('For V S P & Associates', leftX, footerY - 6);
      d.text('Chartered Accountants', leftX, footerY - 2);
      d.text('FRN 028959S', leftX, footerY + 2);

      // Right: Company / Directors block
      d.setFont('helvetica', 'bold');
      d.text(`For ${c.companyName ? c.companyName.toUpperCase() : ''}`, rightX, footerY - 10, { align: 'right' });
      d.setFont('helvetica', 'bold');
      if (c.ownerName) d.text(c.ownerName.toUpperCase(), rightX, footerY - 2, { align: 'right' });
      d.setFont('helvetica', 'normal');
      if (c.directorDIN) d.text(`DIN : ${c.directorDIN}`, rightX, footerY + 4, { align: 'right' });

      if (c.secondDirectorName) {
        d.setFont('helvetica', 'bold');
        d.text(c.secondDirectorName.toUpperCase(), rightX, footerY + 14, { align: 'right' });
        d.setFont('helvetica', 'normal');
        if (c.secondDirectorDIN) d.text(`DIN : ${c.secondDirectorDIN}`, rightX, footerY + 18, { align: 'right' });
      }
    }
  };

  drawFooterPerPage(doc, company);

  return doc;
};
