// Generalised Approval Workflow types (Module 18).

export type ApprovalRequestType =
  | 'asset_purchase'
  | 'asset_disposal'
  | 'asset_write_off'
  | 'asset_transfer'
  | 'asset_revaluation'
  | 'asset_impairment'
  | 'liability_restructuring'
  | 'loan_closure'
  | 'loan_disbursement'
  | 'lease_termination'
  | 'cwip_capitalization'
  | 'expense'
  | 'journal_adjustment'
  | 'generic';

export type ApprovalRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled'
  | 'expired';

export type ApprovalPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ApprovalRequest {
  id: string;
  user_id: string;
  request_type: ApprovalRequestType;
  entity_type?: string | null;
  entity_id?: string | null;
  title: string;
  description?: string | null;
  amount?: number | null;
  payload?: Record<string, unknown> | null;
  status: ApprovalRequestStatus;
  requested_by: string;
  requested_on: string;
  expires_on?: string | null;
  approver?: string | null;
  approved_on?: string | null;
  approval_comment?: string | null;
  rejection_reason?: string | null;
  executed_on?: string | null;
  execution_ref_id?: string | null;
  priority: ApprovalPriority;
  notes?: string | null;
  document_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateApprovalRequestInput {
  request_type: ApprovalRequestType;
  entity_type?: string;
  entity_id?: string;
  title: string;
  description?: string;
  amount?: number;
  payload?: Record<string, unknown>;
  expires_on?: string;
  priority?: ApprovalPriority;
  notes?: string;
  document_url?: string;
}
