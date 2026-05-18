// TypeScript shapes for the Liabilities / Loans module.

export type LiabilityType =
  | 'loan'
  | 'credit_line'
  | 'vendor_advance'
  | 'tax'
  | 'long_term'
  | 'short_term'
  | 'other';

export type LiabilityStatus = 'draft' | 'active' | 'closed' | 'defaulted' | 'restructured';
export type InterestType = 'reducing' | 'flat' | 'none';

export interface Liability {
  id: string;
  user_id: string;
  liability_code: string;
  name: string;
  liability_type: LiabilityType;
  lender_name?: string | null;
  lender_contact?: string | null;
  vendor_id?: string | null;
  principal_amount: number;
  disbursed_amount: number;
  outstanding_principal: number;
  interest_rate?: number | null;
  interest_type: InterestType;
  total_interest_accrued: number;
  total_interest_paid: number;
  tenure_months?: number | null;
  emi_amount?: number | null;
  emi_day_of_month?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  next_due_date?: string | null;
  status: LiabilityStatus;
  closed_at?: string | null;
  liability_account_id?: string | null;
  interest_expense_account_id?: string | null;
  account_number?: string | null;
  notes?: string | null;
  attachment_url?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export type EmiStatus = 'planned' | 'paid' | 'partial' | 'skipped' | 'overdue';

export interface LoanEmiRow {
  id: string;
  user_id: string;
  liability_id: string;
  emi_number: number;
  due_date: string;
  opening_balance: number;
  principal_component: number;
  interest_component: number;
  total_emi: number;
  closing_balance: number;
  status: EmiStatus;
  paid_amount: number;
  paid_on?: string | null;
  journal_id?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface CreateLiabilityInput {
  name: string;
  liability_type: LiabilityType;
  lender_name?: string;
  lender_contact?: string;
  vendor_id?: string;
  principal_amount: number;
  interest_rate?: number;
  interest_type?: InterestType;
  tenure_months?: number;
  emi_day_of_month?: number;
  start_date?: string;
  account_number?: string;
  notes?: string;
  /** If true, post the disbursement journal & generate EMI schedule. */
  disburse_now?: boolean;
  /** Bank/cash account name where the loan funds landed. Defaults to "Bank". */
  receive_into?: string;
}
