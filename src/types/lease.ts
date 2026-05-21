// TypeScript shapes for Lease Asset Management (Module 6).
// Mirrors 20260525000001_lease_management.sql.

export type LeaseType = 'operating' | 'finance' | 'rental';
export type LeaseStatus = 'draft' | 'active' | 'terminated' | 'expired' | 'cancelled';
export type LeasePaymentFrequency = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
export type LeasePaymentStatus = 'planned' | 'paid' | 'skipped' | 'adjusted';
export type LeasePaymentMode = 'cash' | 'bank' | 'credit';

export interface LeaseContract {
  id: string;
  user_id: string;
  lease_code: string;
  lease_type: LeaseType;
  name: string;
  description?: string | null;
  asset_id?: string | null;
  lessor_name: string;
  lessor_contact?: string | null;
  vendor_id?: string | null;
  start_date: string;
  end_date: string;
  termination_date?: string | null;
  payment_frequency: LeasePaymentFrequency;
  payment_amount: number;
  gst_amount_per_period: number;
  itc_eligible: boolean;
  payments_in_advance: boolean;
  security_deposit: number;
  discount_rate_annual?: number | null;
  rou_asset_value?: number | null;
  opening_liability?: number | null;
  outstanding_liability: number;
  recognition_journal_id?: string | null;
  termination_journal_id?: string | null;
  reminder_days_before: number;
  status: LeaseStatus;
  cost_center_id?: string | null;
  branch_id?: string | null;
  department?: string | null;
  document_url?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface LeasePaymentScheduleRow {
  id: string;
  user_id: string;
  lease_id: string;
  period_index: number;
  due_date: string;
  total_payment: number;
  principal_portion: number;
  interest_portion: number;
  gst_amount: number;
  opening_liability: number;
  closing_liability: number;
  status: LeasePaymentStatus;
  paid_on?: string | null;
  payment_mode?: LeasePaymentMode | null;
  journal_id?: string | null;
  posted_by?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface LeaseSummary {
  id: string;
  user_id: string;
  lease_code: string;
  name: string;
  lease_type: LeaseType;
  lessor_name: string;
  status: LeaseStatus;
  start_date: string;
  end_date: string;
  payment_amount: number;
  payment_frequency: LeasePaymentFrequency;
  outstanding_liability: number;
  rou_asset_value?: number | null;
  next_payment_due?: string | null;
  payments_made: number;
  payments_remaining: number;
  lifetime_paid: number;
}

export interface CreateLeaseInput {
  lease_code?: string;
  lease_type: LeaseType;
  name: string;
  description?: string;
  asset_id?: string;
  lessor_name: string;
  lessor_contact?: string;
  vendor_id?: string;
  start_date: string;
  end_date: string;
  payment_frequency?: LeasePaymentFrequency;
  payment_amount: number;
  gst_amount_per_period?: number;
  itc_eligible?: boolean;
  payments_in_advance?: boolean;
  security_deposit?: number;
  discount_rate_annual?: number; // required for finance leases
  reminder_days_before?: number;
  cost_center_id?: string;
  branch_id?: string;
  department?: string;
  document_url?: string;
  notes?: string;
}

export interface PostLeasePaymentInput {
  schedule_row_id: string;
  payment_mode?: LeasePaymentMode;
  paid_on?: string;
}

export interface TerminateLeaseInput {
  lease_id: string;
  termination_date: string;
  reason?: string;
  write_off_remaining_liability?: boolean;
}

export interface LeaseDueAlert {
  lease: LeaseContract;
  next_payment: LeasePaymentScheduleRow;
  days_until_due: number;
  is_overdue: boolean;
}
