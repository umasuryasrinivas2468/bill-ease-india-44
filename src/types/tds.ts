export interface TDSRule {
  id: string;
  user_id: string;
  category: string;
  rate_percentage: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TDSTransaction {
  id: string;
  user_id: string;
  client_id?: string;
  invoice_id?: string;
  tds_rule_id?: string;
  transaction_amount: number;
  tds_rate: number;
  tds_amount: number;
  net_payable: number;
  transaction_date: string;
  vendor_name: string;
  vendor_pan?: string;
  description?: string;
  certificate_number?: string;
  created_at: string;
  updated_at: string;
  
  // Joined data from related tables
  clients?: {
    name: string;
    gst_number?: string;
  };
  tds_rules?: {
    category: string;
  };
}

export interface TDSSummary {
  totalTransactionAmount: number;
  totalTDSDeducted: number;
  totalNetPayable: number;
  transactionCount: number;
  period: string;
  categoryBreakdown: TDSCategoryBreakdown[];
}

export interface TDSCategoryBreakdown {
  category: string;
  totalAmount: number;
  totalTDS: number;
  transactionCount: number;
}

export interface CreateTDSRuleData {
  category: string;
  rate_percentage: number;
  description?: string;
}

export interface CreateTDSTransactionData {
  client_id?: string;
  invoice_id?: string;
  tds_rule_id?: string;
  transaction_amount: number;
  tds_rate: number;
  transaction_date: string;
  vendor_name: string;
  vendor_pan?: string;
  description?: string;
  certificate_number?: string;
}

export interface TDSReportFilters {
  startDate?: string;
  endDate?: string;
  period?: 'monthly' | 'quarterly' | 'yearly';
  category?: string;
}