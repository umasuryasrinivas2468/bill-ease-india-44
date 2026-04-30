export interface LinkedAccount {
  id: string;
  user_id: string;
  account_id: string;
  account_type: 'platform' | 'third_party';
  account_name: string;
  account_email?: string;
  account_status: string;
  notes?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ThirdPartyFee {
  account_id: string;
  fee_type: 'percentage' | 'fixed';
  fee_value: number;
  name: string;
  on_hold: boolean;
}

export interface FeeConfiguration {
  id: string;
  user_id: string;
  config_name: string;
  is_default: boolean;
  
  // Platform fee
  platform_fee_type?: 'percentage' | 'fixed' | 'none';
  platform_fee_value?: number;
  platform_account_id?: string;
  
  // Third-party fees
  third_party_fees: ThirdPartyFee[];
  
  // Settings
  on_hold_default: boolean;
  on_hold_until_days: number;
  
  created_at: string;
  updated_at: string;
}

export interface TransferRecord {
  id: string;
  user_id: string;
  
  // Razorpay identifiers
  transfer_id: string;
  order_id?: string;
  payment_id?: string;
  
  // Transfer details
  recipient_account_id: string;
  recipient_type: 'platform' | 'third_party' | 'vendor';
  amount: number;
  currency: string;
  
  // Status
  status: 'created' | 'pending' | 'processed' | 'failed' | 'reversed';
  on_hold: boolean;
  on_hold_until?: string;
  
  // Settlement
  recipient_settlement_id?: string;
  processed_at?: string;
  
  // Metadata
  notes?: Record<string, any>;
  error_details?: Record<string, any>;
  
  // Invoice reference
  invoice_id?: string;
  
  created_at: string;
  updated_at: string;
}

export interface TransferSummary {
  total_transfers: number;
  total_amount: number;
  pending_count: number;
  processed_count: number;
  failed_count: number;
  transfers: Array<{
    transfer_id: string;
    recipient_type: string;
    amount: number;
    status: string;
    processed_at?: string;
  }>;
}

export interface CreateOrderWithTransfersRequest {
  invoiceId: string;
  userId: string;
  amount: number;
  feeConfigId?: string;
  enableTransfers?: boolean;
}

export interface CreateOrderWithTransfersResponse {
  success: boolean;
  order_id: string;
  amount: number;
  currency: string;
  public_token: string;
  transfers_count: number;
  transfers: any[];
}
