// TypeScript shapes for Capital Work-In-Progress (Module 8).
// Mirrors 20260526000001_cwip.sql.

export type CwipStatus = 'planning' | 'in_progress' | 'on_hold' | 'capitalized' | 'cancelled';
export type CwipCostType =
  | 'material'
  | 'labour'
  | 'contractor'
  | 'consultancy'
  | 'overhead'
  | 'interest'
  | 'transport'
  | 'other';
export type CwipPaymentMode = 'cash' | 'bank' | 'credit';
export type CwipSourceType = 'bill' | 'expense' | 'manual';

export interface CwipProject {
  id: string;
  user_id: string;
  cwip_code: string;
  name: string;
  description?: string | null;
  expected_asset_category_id?: string | null;
  expected_useful_life_years: number;
  expected_depreciation_method: 'SLM' | 'WDV' | 'None';
  budget_amount: number;
  start_date: string;
  expected_completion_date?: string | null;
  capitalized_on?: string | null;
  fixed_asset_id?: string | null;
  capitalization_journal_id?: string | null;
  total_accumulated_cost: number;
  total_capitalized: number;
  status: CwipStatus;
  cost_center_id?: string | null;
  branch_id?: string | null;
  department?: string | null;
  notes?: string | null;
  document_url?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface CwipCost {
  id: string;
  user_id: string;
  cwip_id: string;
  cost_type: CwipCostType;
  cost_date: string;
  description: string;
  amount: number;
  gst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  itc_eligible: boolean;
  payment_mode: CwipPaymentMode;
  vendor_id?: string | null;
  vendor_name?: string | null;
  source_type?: CwipSourceType | null;
  source_id?: string | null;
  capitalized: boolean;
  capitalized_into?: string | null;
  journal_id?: string | null;
  notes?: string | null;
  document_url?: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface CreateCwipProjectInput {
  cwip_code?: string;
  name: string;
  description?: string;
  expected_asset_category_id?: string;
  expected_useful_life_years?: number;
  expected_depreciation_method?: 'SLM' | 'WDV' | 'None';
  budget_amount?: number;
  start_date: string;
  expected_completion_date?: string;
  cost_center_id?: string;
  branch_id?: string;
  department?: string;
  document_url?: string;
  notes?: string;
}

export interface AddCwipCostInput {
  cwip_id: string;
  cost_type: CwipCostType;
  cost_date: string;
  description: string;
  amount: number;
  gst_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  itc_eligible?: boolean;
  payment_mode?: CwipPaymentMode;
  vendor_id?: string;
  vendor_name?: string;
  notes?: string;
  document_url?: string;
  /** Default true. When false, just records the cost without journal posting (already booked elsewhere). */
  post_journal?: boolean;
}

export interface CapitalizeCwipInput {
  cwip_id: string;
  capitalized_on: string;
  /** When provided, only capitalize specified cost rows (phased capitalization). Empty array = all uncapitalized. */
  cost_ids?: string[];
  asset_name?: string;          // defaults to project name
  asset_serial_number?: string;
  asset_location?: string;
  asset_custodian?: string;
  useful_life_years?: number;
  depreciation_method?: 'SLM' | 'WDV' | 'None';
  depreciation_rate?: number;
  salvage_value?: number;
  /** If true, marks the CWIP project 'capitalized' (no costs may be added). Defaults to !phased. */
  close_project?: boolean;
}
