// TypeScript shapes for the Asset Maintenance module (Module 1).
// Mirrors the SQL tables in 20260520000001_asset_maintenance.sql.

export type MaintenanceScheduleType =
  | 'service'
  | 'amc'
  | 'preventive'
  | 'calibration'
  | 'inspection';

export type MaintenanceRecordType =
  | 'service'
  | 'repair'
  | 'amc_renewal'
  | 'inspection'
  | 'breakdown'
  | 'calibration';

export type MaintenanceStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type MaintenancePaymentMode = 'cash' | 'bank' | 'credit';

export interface AssetMaintenanceSchedule {
  id: string;
  user_id: string;
  asset_id: string;
  schedule_type: MaintenanceScheduleType;
  title: string;
  description?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
  frequency_months?: number | null;
  amc_start_date?: string | null;
  amc_end_date?: string | null;
  amc_amount: number;
  amc_paid: boolean;
  next_due_date: string;
  last_serviced_on?: string | null;
  reminder_days_before: number;
  cost_center_id?: string | null;
  branch_id?: string | null;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface AssetMaintenanceRecord {
  id: string;
  user_id: string;
  asset_id: string;
  schedule_id?: string | null;
  record_type: MaintenanceRecordType;
  status: MaintenanceStatus;
  performed_on: string;
  cost: number;
  gst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  itc_eligible: boolean;
  payment_mode: MaintenancePaymentMode;
  vendor_id?: string | null;
  vendor_name?: string | null;
  labour_hours?: number | null;
  parts_replaced?: string | null;
  downtime_hours?: number | null;
  cost_center_id?: string | null;
  branch_id?: string | null;
  description?: string | null;
  notes?: string | null;
  attachment_url?: string | null;
  journal_id?: string | null;
  expense_id?: string | null;
  next_service_date?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface AssetMaintenanceSummary {
  user_id: string;
  asset_id: string;
  total_events: number;
  completed_events: number;
  total_cost: number;
  total_repair_cost: number;
  last_service_on?: string | null;
  total_downtime_hours: number;
}

// ── Input shapes ────────────────────────────────────────────────────────────
export interface CreateMaintenanceScheduleInput {
  asset_id: string;
  schedule_type: MaintenanceScheduleType;
  title: string;
  description?: string;
  vendor_id?: string;
  vendor_name?: string;
  frequency_months?: number;
  amc_start_date?: string;
  amc_end_date?: string;
  amc_amount?: number;
  amc_paid?: boolean;
  next_due_date: string;
  reminder_days_before?: number;
  cost_center_id?: string;
  branch_id?: string;
  notes?: string;
}

export interface CreateMaintenanceRecordInput {
  asset_id: string;
  schedule_id?: string | null;
  record_type: MaintenanceRecordType;
  status?: MaintenanceStatus;
  performed_on: string;
  cost?: number;
  gst_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  itc_eligible?: boolean;
  payment_mode?: MaintenancePaymentMode;
  vendor_id?: string;
  vendor_name?: string;
  labour_hours?: number;
  parts_replaced?: string;
  downtime_hours?: number;
  cost_center_id?: string;
  branch_id?: string;
  description?: string;
  notes?: string;
  attachment_url?: string;
  /** If true (and cost > 0 and status = 'completed') post the expense journal. Defaults to true. */
  post_journal?: boolean;
}

// ── Derived UI types ────────────────────────────────────────────────────────
export interface MaintenanceDueAlert {
  schedule: AssetMaintenanceSchedule;
  asset_code: string;
  asset_name: string;
  days_until_due: number; // negative if overdue
  is_overdue: boolean;
}

export interface AmcExpiryAlert {
  schedule: AssetMaintenanceSchedule;
  asset_code: string;
  asset_name: string;
  days_until_expiry: number;
  is_expired: boolean;
}
