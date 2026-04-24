export interface ExpenseCategory {
  id: string;
  user_id: string;
  category_name: string;
  description?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Hardcoded frontend grouping — no DB column needed.
// Categories not listed fall into the last "Other" group automatically.
export interface CategoryGroup {
  label: string;
  categories: string[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    label: 'Office & Administration',
    categories: [
      'Office Rent',
      'Office Supplies',
      'Utilities',
      'Communication',
      'Printing & Stationery',
      'Repairs & Maintenance',
      'Insurance',
      'Software & Subscriptions',
      'Audit Fees',
      'Legal Fees',
    ],
  },
  {
    label: 'Travel & Transportation',
    categories: [
      'Fuel & Transportation',
      'Travel & Accommodation',
    ],
  },
  {
    label: 'Marketing & Sales',
    categories: [
      'Advertising & Marketing',
      'Entertainment',
      'Selling Commission',
    ],
  },
  {
    label: 'Employee & Professional',
    categories: [
      'Salaries & Wages',
      'Staff Welfare',
      'Provident Fund',
      'Professional Fees',
      'Training & Development',
      'Directors Remuneration',
    ],
  },
  {
    label: 'Finance & Banking',
    categories: [
      'Bank Charges',
      'Interest on Loans',
      'Interest on OD/CC',
    ],
  },
  {
    label: 'Direct & Production Costs',
    categories: [
      'Raw Materials',
      'Packing Materials',
      'Purchase of Goods',
      'Direct Labour',
      'Freight & Cartage',
    ],
  },
  {
    label: 'Other Expenses',
    categories: [
      'Depreciation',
      'Amortization',
      'Bad Debts',
      'Donations',
      'CSR Expenses',
      'Miscellaneous',
    ],
  },
];

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily:     'Daily',
  weekly:    'Weekly',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  yearly:    'Yearly',
};

export interface RecurringExpense {
  id: string;
  user_id: string;
  name: string;
  vendor_id?: string;
  vendor_name: string;
  category_id?: string;
  category_name: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  payment_mode: 'cash' | 'bank' | 'credit_card' | 'debit_card' | 'upi' | 'cheque';
  frequency: RecurringFrequency;
  start_date: string;
  end_date?: string;
  next_due_date: string;
  last_generated_date?: string;
  is_active: boolean;
  description?: string;
  reference_number?: string;
  notes?: string;
  project_id?: string;
  project_name?: string;
  created_at: string;
  updated_at: string;
}

export type CreateRecurringExpenseData = Omit<
  RecurringExpense,
  'id' | 'user_id' | 'created_at' | 'updated_at' | 'last_generated_date'
>;

export interface Expense {
  id: string;
  user_id: string;
  vendor_id?: string;
  vendor_name: string;
  expense_number: string;
  expense_date: string;
  category_id?: string;
  category_name: string;
  description: string;
  amount: number;
  tax_amount: number;
  is_rcm?: boolean;
  rcm_rate?: number;
  rcm_amount?: number;
  vendor_gst_status?: string;
  tds_amount?: number;
  tds_rule_id?: string;
  total_amount: number;
  payment_mode: 'cash' | 'bank' | 'credit_card' | 'debit_card' | 'upi' | 'cheque';
  reference_number?: string;
  bill_number?: string;
  bill_attachment_url?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected' | 'posted';
  posted_to_ledger: boolean;
  journal_id?: string;
  project_id?: string;
  project_name?: string;
  created_at: string;
  updated_at: string;
  attachments?: ExpenseAttachment[];
}

export interface ExpenseAttachment {
  id: string;
  expense_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size?: number;
  uploaded_at: string;
}

export interface CreateExpenseData {
  vendor_id?: string;
  vendor_name: string;
  expense_date: string;
  category_id?: string;
  category_name: string;
  description: string;
  amount: number;
  tax_amount?: number;
  is_rcm?: boolean;
  rcm_rate?: number;
  rcm_amount?: number;
  vendor_gst_status?: string;
  tds_amount?: number;
  tds_rule_id?: string;
  payment_mode: 'cash' | 'bank' | 'credit_card' | 'debit_card' | 'upi' | 'cheque';
  reference_number?: string;
  bill_number?: string;
  notes?: string;
  project_id?: string;
  project_name?: string;
}

export interface ExpenseStats {
  totalExpenses: number;
  totalAmount: number;
  totalTaxAmount: number;
  monthlyExpenses: number;
  monthlyAmount: number;
  categoryBreakdown: {
    category_name: string;
    total_amount: number;
    count: number;
  }[];
  paymentModeBreakdown: {
    payment_mode: string;
    total_amount: number;
    count: number;
  }[];
  monthlyTrend: {
    month: string;
    total_amount: number;
    count: number;
  }[];
}

export interface ExpenseFilters {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  vendorId?: string;
  paymentMode?: string;
  status?: string;
  searchTerm?: string;
}

export interface Vendor {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
  gst_number?: string;
  address?: string;
  payment_terms: number;
  created_at: string;
  updated_at: string;
}