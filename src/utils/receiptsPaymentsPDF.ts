import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReceiptsPaymentsData {
  receipts: Array<{
    particulars: string;
    amount: number;
    accountType?: string;
  }>;
  payments: Array<{
    particulars: string;
    amount: number;
    accountType?: string;
  }>;
  openingBalance: number;
  closingBalance: number;
  totalReceipts: number;
  totalPayments: number;
}

export interface TrialBalanceData {
  accounts: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
  }>;
  totals: {
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
  };
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

  doc.setFontSize(HEADER_FONT_SIZE + 2);
  doc.setFont('helvetica', 'bold');
  const nameLines = doc.splitTextToSize(company.companyName.toUpperCase(), availableWidth);
  doc.text(nameLines, centerX, yPos, { align: 'center' });
  yPos += nameLines.length * 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (company.address) {
    const addrLines = doc.splitTextToSize(company.address, availableWidth);
    doc.text(addrLines, centerX, yPos + 2, { align: 'center' });
    yPos += addrLines.length * 4 + 2;
  }

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

  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), centerX, yPos, { align: 'center' });
  
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
  
  if (yPos + 50 > getPageHeight(doc) - 20) {
    doc.addPage();
    yPos = MARGIN_TOP;
  }

  yPos += 15;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('As per our report of even date attached', leftX, yPos);
  yPos += 15;

  doc.text('For and on behalf of', leftX, yPos);
  doc.setFont('helvetica', 'bold');
  doc.text(company.companyName, leftX, yPos + 5);
  
  doc.setFont('helvetica', 'normal');
  doc.text('For M/s.', rightX - 60, yPos);
  doc.text('Chartered Accountants', rightX - 60, yPos + 5);
  doc.text('Firm Reg No:', rightX - 60, yPos + 10);

  yPos += 25;

  doc.text('_________________________', leftX, yPos);
  doc.text('_________________________', rightX - 60, yPos);
  
  yPos += 5;
  doc.text('President / Secretary / Treasurer', leftX, yPos);
  doc.text('Partner', rightX - 60, yPos);
  doc.text('M. No:', rightX - 60, yPos + 5);

  yPos += 15;

  doc.text(`Place: ${company.address.split(',')[0] || 'Hyderabad'}`, leftX, yPos);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, leftX, yPos + 5);

  return yPos + 10;
};

