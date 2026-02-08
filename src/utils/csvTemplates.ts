export type ModuleKey = 'ledgers' | 'clients' | 'vendors' | 'invoices' | 'quotations';

interface TemplateConfig {
  required: string[];
  optional: string[];
}

const templates: Record<ModuleKey, TemplateConfig> = {
  ledgers: {
    required: ['ledger_name', 'opening_balance'],
    optional: ['contact_person', 'email', 'phone', 'gst_number', 'address', 'description'],
  },
  clients: {
    required: ['client_name', 'email'],
    optional: ['phone', 'gst_number', 'billing_address', 'shipping_address', 'contact_person'],
  },
  vendors: {
    required: ['vendor_name', 'email'],
    optional: ['phone', 'gst_number', 'billing_address', 'contact_person'],
  },
  invoices: {
    required: ['invoice_number', 'invoice_date', 'client_name', 'item_description', 'quantity', 'rate', 'gst_rate'],
    optional: ['due_date', 'client_gst_number', 'hsn_sac', 'notes'],
  },
  quotations: {
    required: ['quotation_number', 'quotation_date', 'client_name', 'item_description', 'quantity', 'rate'],
    optional: ['hsn_sac', 'gst_rate', 'notes'],
  },
};

export const getTemplateHeaders = (moduleKey: ModuleKey): { required: string[]; optional: string[] } => {
  return templates[moduleKey] || { required: [], optional: [] };
};

export const getAllTemplateHeaders = (moduleKey: ModuleKey): string[] => {
  const config = templates[moduleKey];
  return [...config.required, ...config.optional];
};

export const downloadTemplateCSV = (moduleKey: ModuleKey) => {
  const config = getTemplateHeaders(moduleKey);
  const headers = [...config.required, ...config.optional];
  const csv = headers.join(',') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${moduleKey}_template.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
