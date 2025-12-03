import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CompanyDetails, FinancialData } from '@/services/financialStatementsService';

const formatCurrency = (amount: number): string => {
  if (amount === 0) return '-';
  const formatted = Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  return amount < 0 ? `(${formatted})` : formatted;
};

const addCompanyHeader = (doc: jsPDF, company: CompanyDetails, yPos: number): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(company.companyName.toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  yPos += 5;
  doc.text(company.cin, pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 4;
  doc.text(company.address, pageWidth / 2, yPos, { align: 'center' });
  
  return yPos + 8;
};

const addDocumentTitle = (doc: jsPDF, title: string, subtitle: string, yPos: number): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
  
  if (subtitle) {
    yPos += 5;
    doc.setFontSize(10);
    doc.text(subtitle, pageWidth / 2, yPos, { align: 'center' });
  }
  
  return yPos + 8;
};

const addSignatureBlock = (doc: jsPDF, company: CompanyDetails, yPos: number): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Left side - CA signature
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('For V S P & Associates', 14, yPos);
  doc.text('Chartered Accountants', 14, yPos + 4);
  doc.text('FRN: 0289596', 14, yPos + 8);
  
  // Right side - Company signature
  doc.text(`For ${company.companyName.toUpperCase()}`, pageWidth - 14, yPos, { align: 'right' });
  
  yPos += 20;
  
  // Director signature
  doc.setFont('helvetica', 'bold');
  doc.text(company.ownerName.toUpperCase(), pageWidth - 14, yPos, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text('Director', pageWidth - 14, yPos + 4, { align: 'right' });
  doc.text(`DIN: ${company.directorDIN}`, pageWidth - 14, yPos + 8, { align: 'right' });
  
  // CA signature
  doc.text('CA Hemanth Vuppala', 14, yPos);
  doc.text('Partner', 14, yPos + 4);
  doc.text('M No 280956', 14, yPos + 8);
  doc.text('UDIN:', 14, yPos + 12);
  
  yPos += 20;
  
  // Second director if exists
  if (company.secondDirectorName) {
    doc.setFont('helvetica', 'bold');
    doc.text(company.secondDirectorName.toUpperCase(), pageWidth - 14, yPos, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text('Director', pageWidth - 14, yPos + 4, { align: 'right' });
    if (company.secondDirectorDIN) {
      doc.text(`DIN: ${company.secondDirectorDIN}`, pageWidth - 14, yPos + 8, { align: 'right' });
    }
  }
  
  yPos += 15;
  
  // Place and date
  doc.text('Place: Hyderabad', 14, yPos);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 14, yPos + 4);
  
  return yPos + 10;
};

export const generateProfitAndLossStatement = (
  doc: jsPDF,
  company: CompanyDetails,
  data: FinancialData,
  fy: string
): void => {
  let yPos = 15;
  
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
    startY: yPos,
    head: [['Sr.No', 'Particulars', 'Note No', `FY ${fy}`]],
    body: tableData,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 100 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 35, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  // Add note
  doc.setFontSize(8);
  doc.text('See accompanying notes forming part of financial statements', 14, yPos);
  doc.text('This is the Profit & Loss Statement referred to in our Report of even date.', 14, yPos + 4);
  
  yPos += 15;
  addSignatureBlock(doc, company, yPos);
};

export const generateBalanceSheet = (
  doc: jsPDF,
  company: CompanyDetails,
  data: FinancialData,
  fy: string
): void => {
  doc.addPage();
  let yPos = 15;
  
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
    startY: yPos,
    body: tableData,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 100 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 35, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  doc.setFontSize(8);
  doc.text('See accompanying notes forming part of financial statements', 14, yPos);
  doc.text('This is the Balance Sheet referred to in our Report of even date.', 14, yPos + 4);
  
  yPos += 15;
  addSignatureBlock(doc, company, yPos);
};

