// Fee Processing Types - Simple Separate Processing Model

export interface FeeRecipient {
  id: string;
  user_id: string;
  recipient_type: 'platform' | 'vendor' | 'gateway';
  recipient_name: string;
  recipient_email?: string;
  recipient_phone?: string;
  
  // Bank details
  bank_account_number?: string;
  bank_ifsc_code?: string;
  bank_account_holder_name?: string;
  bank_name?: string;
  
  // UPI details
  upi_id?: string;
  
  // Status
  is_active: boolean;
  is_verified: boolean;
  
  notes?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface OtherFee {
  name: string;
  type: 'percentage' | 'fixed';
  value: number;
  recipient_id?: string;
}

export interface FeeStructure {
  id: string;
  user_id: string;
  structure_name: string;
  is_default: boolean;
  
  // Platform fee
  platform_fee_enabled: boolean;
  platform_fee_type?: 'percentage' | 'fixed' | 'none';
  platform_fee_value?: number;
  platform_recipient_id?: string;
  
  // Gateway fee
  gateway_fee_enabled: boolean;
  gateway_fee_type?: 'percentage' | 'fixed' | 'percentage_plus_fixed' | 'none';
  gateway_fee_percentage?: number;
  gateway_fee_fixed?: number;
  gateway_recipient_id?: string;
  
  // Other fees
  other_fees: OtherFee[];
  
  created_at: string;
  updated_at: string;
}

export interface FeeBreakdownItem {
  type: string;
  name: string;
  amount: number;
  calculation: string;
}

export interface TransactionFee {
  id: string;
  user_id: string;
  
  // Transaction reference
  invoice_id?: string;
  payment_id?: string;
  order_id?: string;
  
  // Amounts
  total_amount: number;
  platform_fee: number;
  gateway_fee: number;
  other_fees: number;
  total_fees: number;
  vendor_amount: number;
  
  // Fee structure used
  fee_structure_id?: string;
  fee_breakdown: FeeBreakdownItem[];
  
  // Status
  status: 'calculated' | 'processing' | 'completed' | 'failed';
  
  created_at: string;
  updated_at: string;
}

export interface PayoutRecord {
  id: string;
  user_id: string;
  
  // Transaction reference
  transaction_fee_id: string;
  invoice_id?: string;
  
  // Recipient details
  recipient_id?: string;
  recipient_type: string;
  recipient_name: string;
  
  // Payout details
  payout_amount: number;
  payout_method: 'bank_transfer' | 'upi' | 'razorpay_payout' | 'manual' | 'other';
  
  // Bank/UPI details (snapshot)
  bank_account_number?: string;
  bank_ifsc_code?: string;
  upi_id?: string;
  
  // External reference
  external_payout_id?: string;
  
  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  
  // Timestamps
  initiated_at: string;
  completed_at?: string;
  failed_at?: string;
  
  // Error tracking
  error_message?: string;
  retry_count: number;
  
  notes?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface FeeCalculationResult {
  platform_fee: number;
  gateway_fee: number;
  other_fees: number;
  total_fees: number;
  vendor_amount: number;
  breakdown: FeeBreakdownItem[];
  fee_structure_id?: string;
}

export interface PayoutSummary {
  total_payouts: number;
  total_amount: number;
  pending_count: number;
  pending_amount: number;
  completed_count: number;
  completed_amount: number;
  failed_count: number;
  failed_amount: number;
  by_recipient_type: Record<string, { count: number; amount: number }>;
}

// Request/Response types for API calls

export interface CalculateFeesRequest {
  invoiceId: string;
  userId: string;
  totalAmount: number;
  feeStructureId?: string;
  paymentId?: string;
  orderId?: string;
}

export interface CalculateFeesResponse {
  success: boolean;
  transaction_fee_id: string;
  total_amount: number;
  fees: {
    platform: number;
    gateway: number;
    other: number;
    total: number;
  };
  vendor_amount: number;
  breakdown: FeeBreakdownItem[];
}

export interface ProcessPayoutsRequest {
  transactionFeeId: string;
  userId: string;
  payoutMethod?: 'razorpay_payout' | 'manual';
  recipientTypes?: string[]; // Optional filter: ['platform', 'vendor', 'gateway']
}

export interface ProcessPayoutsResponse {
  success: boolean;
  payouts_created: number;
  payouts: PayoutRecord[];
  errors?: Array<{ recipient_type: string; error: string }>;
}
