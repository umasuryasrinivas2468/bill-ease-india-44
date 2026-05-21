// MIS + CFO Snapshot types (Modules 15 + 20).

// ── Module 15 ───────────────────────────────────────────────────────────────
export interface AssetByBranch {
  user_id: string;
  branch_id: string;
  asset_count: number;
  active_count: number;
  disposed_count: number;
  gross_value: number;
  accumulated_dep: number;
  book_value: number;
}

export interface AssetByDepartment {
  user_id: string;
  department: string;
  asset_count: number;
  gross_value: number;
  accumulated_dep: number;
  book_value: number;
}

export interface AssetByCostCenter {
  user_id: string;
  cost_center_id: string;
  cost_center_code?: string | null;
  cost_center_name?: string | null;
  asset_count: number;
  gross_value: number;
  accumulated_dep: number;
  book_value: number;
}

export interface LiabilityByLender {
  user_id: string;
  lender_name: string;
  liability_count: number;
  principal_total: number;
  outstanding_total: number;
  interest_accrued_total: number;
  interest_paid_total: number;
}

export interface AssetRoiRow {
  user_id: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  category_name?: string | null;
  capitalised_value: number;
  book_value: number;
  depreciation_to_date: number;
  maintenance_spend: number;
  maintenance_events: number;
  insurance_spend: number;
  claims_recovered: number;
  net_running_cost: number;
  cost_to_book_ratio?: number | null;
  asset_status: string;
  branch_id?: string | null;
  department?: string | null;
  cost_center_id?: string | null;
}

// ── Module 20: CFO snapshot ─────────────────────────────────────────────────
export interface CfoSnapshot {
  user_id: string;
  active_assets: number;
  fixed_assets_value: number;
  lifetime_depreciation: number;
  active_cwip_count: number;
  cwip_balance: number;
  active_lease_count: number;
  lease_liability: number;
  rou_asset_value: number;
  active_loan_count: number;
  loan_outstanding: number;
  interest_payable: number;
  active_covenants: number;
  overdue_covenants: number;
  breached_covenants: number;
  emis_due_30d: number;
  emi_outflow_30d: number;
  maintenance_spend_30d: number;
}

// Composite figure built in service from CfoSnapshot + NetWorthSnapshot
export interface CfoIntelligence extends CfoSnapshot {
  // Balance sheet roll-up
  total_assets_book: number;             // FA + CWIP + ROU + current assets (best effort)
  total_liabilities_book: number;        // loans + leases + AP (best effort)
  estimated_net_worth: number;
  // Risk flags
  risk_flags: string[];
}
