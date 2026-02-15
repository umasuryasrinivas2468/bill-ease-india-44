import { ModuleKey, getTemplateHeaders, getAllTemplateHeaders } from './csvTemplates';

export interface ValidationError {
  rowIndex: number;
  field: string;
  value: any;
  reason: string;
}

interface ValidationRuleSet {
  required: string[];
  formatRules: Record<string, (val: any) => boolean>;
}

const getRuleSet = (moduleKey: ModuleKey): ValidationRuleSet => {
  const config = getTemplateHeaders(moduleKey);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  const phoneRegex = /^[+]?[0-9]{10,}$/;

  const rules: ValidationRuleSet = {
    required: config.required,
    formatRules: {},
  };

  // Email format
  if (['email', 'vendor_email'].includes('email')) {
    rules.formatRules['email'] = (val) => !val || emailRegex.test(String(val).trim());
  }

  // GST format
  rules.formatRules['gst_number'] = (val) => !val || gstRegex.test(String(val).toUpperCase().trim());

  // Phone format
  rules.formatRules['phone'] = (val) => !val || phoneRegex.test(String(val).trim());

  // Numeric fields
  ['quantity', 'rate', 'opening_balance', 'gst_rate'].forEach((field) => {
    rules.formatRules[field] = (val) => !val || !isNaN(Number(val));
  });

  // Date fields
  ['invoice_date', 'quotation_date', 'due_date'].forEach((field) => {
    rules.formatRules[field] = (val) => !val || !isNaN(new Date(String(val)).getTime());
  });

  return rules;
};

export const validateRows = (
  moduleKey: ModuleKey,
  rows: any[]
): { valid: any[]; invalid: Array<{ row: any; errors: ValidationError[] }> } => {
  const allHeaders = getAllTemplateHeaders(moduleKey);
  const rules = getRuleSet(moduleKey);
  const seen = new Set<string>();

  const valid: any[] = [];
  const invalid: Array<{ row: any; errors: ValidationError[] }> = [];

  rows.forEach((row, rowIndex) => {
    const errors: ValidationError[] = [];

    // Check required fields
    rules.required.forEach((field) => {
      const val = row[field];
      if (val === undefined || val === null || String(val).trim() === '') {
        errors.push({
          rowIndex,
          field,
          value: val,
          reason: `Required field missing`,
        });
      }
    });

    // Check format rules
    Object.entries(rules.formatRules).forEach(([field, isValid]) => {
      const val = row[field];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        if (!isValid(val)) {
          errors.push({
            rowIndex,
            field,
            value: val,
            reason: `Invalid format for ${field}`,
          });
        }
      }
    });

    // Check duplicates (on unique identifier per module)
    let dupKey = '';
    if (moduleKey === 'clients' && row['client_name']) {
      dupKey = `client:${String(row['client_name']).toLowerCase().trim()}`;
    } else if (moduleKey === 'vendors' && row['vendor_name']) {
      dupKey = `vendor:${String(row['vendor_name']).toLowerCase().trim()}`;
    } else if (moduleKey === 'invoices' && row['invoice_number']) {
      dupKey = `invoice:${String(row['invoice_number']).toLowerCase().trim()}`;
    } else if (moduleKey === 'ledgers' && row['ledger_name']) {
      dupKey = `ledger:${String(row['ledger_name']).toLowerCase().trim()}`;
    } else if (moduleKey === 'quotations' && row['quotation_number']) {
      dupKey = `quote:${String(row['quotation_number']).toLowerCase().trim()}`;
    }

    if (dupKey && seen.has(dupKey)) {
      errors.push({
        rowIndex,
        field: moduleKey === 'clients' ? 'client_name' : moduleKey === 'invoices' ? 'invoice_number' : 'quotation_number',
        value: row[Object.keys(row)[0]],
        reason: 'Duplicate record in import',
      });
    } else if (dupKey) {
      seen.add(dupKey);
    }

    if (errors.length > 0) {
      invalid.push({ row, errors });
    } else {
      valid.push(row);
    }
  });

  return { valid, invalid };
};
