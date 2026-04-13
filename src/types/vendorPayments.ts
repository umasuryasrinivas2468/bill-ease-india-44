
export interface VendorAdvance {
  id: string;
  user_id: string;
  org_id?: string;
  vendor_id: string;
  vendor_name: string;
  advance_number: string;
  advance_date: string;
  amount: number;
  payment_mode: 'cash' | 'bank' | 'upi' | 'cheque';
  reference_number?: string;
  notes?: string;
  adjusted_amount: number;
  unadjusted_amount: number;
  status: 'active' | 'partially_adjusted' | 'fully_adjusted';
  journal_id?: string;
  attachment_url?: string;
  attachment_name?: string;
  created_at: string;
  updated_at: string;
}

export interface AdvanceAdjustment {
  id: string;
  user_id: string;
  org_id?: string;
  advance_id: string;
  advance_number: string;
  bill_id: string;
  bill_number: string;
  vendor_id: string;
  vendor_name: string;
  adjustment_date: string;
  amount: number;
  journal_id?: string;
  notes?: string;
  created_at: string;
}

export interface VendorBillPayment {
  id: string;
  user_id: string;
  org_id?: string;
  bill_id: string;
  bill_number: string;
  vendor_id: string;
  vendor_name: string;
  payment_date: string;
  amount: number;
  payment_mode: 'cash' | 'bank' | 'upi' | 'cheque';
  reference_number?: string;
  payment_type: 'direct' | 'advance_adjustment';
  advance_id?: string;
  advance_number?: string;
  journal_id?: string;
  notes?: string;
  attachment_url?: string;
  attachment_name?: string;
  created_at: string;
}

export type BillPaymentStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue';

export const PAYMENT_MODES = [
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
] as const;
