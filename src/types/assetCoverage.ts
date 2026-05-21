// TypeScript shapes for the Warranty & Insurance module (Module 2).
// Mirrors 20260521000001_asset_warranty_insurance.sql.

export type WarrantyType = 'manufacturer' | 'extended' | 'third_party' | 'seller';

export type PolicyType =
  | 'comprehensive'
  | 'fire'
  | 'theft'
  | 'liability'
  | 'transit'
  | 'marine'
  | 'health'
  | 'other';

export type PolicyStatus = 'active' | 'lapsed' | 'cancelled' | 'renewed';

export type ClaimStatus =
  | 'filed'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'settled'
  | 'partially_settled';

export type CoveragePaymentMode = 'cash' | 'bank' | 'credit';

export interface AssetWarranty {
  id: string;
  user_id: string;
  asset_id: string;
  warranty_type: WarrantyType;
  provider_name: string;
  provider_contact?: string | null;
  warranty_number?: string | null;
  start_date: string;
  end_date: string;
  coverage_terms?: string | null;
  exclusions?: string | null;
  claim_contact?: string | null;
  document_url?: string | null;
  reminder_days_before: number;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface AssetInsurancePolicy {
  id: string;
  user_id: string;
  asset_id: string;
  policy_type: PolicyType;
  insurer_name: string;
  vendor_id?: string | null;
  broker_name?: string | null;
  policy_number: string;
  coverage_amount: number;
  premium_amount: number;
  gst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  itc_eligible: boolean;
  start_date: string;
  end_date: string;
  premium_due_date?: string | null;
  premium_paid: boolean;
  payment_mode: CoveragePaymentMode;
  paid_on?: string | null;
  journal_id?: string | null;
  status: PolicyStatus;
  renewed_from_id?: string | null;
  claim_contact?: string | null;
  document_url?: string | null;
  reminder_days_before: number;
  cost_center_id?: string | null;
  branch_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface AssetInsuranceClaim {
  id: string;
  user_id: string;
  asset_id: string;
  policy_id: string;
  claim_number: string;
  incident_date: string;
  claim_filed_date: string;
  claim_amount: number;
  approved_amount?: number | null;
  settled_amount?: number | null;
  settled_on?: string | null;
  payment_mode?: 'cash' | 'bank' | null;
  status: ClaimStatus;
  incident_description?: string | null;
  surveyor_name?: string | null;
  surveyor_contact?: string | null;
  rejection_reason?: string | null;
  document_url?: string | null;
  journal_id?: string | null;
  cost_center_id?: string | null;
  branch_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface AssetCoverageSummary {
  user_id: string;
  asset_id: string;
  warranty_until?: string | null;
  has_active_warranty: boolean;
  active_policies: number;
  total_coverage: number;
  total_premium: number;
  next_policy_expiry?: string | null;
  has_active_policy: boolean;
  total_claims: number;
  open_claims: number;
  lifetime_settlement: number;
}

// ── Input shapes ────────────────────────────────────────────────────────────
export interface CreateWarrantyInput {
  asset_id: string;
  warranty_type?: WarrantyType;
  provider_name: string;
  provider_contact?: string;
  warranty_number?: string;
  start_date: string;
  end_date: string;
  coverage_terms?: string;
  exclusions?: string;
  claim_contact?: string;
  document_url?: string;
  reminder_days_before?: number;
  notes?: string;
}

export interface CreateInsurancePolicyInput {
  asset_id: string;
  policy_type?: PolicyType;
  insurer_name: string;
  vendor_id?: string;
  broker_name?: string;
  policy_number: string;
  coverage_amount: number;
  premium_amount: number;
  gst_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  itc_eligible?: boolean;
  start_date: string;
  end_date: string;
  premium_due_date?: string;
  premium_paid?: boolean;
  payment_mode?: CoveragePaymentMode;
  paid_on?: string;
  claim_contact?: string;
  document_url?: string;
  reminder_days_before?: number;
  cost_center_id?: string;
  branch_id?: string;
  notes?: string;
  /** If true and premium_paid is true, post the premium journal. Defaults to true. */
  post_journal?: boolean;
}

export interface CreateInsuranceClaimInput {
  asset_id: string;
  policy_id: string;
  claim_number: string;
  incident_date: string;
  claim_filed_date: string;
  claim_amount: number;
  status?: ClaimStatus;
  incident_description?: string;
  surveyor_name?: string;
  surveyor_contact?: string;
  document_url?: string;
  notes?: string;
}

export interface SettleClaimInput {
  claim_id: string;
  settled_amount: number;
  settled_on: string;
  payment_mode?: 'cash' | 'bank';
  partially_settled?: boolean;
  notes?: string;
}

// ── Derived alert types ─────────────────────────────────────────────────────
export interface WarrantyExpiryAlert {
  warranty: AssetWarranty;
  asset_code: string;
  asset_name: string;
  days_until_expiry: number;
  is_expired: boolean;
}

export interface PolicyExpiryAlert {
  policy: AssetInsurancePolicy;
  asset_code: string;
  asset_name: string;
  days_until_expiry: number;
  is_expired: boolean;
}