// Generate Receipts & Payments Account PDF
export const generateReceiptsPaymentsPDF = (
  company: CompanyInfo,
  data: ReceiptsPaymentsData
): jsPDF => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  let yPos = MARGIN_TOP;
  const pageWidth = getPageWidth(doc);
  const halfWidth = (pageWidth - MARGIN_SIDE * 2) / 2 - 2;

  yPos = addCompanyHeader(doc, company, yPos);
  yPos = addDocumentTitle(
    doc,
    'RECEIPTS AND PAYMENTS ACCOUNT',
    `For the year ended 31st March ${company.financialYear.split('-')[0] ? parseInt(company.financialYear.split('-')[0]) + 1 : new Date().getFullYear()}`,
    yPos
  );

  const startY = yPos;

  // Left side - Receipts
  const receiptsData: any[][] = [];
  receiptsData.push(['To Opening Balance (Cash/Bank)', '', formatCurrency(data.openingBalance)]);
  
  data.receipts.forEach((item) => {
    receiptsData.push([
      `To ${item.particulars}`,
      item.accountType || '',
      formatCurrency(item.amount)
    ]);
  });
  
  receiptsData.push(['TOTAL', '', formatCurrency(data.openingBalance + data.totalReceipts)]);

  autoTable(doc, {
    startY: startY,
    head: [['RECEIPTS', 'A/c Type', 'Amount (₹)']],
    body: receiptsData,
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
      0: { cellWidth: halfWidth * 0.55, halign: 'left' },
      1: { cellWidth: halfWidth * 0.2, halign: 'center' },
      2: { cellWidth: halfWidth * 0.25, halign: 'right' }
    },
    margin: { left: MARGIN_SIDE, right: pageWidth / 2 + 1 },
    tableWidth: halfWidth,
    didParseCell: (hookData) => {
      const txt = String(hookData.cell.raw || '').toLowerCase();
      if (txt.includes('total') || txt.includes('opening') || txt.includes('closing')) {
        hookData.cell.styles.fontStyle = 'bold';
      }
    }
  });

  const leftTableFinalY = (doc as any).lastAutoTable.finalY;

  // Right side - Payments
  const paymentsData: any[][] = [];
  
  data.payments.forEach((item) => {
    paymentsData.push([
      `By ${item.particulars}`,
      item.accountType || '',
      formatCurrency(item.amount)
    ]);
  });
  
  paymentsData.push(['By Closing Balance (Cash/Bank)', '', formatCurrency(data.closingBalance)]);
  paymentsData.push(['TOTAL', '', formatCurrency(data.totalPayments + data.closingBalance)]);

  autoTable(doc, {
    startY: startY,
    head: [['PAYMENTS', 'A/c Type', 'Amount (₹)']],
    body: paymentsData,
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
      0: { cellWidth: halfWidth * 0.55, halign: 'left' },
      1: { cellWidth: halfWidth * 0.2, halign: 'center' },
      2: { cellWidth: halfWidth * 0.25, halign: 'right' }
    },
    margin: { left: pageWidth / 2 + 1, right: MARGIN_SIDE },
    tableWidth: halfWidth,
    didParseCell: (hookData) => {
      const txt = String(hookData.cell.raw || '').toLowerCase();
      if (txt.includes('total') || txt.includes('opening') || txt.includes('closing')) {
        hookData.cell.styles.fontStyle = 'bold';
      }
    }
  });

  const rightTableFinalY = (doc as any).lastAutoTable.finalY;
  yPos = Math.max(leftTableFinalY, rightTableFinalY) + SECTION_SPACING;

  addSignatureBlock(doc, company, yPos);

  return doc;
};

// Generate Trial Balance PDF with opening and closing balances
export const generateTrialBalancePDF = (
  company: CompanyInfo,
  data: TrialBalanceData
): jsPDF => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  let yPos = MARGIN_TOP;

  yPos = addCompanyHeader(doc, company, yPos);
  yPos = addDocumentTitle(
    doc,
    'TRIAL BALANCE',
    `As at 31st March ${company.financialYear.split('-')[0] ? parseInt(company.financialYear.split('-')[0]) + 1 : new Date().getFullYear()}`,
    yPos
  );

  // Trial Balance Table
  const tableData = data.accounts.map((acc, idx) => [
    (idx + 1).toString(),
    acc.accountCode,
    acc.accountName,
    acc.accountType,
    formatCurrency(acc.openingDebit),
    formatCurrency(acc.openingCredit),
    formatCurrency(acc.periodDebit),
    formatCurrency(acc.periodCredit),
    formatCurrency(acc.closingDebit),
    formatCurrency(acc.closingCredit)
  ]);

  // Add totals row
  tableData.push([
    '',
    '',
    'TOTAL',
    '',
    formatCurrency(data.totals.openingDebit),
    formatCurrency(data.totals.openingCredit),
    formatCurrency(data.totals.periodDebit),
    formatCurrency(data.totals.periodCredit),
    formatCurrency(data.totals.closingDebit),
    formatCurrency(data.totals.closingCredit)
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [[
      '#',
      'Code',
      'Account Name',
      'Type',
      { content: 'Opening Balance', colSpan: 2 },
      { content: 'During Period', colSpan: 2 },
      { content: 'Closing Balance', colSpan: 2 }
    ], [
      '',
      '',
      '',
      '',
      'Debit',
      'Credit',
      'Debit',
      'Credit',
      'Debit',
      'Credit'
    ]],
    body: tableData,
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
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 55 },
      3: { cellWidth: 25 },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 25, halign: 'right' },
      6: { cellWidth: 25, halign: 'right' },
      7: { cellWidth: 25, halign: 'right' },
      8: { cellWidth: 25, halign: 'right' },
      9: { cellWidth: 25, halign: 'right' }
    },
    margin: { left: MARGIN_SIDE, right: MARGIN_SIDE },
    didParseCell: (hookData) => {
      const txt = String(hookData.cell.raw || '').toLowerCase();
      if (txt.includes('total')) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [245, 245, 245];
      }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + SECTION_SPACING;

  // Add verification section
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const differenceOpening = data.totals.openingDebit - data.totals.openingCredit;
  const differencePeriod = data.totals.periodDebit - data.totals.periodCredit;
  const differenceClosing = data.totals.closingDebit - data.totals.closingCredit;
  
  doc.text('Verification:', MARGIN_SIDE, yPos);
  yPos += 5;
  doc.text(`Opening Balance Difference: ${formatCurrency(differenceOpening)} ${differenceOpening === 0 ? '✓' : '⚠'}`, MARGIN_SIDE + 5, yPos);
  yPos += 5;
  doc.text(`Period Transactions Difference: ${formatCurrency(differencePeriod)} ${differencePeriod === 0 ? '✓' : '⚠'}`, MARGIN_SIDE + 5, yPos);
  yPos += 5;
  doc.text(`Closing Balance Difference: ${formatCurrency(differenceClosing)} ${differenceClosing === 0 ? '✓' : '⚠'}`, MARGIN_SIDE + 5, yPos);

  yPos += 10;
  addSignatureBlock(doc, company, yPos);

  return doc;
};

