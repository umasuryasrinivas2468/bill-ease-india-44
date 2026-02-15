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
  tds_amount?: number;
  tds_rule_id?: string;
  payment_mode: 'cash' | 'bank' | 'credit_card' | 'debit_card' | 'upi' | 'cheque';
  reference_number?: string;
  bill_number?: string;
  notes?: string;
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