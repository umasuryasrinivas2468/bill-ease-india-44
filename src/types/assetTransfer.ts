// TypeScript shapes for Asset Transfer Management (Module 3).
// Mirrors 20260522000001_asset_transfers.sql.

export type TransferType =
  | 'branch'
  | 'department'
  | 'employee'
  | 'location'
  | 'cost_center';

export type TransferStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'completed'
  | 'rejected'
  | 'reverted';

export interface AssetTransfer {
  id: string;
  user_id: string;
  asset_id: string;
  transfer_type: TransferType;

  from_branch_id?: string | null;
  from_location?: string | null;
  from_custodian?: string | null;
  from_cost_center_id?: string | null;
  from_department?: string | null;

  to_branch_id?: string | null;
  to_location?: string | null;
  to_custodian?: string | null;
  to_cost_center_id?: string | null;
  to_department?: string | null;

  transfer_date: string;
  status: TransferStatus;
  requested_by?: string | null;
  approved_by?: string | null;
  approved_on?: string | null;
  rejected_reason?: string | null;

  reverts_transfer_id?: string | null;
  reason?: string | null;
  notes?: string | null;
  document_url?: string | null;
  journal_id?: string | null;

  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface AssetTransferEnriched extends AssetTransfer {
  asset_code: string;
  asset_name: string;
  current_book_value: number;
}

export interface CreateTransferInput {
  asset_id: string;
  transfer_type: TransferType;

  to_branch_id?: string;
  to_location?: string;
  to_custodian?: string;
  to_cost_center_id?: string;
  to_department?: string;

  transfer_date: string;
  /** Defaults to 'completed' (immediate). Pass 'pending_approval' to gate on approval. */
  status?: TransferStatus;
  reason?: string;
  notes?: string;
  document_url?: string;

  /** Post a memorandum cost-center reallocation journal. Default false. */
  post_journal?: boolean;
}
