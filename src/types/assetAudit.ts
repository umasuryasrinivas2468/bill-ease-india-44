// TypeScript shapes for Asset Verification & Audit (Module 5).
// Mirrors 20260524000001_asset_audit_verification.sql.

export type AuditSessionStatus = 'scheduled' | 'in_progress' | 'closed' | 'cancelled';

export type AuditFindingStatus =
  | 'pending'
  | 'verified'
  | 'missing'
  | 'mismatch'
  | 'damaged'
  | 'disposed_offsite';

export type AuditVerificationMethod = 'physical' | 'qr_scan' | 'photo' | 'remote';

export type AuditCondition =
  | 'new'
  | 'good'
  | 'fair'
  | 'poor'
  | 'damaged'
  | 'non_functional';

export interface AssetAuditSession {
  id: string;
  user_id: string;
  session_code: string;
  title: string;
  description?: string | null;
  scope_branch_id?: string | null;
  scope_department?: string | null;
  scope_cost_center_id?: string | null;
  scheduled_on: string;
  started_on?: string | null;
  closed_on?: string | null;
  next_audit_due?: string | null;
  status: AuditSessionStatus;
  auditor_name?: string | null;
  auditor_contact?: string | null;
  assets_in_scope: number;
  assets_verified: number;
  assets_missing: number;
  assets_mismatched: number;
  notes?: string | null;
  document_url?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface AssetAuditFinding {
  id: string;
  user_id: string;
  session_id: string;
  asset_id: string;
  status: AuditFindingStatus;
  verified_on?: string | null;
  verified_by?: string | null;
  verification_method?: AuditVerificationMethod | null;
  expected_location?: string | null;
  expected_branch_id?: string | null;
  expected_custodian?: string | null;
  found_location?: string | null;
  found_branch_id?: string | null;
  found_custodian?: string | null;
  condition_observed?: AuditCondition | null;
  remarks?: string | null;
  photo_url?: string | null;
  resolution_action?: string | null;
  resolution_ref_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetAuditFindingEnriched extends AssetAuditFinding {
  asset_code: string;
  asset_name: string;
  category_name?: string | null;
  book_value: number;
}

export interface CreateAuditSessionInput {
  session_code?: string;          // auto-generated when omitted
  title: string;
  description?: string;
  scope_branch_id?: string;
  scope_department?: string;
  scope_cost_center_id?: string;
  scheduled_on: string;
  next_audit_due?: string;
  auditor_name?: string;
  auditor_contact?: string;
  notes?: string;
}

export interface RecordFindingInput {
  finding_id: string;
  status: AuditFindingStatus;
  verification_method?: AuditVerificationMethod;
  found_location?: string;
  found_branch_id?: string;
  found_custodian?: string;
  condition_observed?: AuditCondition;
  remarks?: string;
  photo_url?: string;
}

export interface AuditMismatchReport {
  session: AssetAuditSession;
  findings: AssetAuditFindingEnriched[];
}