// Process journals to create Receipts & Payments data
export const processJournalsForReceiptsPayments = (
  journals: any[],
  journalLines: any[],
  accounts: any[]
): ReceiptsPaymentsData => {
  const accountMap = new Map(accounts.map(acc => [acc.id, acc]));
  
  const receipts: Array<{ particulars: string; amount: number; accountType?: string }> = [];
  const payments: Array<{ particulars: string; amount: number; accountType?: string }> = [];
  
  // Cash/Bank account types for identifying cash transactions
  const cashBankTypes = ['cash', 'bank', 'petty cash'];
  
  // Group journal lines by account for cash-based transactions
  const cashAccounts = accounts.filter(acc => 
    cashBankTypes.some(t => acc.account_type.toLowerCase().includes(t))
  );
  const cashAccountIds = new Set(cashAccounts.map(acc => acc.id));
  
  // Calculate opening balance (assume from first journal entry or 0)
  let openingBalance = 0;
  
  // Process journal lines for cash movements
  const accountMovements = new Map<string, { debit: number; credit: number; name: string; type: string }>();
  
  journalLines.forEach(line => {
    const account = accountMap.get(line.account_id);
    if (!account) return;
    
    // Skip cash/bank accounts themselves - we track movements to/from them
    if (cashAccountIds.has(line.account_id)) {
      // Track opening/closing for cash accounts
      openingBalance += Number(line.credit) || 0; // Credits to cash = opening balance contributions
      return;
    }
    
    // Find if this line has a corresponding cash/bank entry in same journal
    const journalId = line.journal_id;
    const samJournalLines = journalLines.filter(l => l.journal_id === journalId);
    const hasCashEntry = samJournalLines.some(l => cashAccountIds.has(l.account_id));
    
    if (!hasCashEntry) return; // Only process cash-based transactions
    
    const existing = accountMovements.get(line.account_id) || { 
      debit: 0, 
      credit: 0, 
      name: account.account_name,
      type: account.account_type
    };
    
    existing.debit += Number(line.debit) || 0;
    existing.credit += Number(line.credit) || 0;
    accountMovements.set(line.account_id, existing);
  });
  
  // Categorize movements as receipts or payments
  accountMovements.forEach((movement, accountId) => {
    if (movement.credit > movement.debit) {
      // Credit entry = Receipt (money coming in)
      receipts.push({
        particulars: movement.name,
        amount: movement.credit - movement.debit,
        accountType: movement.type
      });
    } else if (movement.debit > movement.credit) {
      // Debit entry = Payment (money going out)
      payments.push({
        particulars: movement.name,
        amount: movement.debit - movement.credit,
        accountType: movement.type
      });
    }
  });
  
  // Add default items if empty
  if (receipts.length === 0) {
    receipts.push({ particulars: 'Subscription Receipts', amount: 0 });
    receipts.push({ particulars: 'Donations Received', amount: 0 });
    receipts.push({ particulars: 'Interest Received', amount: 0 });
  }
  
  if (payments.length === 0) {
    payments.push({ particulars: 'Salaries Paid', amount: 0 });
    payments.push({ particulars: 'Rent Paid', amount: 0 });
    payments.push({ particulars: 'Office Expenses', amount: 0 });
    payments.push({ particulars: 'Miscellaneous Payments', amount: 0 });
  }
  
  const totalReceipts = receipts.reduce((sum, r) => sum + r.amount, 0);
  const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
  const closingBalance = openingBalance + totalReceipts - totalPayments;
  
  return {
    receipts,
    payments,
    openingBalance,
    closingBalance: Math.max(0, closingBalance),
    totalReceipts,
    totalPayments
  };
};

