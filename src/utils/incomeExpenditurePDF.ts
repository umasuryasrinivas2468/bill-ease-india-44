import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface IncomeExpenditureData {
  income: Array<{
    particulars: string;
    amount: number;
    journalRef?: string;
  }>;
  expenditure: Array<{
    particulars: string;
    amount: number;
    journalRef?: string;
  }>;
  totalIncome: number;
  totalExpenditure: number;
  surplus: number; // or deficit if negative
}

export interface CompanyInfo {
  companyName: string;
  address: string;
  financialYear: string;
  pan?: string;
  cin?: string;
}

// Layout constants
const pxToMm = (px: number) => px * 0.264583;
const MARGIN_TOP = pxToMm(40);
const MARGIN_SIDE = pxToMm(30);
const SECTION_SPACING = pxToMm(20);
const HEADER_FONT_SIZE = 14;
const TABLE_FONT_SIZE = 9;
const TABLE_CELL_PADDING = 2;

const getPageWidth = (doc: jsPDF) => doc.internal.pageSize.getWidth();
const getPageHeight = (doc: jsPDF) => doc.internal.pageSize.getHeight();

const formatCurrency = (amount: number): string => {
  if (amount === 0) return '-';
  const formatted = Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return amount < 0 ? `(${formatted})` : formatted;
};

const addCompanyHeader = (doc: jsPDF, company: CompanyInfo, yPos: number): number => {
  const pageWidth = getPageWidth(doc);
  const centerX = pageWidth / 2;
  const availableWidth = pageWidth - MARGIN_SIDE * 2;

  // Company Name
  doc.setFontSize(HEADER_FONT_SIZE + 2);
  doc.setFont('helvetica', 'bold');
  const nameLines = doc.splitTextToSize(company.companyName.toUpperCase(), availableWidth);
  doc.text(nameLines, centerX, yPos, { align: 'center' });
  yPos += nameLines.length * 6;

  // Address
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (company.address) {
    const addrLines = doc.splitTextToSize(company.address, availableWidth);
    doc.text(addrLines, centerX, yPos + 2, { align: 'center' });
    yPos += addrLines.length * 4 + 2;
  }

  // CIN and PAN
  if (company.cin || company.pan) {
    doc.setFontSize(9);
    let details = [];
    if (company.cin) details.push(`CIN: ${company.cin}`);
    if (company.pan) details.push(`PAN: ${company.pan}`);
    doc.text(details.join('  |  '), centerX, yPos + 4, { align: 'center' });
    yPos += 6;
  }

  return yPos + SECTION_SPACING / 2;
};

const addDocumentTitle = (doc: jsPDF, title: string, subtitle: string, yPos: number): number => {
  const pageWidth = getPageWidth(doc);
  const centerX = pageWidth / 2;

  // Draw underline box for title
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), centerX, yPos, { align: 'center' });
  
  // Underline
  const titleWidth = doc.getTextWidth(title.toUpperCase());
  doc.setLineWidth(0.5);
  doc.line(centerX - titleWidth / 2, yPos + 1.5, centerX + titleWidth / 2, yPos + 1.5);
  yPos += 7;

  if (subtitle) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, centerX, yPos, { align: 'center' });
    yPos += 6;
  }

  return yPos + SECTION_SPACING / 2;
};