export const generateNotesToAccounts = (
  doc: jsPDF,
  company: CompanyDetails,
  data: FinancialData,
  fy: string
): void => {
  doc.addPage();
  let yPos = 15;
  
  yPos = addCompanyHeader(doc, company, yPos);
  yPos = addDocumentTitle(doc, `Notes forming part of Balance Sheet as on 31.03.${parseInt(fy.split('-')[0]) + 1}`, '', yPos);
  
  // Note 1: Share Capital
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Note : 1 Share Capital', 14, yPos);
  yPos += 5;
  
  autoTable(doc, {
    startY: yPos,
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
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 100 },
      2: { cellWidth: 50, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  // Note 2: Reserve & Surplus
  doc.setFont('helvetica', 'bold');
  doc.text('Note :2 Reserve & Surplus', 14, yPos);
  yPos += 5;
  
  autoTable(doc, {
    startY: yPos,
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: [
      ['1', 'Opening Surplus', '-'],
      ['', 'Add/less :Current Year Profit /(loss)', formatCurrency(data.profitAfterTax)],
      ['', '', formatCurrency(data.reservesAndSurplus)],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 100 },
      2: { cellWidth: 50, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  // Note 3: Other Current Liabilities
  doc.setFont('helvetica', 'bold');
  doc.text('Note :3 Other Current Liabilities', 14, yPos);
  yPos += 5;
  
  autoTable(doc, {
    startY: yPos,
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: [
      ['1', 'Trade Payables', formatCurrency(data.tradePayables)],
      ['', '', formatCurrency(data.otherCurrentLiabilities)],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 100 },
      2: { cellWidth: 50, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  // Note 4: Cash and Cash Equivalence
  doc.setFont('helvetica', 'bold');
  doc.text('Note : 4 Cash and Cash Equivalence', 14, yPos);
  yPos += 5;
  
  autoTable(doc, {
    startY: yPos,
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: [
      ['1', 'Cash Balance', '-'],
      ['2', 'Cash at bank', formatCurrency(data.cashAndBank)],
      ['', 'Total in', formatCurrency(data.cashAndBank)],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 100 },
      2: { cellWidth: 50, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });
  
  // Add P&L Notes page
  doc.addPage();
  yPos = 15;
  
  yPos = addCompanyHeader(doc, company, yPos);
  yPos = addDocumentTitle(doc, `Notes forming part of Profit and Loss Account for the period ended 31.03.${parseInt(fy.split('-')[0]) + 1}`, '', yPos);
  
  // Note 5: Revenue from operations
  doc.setFont('helvetica', 'bold');
  doc.text('Note : 5 Revenue from operations', 14, yPos);
  yPos += 5;
  
  const revenueBody = data.incomeDetails
    .filter(item => item.description !== 'Other Income')
    .map((item, idx) => [(idx + 1).toString(), item.description, formatCurrency(item.amount)]);
  revenueBody.push(['', 'Total in', formatCurrency(data.revenueFromOperations)]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: revenueBody,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 100 },
      2: { cellWidth: 50, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  // Note 6: Other income
  doc.setFont('helvetica', 'bold');
  doc.text('Note : 6 Other income', 14, yPos);
  yPos += 5;
  
  autoTable(doc, {
    startY: yPos,
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: [
      ['1', 'Other Income / Rounding off', formatCurrency(data.otherIncome)],
      ['', 'Total in', formatCurrency(data.otherIncome)],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 100 },
      2: { cellWidth: 50, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  // Note 7: Other Expenses
  doc.setFont('helvetica', 'bold');
  doc.text('Note : 7 Other Expenses', 14, yPos);
  yPos += 5;
  
  const expenseBody = data.expenseDetails.map((item, idx) => 
    [(idx + 1).toString(), item.description, formatCurrency(item.amount)]
  );
  expenseBody.push(['', 'Total in', formatCurrency(data.otherExpenses)]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['Sr. No', 'Particulars', `FY ${fy}`]],
    body: expenseBody,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 100 },
      2: { cellWidth: 50, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });
};

export const generateComputationOfIncome = (
  doc: jsPDF,
  company: CompanyDetails,
  data: FinancialData,
  fy: string
): void => {
  doc.addPage();
  let yPos = 15;
  
  yPos = addCompanyHeader(doc, company, yPos);
  
  // Add company details table
  const assessmentYear = `${parseInt(fy.split('-')[0]) + 1}-${(parseInt(fy.split('-')[0]) + 2).toString().slice(-2)}`;
  
  doc.setFontSize(9);
  doc.text(`PAN`, 14, yPos);
  doc.text(company.pan, 80, yPos);
  yPos += 4;
  doc.text(`Date of Incorporation`, 14, yPos);
  doc.text(company.dateOfIncorporation, 80, yPos);
  yPos += 4;
  doc.text(`Status`, 14, yPos);
  doc.text('COMPANY', 80, yPos);
  yPos += 4;
  doc.text(`Financial Year`, 14, yPos);
  doc.text(fy, 80, yPos);
  yPos += 4;
  doc.text(`Assessment Year`, 14, yPos);
  doc.text(assessmentYear, 80, yPos);
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
    startY: yPos,
    head: [['Particulars', 'Amount']],
    body: tableData,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 40, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 15;
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
  
  return doc;
};
