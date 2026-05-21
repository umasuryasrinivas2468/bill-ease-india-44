// TypeScript shapes for Asset Disposal & disposal-request workflow (Module 9).

export type DisposalType =
  | 'sale'
  | 'scrap'
  | 'donation'
  | 'trade_in'
  | 'write_off'
  | 'damage';

export type DisposalRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'cancelled';

export type DisposalPaymentMode = 'bank' | 'cash';

export interface AssetDisposalRequest {
  id: string;
  user_id: string;
  asset_id: string;
  disposal_type: DisposalType;
  reason: string;
  proposed_disposal_date: string;
  proposed_sale_proceeds: number;
  proposed_scrap_value: number;
  proposed_gst_rate?: number | null;
  proposed_gst_amount: number;
  payment_mode: DisposalPaymentMode;
  buyer_name?: string | null;
  buyer_gstin?: string | null;
  status: DisposalRequestStatus;
  requested_by: string;
  requested_on: string;
  approver?: string | null;
  approved_on?: string | null;
  rejection_reason?: string | null;
  disposal_journal_id?: string | null;
  document_url?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetDisposalRequestEnriched extends AssetDisposalRequest {
  asset_code: string;
  asset_name: string;
  asset_book_value: number;
  asset_status: string;
}

export interface CreateDisposalRequestInput {
  asset_id: string;
  disposal_type: DisposalType;
  reason: string;
  proposed_disposal_date: string;
  proposed_sale_proceeds?: number;
  proposed_scrap_value?: number;
  proposed_gst_rate?: number;
  proposed_gst_amount?: number;
  payment_mode?: DisposalPaymentMode;
  buyer_name?: string;
  buyer_gstin?: string;
  document_url?: string;
  notes?: string;
}