const addSignatureBlock = (doc: jsPDF, company: CompanyInfo, yPos: number): number => {
  const pageWidth = getPageWidth(doc);
  const leftX = MARGIN_SIDE;
  const rightX = pageWidth - MARGIN_SIDE;
  
  // Check if we need a new page
  if (yPos + 50 > getPageHeight(doc) - 20) {
    doc.addPage();
    yPos = MARGIN_TOP;
  }

  yPos += 15;

  // Left side - For the organization
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('As per our report of even date attached', leftX, yPos);
  yPos += 15;

  doc.text('For and on behalf of', leftX, yPos);
  doc.setFont('helvetica', 'bold');
  doc.text(company.companyName, leftX, yPos + 5);
  
  // Right side - Auditor
  doc.setFont('helvetica', 'normal');
  doc.text('For M/s.', rightX - 60, yPos);
  doc.text('Chartered Accountants', rightX - 60, yPos + 5);
  doc.text('Firm Reg No:', rightX - 60, yPos + 10);

  yPos += 25;

  // Signature lines
  doc.text('_________________________', leftX, yPos);
  doc.text('_________________________', rightX - 60, yPos);
  
  yPos += 5;
  doc.text('President / Secretary / Treasurer', leftX, yPos);
  doc.text('Partner', rightX - 60, yPos);
  doc.text('M. No:', rightX - 60, yPos + 5);

  yPos += 15;

  // Place and Date
  doc.text(`Place: ${company.address.split(',')[0] || 'Hyderabad'}`, leftX, yPos);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, leftX, yPos + 5);

  return yPos + 10;
};

export const generateIncomeExpenditurePDF = (
  company: CompanyInfo,
  data: IncomeExpenditureData
): jsPDF => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  let yPos = MARGIN_TOP;
  const pageWidth = getPageWidth(doc);
  const halfWidth = (pageWidth - MARGIN_SIDE * 2) / 2 - 2;

  // Header
  yPos = addCompanyHeader(doc, company, yPos);
  yPos = addDocumentTitle(
    doc,
    'INCOME AND EXPENDITURE ACCOUNT',
    `For the year ended 31st March ${company.financialYear.split('-')[0] ? parseInt(company.financialYear.split('-')[0]) + 1 : new Date().getFullYear()}`,
    yPos
  );

  // Create side-by-side layout
  const startY = yPos;

  // Left side - Expenditure
  const expenditureData: any[][] = [];
  data.expenditure.forEach((item, idx) => {
    expenditureData.push([
      item.particulars,
      item.journalRef || '',
      formatCurrency(item.amount)
    ]);
  });
  
  // Add totals row for expenditure
  if (data.surplus > 0) {
    expenditureData.push(['Surplus (Excess of Income over Expenditure)', '', formatCurrency(data.surplus)]);
  }
  expenditureData.push(['TOTAL', '', formatCurrency(data.totalIncome)]);

  autoTable(doc, {
    startY: startY,
    head: [['EXPENDITURE', 'Ref.', 'Amount (₹)']],
    body: expenditureData,
    theme: 'grid',
    styles: { 
      fontSize: TABLE_FONT_SIZE, 
      cellPadding: TABLE_CELL_PADDING,
      lineColor: [0, 0, 0],
      lineWidth: 0.2
    },
    headStyles: { 
      fontStyle: 'bold', 
      fillColor: [240, 240, 240], 
      textColor: [0, 0, 0],
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: halfWidth * 0.6, halign: 'left' },
      1: { cellWidth: halfWidth * 0.15, halign: 'center' },
      2: { cellWidth: halfWidth * 0.25, halign: 'right' }
    },
    margin: { left: MARGIN_SIDE, right: pageWidth / 2 + 1 },
    tableWidth: halfWidth,
    didParseCell: (hookData) => {
      const txt = String(hookData.cell.raw || '').toLowerCase();
      if (txt.includes('total') || txt.includes('surplus') || txt.includes('deficit')) {
        hookData.cell.styles.fontStyle = 'bold';
      }
    }
  });

  const leftTableFinalY = (doc as any).lastAutoTable.finalY;

  // Right side - Income
  const incomeData: any[][] = [];
  data.income.forEach((item, idx) => {
    incomeData.push([
      item.particulars,
      item.journalRef || '',
      formatCurrency(item.amount)
    ]);
  });
  
  // Add deficit if expenditure exceeds income
  if (data.surplus < 0) {
    incomeData.push(['Deficit (Excess of Expenditure over Income)', '', formatCurrency(Math.abs(data.surplus))]);
  }
  incomeData.push(['TOTAL', '', formatCurrency(data.totalIncome)]);

  autoTable(doc, {
    startY: startY,
    head: [['INCOME', 'Ref.', 'Amount (₹)']],
    body: incomeData,
    theme: 'grid',
    styles: { 
      fontSize: TABLE_FONT_SIZE, 
      cellPadding: TABLE_CELL_PADDING,
      lineColor: [0, 0, 0],
      lineWidth: 0.2
    },
    headStyles: { 
      fontStyle: 'bold', 
      fillColor: [240, 240, 240], 
      textColor: [0, 0, 0],
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: halfWidth * 0.6, halign: 'left' },
      1: { cellWidth: halfWidth * 0.15, halign: 'center' },
      2: { cellWidth: halfWidth * 0.25, halign: 'right' }
    },
    margin: { left: pageWidth / 2 + 1, right: MARGIN_SIDE },
    tableWidth: halfWidth,
    didParseCell: (hookData) => {
      const txt = String(hookData.cell.raw || '').toLowerCase();
      if (txt.includes('total') || txt.includes('surplus') || txt.includes('deficit')) {
        hookData.cell.styles.fontStyle = 'bold';
      }
    }
  });

  const rightTableFinalY = (doc as any).lastAutoTable.finalY;
  yPos = Math.max(leftTableFinalY, rightTableFinalY) + SECTION_SPACING;

  // Add signature block
  addSignatureBlock(doc, company, yPos);

  return doc;
};

