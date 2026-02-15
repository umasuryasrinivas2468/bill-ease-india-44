/**
 * CSV Export Utilities
 * Provides functions to export various business data formats to CSV
 */

export interface CSVExportOptions {
  filename?: string;
  includeTimestamp?: boolean;
  encoding?: string;
}

/**
 * Convert array of objects to CSV string
 */
export const objectsToCSV = (data: Record<string, any>[], headers?: string[]): string => {
  if (data.length === 0) return '';

  // Use provided headers or extract from first object
  const csvHeaders = headers || Object.keys(data[0]);
  
  // Create header row
  const headerRow = csvHeaders.map(header => escapeCSVField(header)).join(',');
  
  // Create data rows
  const dataRows = data.map(obj => 
    csvHeaders.map(header => escapeCSVField(String(obj[header] || ''))).join(',')
  );
  
  return [headerRow, ...dataRows].join('\n');
};

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
export const escapeCSVField = (field: string): string => {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
};

/**
 * Download CSV data as file
 */
export const downloadCSV = (csvData: string, filename: string): void => {
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};

/**
 * Generate filename with timestamp
 */
export const generateFilename = (baseName: string, includeTimestamp = true): string => {
  const timestamp = includeTimestamp 
    ? `_${new Date().toISOString().split('T')[0]}`
    : '';
  return `${baseName}${timestamp}.csv`;
};

/**
 * Export quotations to CSV
 */
export const exportQuotationsToCSV = (quotations: any[], options: CSVExportOptions = {}) => {
  const headers = [
    'Quotation Number',
    'Client Name',
    'Client Email',
    'Client Phone',
    'Client Address',
    'Date',
    'Validity Period (Days)',
    'Subtotal',
    'Discount',
    'Tax Amount',
    'Total Amount',
    'Status',
    'Terms & Conditions',
    'Created At',
    'Items'
  ];

  const csvData = quotations.map(quotation => ({
    'Quotation Number': quotation.quotation_number || '',
    'Client Name': quotation.client_name || '',
    'Client Email': quotation.client_email || '',
    'Client Phone': quotation.client_phone || '',
    'Client Address': quotation.client_address || '',
    'Date': quotation.quotation_date || '',
    'Validity Period (Days)': quotation.validity_period || '',
    'Subtotal': quotation.subtotal || 0,
    'Discount': quotation.discount || 0,
    'Tax Amount': quotation.tax_amount || 0,
    'Total Amount': quotation.total_amount || 0,
    'Status': quotation.status || 'draft',
    'Terms & Conditions': quotation.terms_conditions || '',
    'Created At': quotation.created_at ? new Date(quotation.created_at).toLocaleDateString() : '',
    'Items': quotation.items ? 
      quotation.items.map((item: any) => `${item.name} (Qty: ${item.quantity}, Price: ${item.price})`).join('; ') 
      : ''
  }));

  const csv = objectsToCSV(csvData, headers);
  const filename = generateFilename(options.filename || 'quotations', options.includeTimestamp);
  downloadCSV(csv, filename);
  
  return { filename, recordCount: quotations.length };
};

/**
 * Export journals to CSV
 */
export const exportJournalsToCSV = (journals: any[], journalLines: any[], options: CSVExportOptions = {}) => {
  const headers = [
    'Journal Date',
    'Journal Number',
    'Narration',
    'Status',
    'Total Debit',
    'Total Credit',
    'Account Code',
    'Account Name',
    'Line Debit',
    'Line Credit',
    'Line Narration',
    'Created At'
  ];

  const csvData: any[] = [];

  journals.forEach(journal => {
    const journalLinesForThisJournal = journalLines.filter(line => line.journal_id === journal.id);
    
    if (journalLinesForThisJournal.length === 0) {
      // Add journal without lines
      csvData.push({
        'Journal Date': journal.journal_date || '',
        'Journal Number': journal.journal_number || '',
        'Narration': journal.narration || '',
        'Status': journal.status || 'draft',
        'Total Debit': journal.total_debit || 0,
        'Total Credit': journal.total_credit || 0,
        'Account Code': '',
        'Account Name': '',
        'Line Debit': '',
        'Line Credit': '',
        'Line Narration': '',
        'Created At': journal.created_at ? new Date(journal.created_at).toLocaleDateString() : ''
      });
    } else {
      // Add one row per journal line
      journalLinesForThisJournal.forEach(line => {
        csvData.push({
          'Journal Date': journal.journal_date || '',
          'Journal Number': journal.journal_number || '',
          'Narration': journal.narration || '',
          'Status': journal.status || 'draft',
          'Total Debit': journal.total_debit || 0,
          'Total Credit': journal.total_credit || 0,
          'Account Code': line.account_code || '',
          'Account Name': line.account_name || '',
          'Line Debit': line.debit || '',
          'Line Credit': line.credit || '',
          'Line Narration': line.line_narration || '',
          'Created At': journal.created_at ? new Date(journal.created_at).toLocaleDateString() : ''
        });
      });
    }
  });

  const csv = objectsToCSV(csvData, headers);
  const filename = generateFilename(options.filename || 'journals', options.includeTimestamp);
  downloadCSV(csv, filename);
  
  return { filename, recordCount: csvData.length };
};

/**
 * Export ledger data to CSV
 */
export const exportLedgersToCSV = (ledgerData: any[], options: CSVExportOptions = {}) => {
  const headers = [
    'Account Code',
    'Account Name',
    'Account Type',
    'Transaction Date',
    'Transaction Type',
    'Reference',
    'Debit',
    'Credit',
    'Balance',
    'Narration'
  ];

  const csvData = ledgerData.map(entry => ({
    'Account Code': entry.account_code || '',
    'Account Name': entry.account_name || '',
    'Account Type': entry.account_type || '',
    'Transaction Date': entry.transaction_date || '',
    'Transaction Type': entry.transaction_type || '',
    'Reference': entry.reference || '',
    'Debit': entry.debit || '',
    'Credit': entry.credit || '',
    'Balance': entry.balance || '',
    'Narration': entry.narration || ''
  }));

  const csv = objectsToCSV(csvData, headers);
  const filename = generateFilename(options.filename || 'ledgers', options.includeTimestamp);
  downloadCSV(csv, filename);
  
  return { filename, recordCount: ledgerData.length };
};

/**
 * Export general account summary to CSV
 */
export const exportAccountSummaryToCSV = (accounts: any[], options: CSVExportOptions = {}) => {
  const headers = [
    'Account Code',
    'Account Name',
    'Account Type',
    'Opening Balance',
    'Current Balance',
    'Created At',
    'Updated At'
  ];

  const csvData = accounts.map(account => ({
    'Account Code': account.account_code || '',
    'Account Name': account.account_name || '',
    'Account Type': account.account_type || '',
    'Opening Balance': account.opening_balance || 0,
    'Current Balance': account.current_balance || 0,
    'Created At': account.created_at ? new Date(account.created_at).toLocaleDateString() : '',
    'Updated At': account.updated_at ? new Date(account.updated_at).toLocaleDateString() : ''
  }));

  const csv = objectsToCSV(csvData, headers);
  const filename = generateFilename(options.filename || 'accounts_summary', options.includeTimestamp);
  downloadCSV(csv, filename);
  
  return { filename, recordCount: accounts.length };
};