// Process journals to create Trial Balance data
export const processJournalsForTrialBalance = (
  journals: any[],
  journalLines: any[],
  accounts: any[]
): TrialBalanceData => {
  const accountMap = new Map(accounts.map(acc => [acc.id, acc]));
  
  // Sort journals by date to separate opening from period transactions
  const sortedJournals = [...journals].sort((a, b) => 
    new Date(a.journal_date).getTime() - new Date(b.journal_date).getTime()
  );
  
  // Assume first 10% of journals are opening balances (or use a date cutoff)
  const openingCutoff = Math.max(1, Math.floor(sortedJournals.length * 0.1));
  const openingJournalIds = new Set(sortedJournals.slice(0, openingCutoff).map(j => j.id));
  
  // Track balances per account
  const accountBalances = new Map<string, {
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
  }>();
  
  journalLines.forEach(line => {
    const accountId = line.account_id;
    if (!accountId) return;
    
    const existing = accountBalances.get(accountId) || {
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 0
    };
    
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    
    if (openingJournalIds.has(line.journal_id)) {
      existing.openingDebit += debit;
      existing.openingCredit += credit;
    } else {
      existing.periodDebit += debit;
      existing.periodCredit += credit;
    }
    
    accountBalances.set(accountId, existing);
  });
  
  // Build trial balance data
  const trialBalanceAccounts: TrialBalanceData['accounts'] = [];
  
  accountBalances.forEach((balances, accountId) => {
    const account = accountMap.get(accountId);
    if (!account) return;
    
    // Calculate closing balances
    const totalDebit = balances.openingDebit + balances.periodDebit;
    const totalCredit = balances.openingCredit + balances.periodCredit;
    
    let closingDebit = 0;
    let closingCredit = 0;
    
    if (totalDebit > totalCredit) {
      closingDebit = totalDebit - totalCredit;
    } else {
      closingCredit = totalCredit - totalDebit;
    }
    
    trialBalanceAccounts.push({
      accountCode: account.account_code,
      accountName: account.account_name,
      accountType: account.account_type,
      openingDebit: balances.openingDebit,
      openingCredit: balances.openingCredit,
      periodDebit: balances.periodDebit,
      periodCredit: balances.periodCredit,
      closingDebit,
      closingCredit
    });
  });
  
  // Sort by account code
  trialBalanceAccounts.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  
  // Calculate totals
  const totals = trialBalanceAccounts.reduce((acc, item) => ({
    openingDebit: acc.openingDebit + item.openingDebit,
    openingCredit: acc.openingCredit + item.openingCredit,
    periodDebit: acc.periodDebit + item.periodDebit,
    periodCredit: acc.periodCredit + item.periodCredit,
    closingDebit: acc.closingDebit + item.closingDebit,
    closingCredit: acc.closingCredit + item.closingCredit
  }), {
    openingDebit: 0,
    openingCredit: 0,
    periodDebit: 0,
    periodCredit: 0,
    closingDebit: 0,
    closingCredit: 0
  });
  
  return {
    accounts: trialBalanceAccounts,
    totals
  };
};