// Function to process journals and create Income & Expenditure data
export const processJournalsForIncomeExpenditure = (
  journals: any[],
  journalLines: any[],
  accounts: any[]
): IncomeExpenditureData => {
  const accountMap = new Map(accounts.map(acc => [acc.id, acc]));
  
  const income: Array<{ particulars: string; amount: number; journalRef?: string }> = [];
  const expenditure: Array<{ particulars: string; amount: number; journalRef?: string }> = [];
  
  // Group journal lines by account
  const accountTotals = new Map<string, { debit: number; credit: number; name: string; type: string }>();
  
  journalLines.forEach(line => {
    const account = accountMap.get(line.account_id);
    if (!account) return;
    
    const existing = accountTotals.get(line.account_id) || { 
      debit: 0, 
      credit: 0, 
      name: account.account_name,
      type: account.account_type
    };
    
    existing.debit += Number(line.debit) || 0;
    existing.credit += Number(line.credit) || 0;
    accountTotals.set(line.account_id, existing);
  });
  
  // Categorize into income and expenditure based on account type
  const incomeTypes = ['Income', 'Revenue', 'Sales', 'interest income', 'other income'];
  const expenditureTypes = ['Expense', 'Cost', 'Purchase', 'Salary', 'Rent', 'Utilities'];
  
  accountTotals.forEach((totals, accountId) => {
    const netAmount = totals.credit - totals.debit;
    const accountType = totals.type.toLowerCase();
    
    // Determine if income or expenditure based on account type
    const isIncomeType = incomeTypes.some(t => accountType.includes(t.toLowerCase()));
    const isExpenseType = expenditureTypes.some(t => accountType.includes(t.toLowerCase()));
    
    if (isIncomeType && totals.credit > 0) {
      income.push({
        particulars: totals.name,
        amount: totals.credit,
        journalRef: `JRN-${accountId.slice(0, 6).toUpperCase()}`
      });
    } else if (isExpenseType && totals.debit > 0) {
      expenditure.push({
        particulars: totals.name,
        amount: totals.debit,
        journalRef: `JRN-${accountId.slice(0, 6).toUpperCase()}`
      });
    } else if (totals.credit > totals.debit) {
      // Net credit - treat as income
      income.push({
        particulars: totals.name,
        amount: totals.credit - totals.debit,
        journalRef: `JRN-${accountId.slice(0, 6).toUpperCase()}`
      });
    } else if (totals.debit > totals.credit) {
      // Net debit - treat as expenditure
      expenditure.push({
        particulars: totals.name,
        amount: totals.debit - totals.credit,
        journalRef: `JRN-${accountId.slice(0, 6).toUpperCase()}`
      });
    }
  });
  
  // Add default categories if empty
  if (income.length === 0) {
    income.push({ particulars: 'Subscription Fees', amount: 0 });
    income.push({ particulars: 'Donations Received', amount: 0 });
    income.push({ particulars: 'Interest on Deposits', amount: 0 });
    income.push({ particulars: 'Miscellaneous Income', amount: 0 });
  }
  
  if (expenditure.length === 0) {
    expenditure.push({ particulars: 'Salaries & Wages', amount: 0 });
    expenditure.push({ particulars: 'Rent', amount: 0 });
    expenditure.push({ particulars: 'Printing & Stationery', amount: 0 });
    expenditure.push({ particulars: 'Telephone & Internet', amount: 0 });
    expenditure.push({ particulars: 'Electricity Charges', amount: 0 });
    expenditure.push({ particulars: 'Audit Fees', amount: 0 });
    expenditure.push({ particulars: 'Bank Charges', amount: 0 });
    expenditure.push({ particulars: 'Miscellaneous Expenses', amount: 0 });
  }
  
  const totalIncome = income.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenditure = expenditure.reduce((sum, item) => sum + item.amount, 0);
  const surplus = totalIncome - totalExpenditure;
  
  return {
    income,
    expenditure,
    totalIncome,
    totalExpenditure,
    surplus
  };
};

