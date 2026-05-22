// TypeScript shapes for the Fixed Assets module — mirror the SQL tables.

export type DepreciationMethod = 'SLM' | 'WDV' | 'None';
export type AssetSource = 'manual' | 'purchase_bill' | 'expense' | 'import' | 'inventory';
export type AssetStatus = 'draft' | 'active' | 'disposed' | 'written_off' | 'transferred' | 'impaired';

export interface FixedAssetCategory {
  id: string;
  user_id: string;
  name: string;
  code?: string | null;
  default_useful_life_years: number;
  default_depreciation_method: DepreciationMethod;
  default_depreciation_rate?: number | null;
  default_salvage_percent?: number | null;
  is_intangible: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FixedAsset {
  id: string;
  user_id: string;
  asset_code: string;
  name: string;
  description?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  purchase_value: number;
  gst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  gst_rate?: number | null;
  itc_eligible: boolean;
  total_capitalised_value: number;
  purchase_date: string; // YYYY-MM-DD
  capitalised_on?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
  source_type: AssetSource;
  source_id?: string | null;
  source_bill_id?: string | null;
  source_bill_line_id?: string | null;
  reclassification_journal_id?: string | null;
  source_inventory_item_id?: string | null;
  source_inventory_qty?: number | null;
  source_inventory_movement_id?: string | null;
  useful_life_years: number;
  depreciation_method: DepreciationMethod;
  depreciation_rate?: number | null;
  salvage_value: number;
  accumulated_depreciation: number;
  book_value: number;
  last_depreciated_through?: string | null;
  location?: string | null;
  branch_id?: string | null;
  cost_center_id?: string | null;
  custodian?: string | null;
  serial_number?: string | null;
  status: AssetStatus;
  disposed_at?: string | null;
  disposal_amount?: number | null;
  profit_loss_on_disposal?: number | null;
  asset_account_id?: string | null;
  accum_dep_account_id?: string | null;
  dep_expense_account_id?: string | null;
  notes?: string | null;
  attachment_url?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export type DepreciationStatus = 'planned' | 'posted' | 'skipped' | 'adjusted';

export interface AssetDepreciationRow {
  id: string;
  user_id: string;
  asset_id: string;
  period_index: number;
  period_start: string;
  period_end: string;
  fiscal_year?: string | null;
  opening_book_value: number;
  depreciation_amount: number;
  accumulated_after: number;
  closing_book_value: number;
  status: DepreciationStatus;
  journal_id?: string | null;
  posted_at?: string | null;
  posted_by?: string | null;
  manual_override: boolean;
  notes?: string | null;
  created_at: string;
}

export type AssetTransactionType =
  | 'purchase'
  | 'capitalization'
  | 'depreciation'
  | 'revaluation'
  | 'transfer'
  | 'impairment'
  | 'disposal'
  | 'write_off'
  | 'adjustment';

export interface AssetTransaction {
  id: string;
  user_id: string;
  asset_id: string;
  transaction_type: AssetTransactionType;
  transaction_date: string;
  amount?: number | null;
  from_location?: string | null;
  to_location?: string | null;
  journal_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface CreateAssetInput {
  name: string;
  description?: string;
  category_id?: string;
  category_name?: string;
  purchase_value: number;
  gst_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  gst_rate?: number;
  itc_eligible?: boolean;
  purchase_date: string;
  vendor_id?: string;
  vendor_name?: string;
  useful_life_years?: number;
  depreciation_method?: DepreciationMethod;
  depreciation_rate?: number;
  salvage_value?: number;
  location?: string;
  branch_id?: string;
  cost_center_id?: string;
  custodian?: string;
  serial_number?: string;
  source_type?: AssetSource;
  source_id?: string;
  /** When capitalizing from a multi-line bill: bill id + per-line identifier for idempotency. */
  source_bill_id?: string;
  source_bill_line_id?: string;
  payment_mode?: 'credit' | 'cash' | 'bank'; // controls AP vs Bank in purchase journal
  notes?: string;
  /** If true, also post the purchase journal immediately. Defaults to true. */
  post_journal?: boolean;
}