// Generate Journal Audit Report PDF
export const generateJournalAuditPDF = (
  company: CompanyInfo,
  journals: any[],
  journalLines: any[],
  accounts: any[]
): jsPDF => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  let yPos = MARGIN_TOP;
  const pageWidth = getPageWidth(doc);

  // Header
  yPos = addCompanyHeader(doc, company, yPos);
  yPos = addDocumentTitle(
    doc,
    'JOURNAL AUDIT REPORT',
    `For the Financial Year ${company.financialYear}`,
    yPos
  );

  // Summary section
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('SUMMARY OF JOURNAL ENTRIES', MARGIN_SIDE, yPos);
  yPos += 8;

  const totalDebit = journals.reduce((sum, j) => sum + (Number(j.total_debit) || 0), 0);
  const totalCredit = journals.reduce((sum, j) => sum + (Number(j.total_credit) || 0), 0);
  const postedCount = journals.filter(j => j.status === 'posted').length;
  const draftCount = journals.filter(j => j.status === 'draft').length;

  autoTable(doc, {
    startY: yPos,
    body: [
      ['Total Journal Entries', journals.length.toString()],
      ['Posted Entries', postedCount.toString()],
      ['Draft Entries', draftCount.toString()],
      ['Total Debits', formatCurrency(totalDebit)],
      ['Total Credits', formatCurrency(totalCredit)],
      ['Difference (Should be Zero)', formatCurrency(totalDebit - totalCredit)]
    ],
    theme: 'plain',
    styles: { fontSize: TABLE_FONT_SIZE, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: 'bold' },
      1: { cellWidth: 50, halign: 'right' }
    },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE }
  });

  yPos = (doc as any).lastAutoTable.finalY + SECTION_SPACING;

  // Journal entries detail
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DETAILED JOURNAL ENTRIES', MARGIN_SIDE, yPos);
  yPos += 8;

  const journalData = journals.slice(0, 50).map((journal, idx) => {
    const lines = journalLines.filter(l => l.journal_id === journal.id);
    const journalAccounts = lines.map(l => {
      const acc = accounts.find(a => a.id === l.account_id);
      return acc ? acc.account_name : 'Unknown';
    }).join(', ');
    
    return [
      (idx + 1).toString(),
      journal.journal_number || '-',
      new Date(journal.journal_date).toLocaleDateString('en-IN'),
      journal.narration?.substring(0, 40) || '-',
      formatCurrency(Number(journal.total_debit) || 0),
      formatCurrency(Number(journal.total_credit) || 0),
      journal.status || 'draft'
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Journal No.', 'Date', 'Narration', 'Debit', 'Credit', 'Status']],
    body: journalData,
    theme: 'grid',
    styles: { 
      fontSize: 8, 
      cellPadding: 1.5,
      lineColor: [0, 0, 0],
      lineWidth: 0.1
    },
    headStyles: { 
      fontStyle: 'bold', 
      fillColor: [220, 220, 220], 
      textColor: [0, 0, 0],
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 65 },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 25, halign: 'right' },
      6: { cellWidth: 18, halign: 'center' }
    },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (hookData) => {
      if (hookData.column.index === 6) {
        const status = String(hookData.cell.raw).toLowerCase();
        if (status === 'posted') {
          hookData.cell.styles.textColor = [0, 128, 0];
        } else if (status === 'draft') {
          hookData.cell.styles.textColor = [200, 150, 0];
        } else if (status === 'void') {
          hookData.cell.styles.textColor = [200, 0, 0];
        }
      }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + SECTION_SPACING;

  // Account-wise summary
  if (yPos + 60 > getPageHeight(doc) - 20) {
    doc.addPage();
    yPos = MARGIN_TOP;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('ACCOUNT-WISE SUMMARY', MARGIN_SIDE, yPos);
  yPos += 8;

  // Group by account
  const accountSummary = new Map<string, { name: string; debit: number; credit: number }>();
  journalLines.forEach(line => {
    const acc = accounts.find(a => a.id === line.account_id);
    if (!acc) return;
    
    const existing = accountSummary.get(acc.id) || { name: acc.account_name, debit: 0, credit: 0 };
    existing.debit += Number(line.debit) || 0;
    existing.credit += Number(line.credit) || 0;
    accountSummary.set(acc.id, existing);
  });

  const accountData = Array.from(accountSummary.values())
    .sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit))
    .slice(0, 20)
    .map((acc, idx) => [
      (idx + 1).toString(),
      acc.name,
      formatCurrency(acc.debit),
      formatCurrency(acc.credit),
      formatCurrency(acc.debit - acc.credit)
    ]);

  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Account Name', 'Total Debit', 'Total Credit', 'Net Balance']],
    body: accountData,
    theme: 'grid',
    styles: { 
      fontSize: 9, 
      cellPadding: 2,
      lineColor: [0, 0, 0],
      lineWidth: 0.1
    },
    headStyles: { 
      fontStyle: 'bold', 
      fillColor: [220, 220, 220], 
      textColor: [0, 0, 0],
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 70 },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' }
    },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (hookData) => {
      if (hookData.column.index === 4 && hookData.section === 'body') {
        const val = parseFloat(String(hookData.cell.raw).replace(/[^0-9.-]/g, '')) || 0;
        if (val < 0) {
          hookData.cell.styles.textColor = [200, 0, 0];
        }
      }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + SECTION_SPACING;

  // Certification
  if (yPos + 40 > getPageHeight(doc) - 20) {
    doc.addPage();
    yPos = MARGIN_TOP;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('CERTIFICATION:', MARGIN_SIDE, yPos);
  yPos += 6;
  
  const certText = `This is to certify that the above Journal Audit Report for ${company.companyName} for the Financial Year ${company.financialYear} has been prepared based on the journal entries recorded in the books of accounts. The entries have been verified for accuracy and compliance with applicable accounting standards.`;
  const certLines = doc.splitTextToSize(certText, pageWidth - MARGIN_SIDE * 2);
  doc.text(certLines, MARGIN_SIDE, yPos);
  
  yPos += certLines.length * 4 + 10;

  // Signature
  doc.text('_________________________', MARGIN_SIDE, yPos + 15);
  doc.text('Authorized Signatory', MARGIN_SIDE, yPos + 20);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - MARGIN_SIDE - 40, yPos + 20);

  return doc;
};
