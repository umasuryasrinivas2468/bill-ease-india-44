import { supabase } from '@/lib/supabase';
import type {
  FeeRecipient,
  FeeStructure,
  TransactionFee,
  PayoutRecord,
  FeeCalculationResult,
  PayoutSummary,
  CalculateFeesRequest,
  CalculateFeesResponse,
  ProcessPayoutsRequest,
  ProcessPayoutsResponse,
} from '@/types/fees';

class FeeProcessingService {
  // ═══════════════════════════════════════════════════════════════════
  // Fee Recipients Management
  // ═══════════════════════════════════════════════════════════════════

  async getFeeRecipients(userId: string, recipientType?: string): Promise<FeeRecipient[]> {
    let query = supabase
      .from('fee_recipients')
      .select('*')
      .eq('user_id', userId);

    if (recipientType) {
      query = query.eq('recipient_type', recipientType);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createFeeRecipient(recipient: Partial<FeeRecipient>): Promise<FeeRecipient> {
    const { data, error } = await supabase
      .from('fee_recipients')
      .insert(recipient)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateFeeRecipient(
    recipientId: string,
    updates: Partial<FeeRecipient>
  ): Promise<FeeRecipient> {
    const { data, error } = await supabase
      .from('fee_recipients')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', recipientId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteFeeRecipient(recipientId: string): Promise<void> {
    const { error } = await supabase
      .from('fee_recipients')
      .delete()
      .eq('id', recipientId);

    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Fee Structures Management
  // ═══════════════════════════════════════════════════════════════════

  async getFeeStructures(userId: string): Promise<FeeStructure[]> {
    const { data, error } = await supabase
      .from('fee_structures')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getDefaultFeeStructure(userId: string): Promise<FeeStructure | null> {
    const { data, error } = await supabase
      .from('fee_structures')
      .select('*')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async createFeeStructure(structure: Partial<FeeStructure>): Promise<FeeStructure> {
    // If setting as default, unset other defaults first
    if (structure.is_default && structure.user_id) {
      await supabase
        .from('fee_structures')
        .update({ is_default: false })
        .eq('user_id', structure.user_id)
        .eq('is_default', true);
    }

    const { data, error } = await supabase
      .from('fee_structures')
      .insert(structure)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateFeeStructure(
    structureId: string,
    updates: Partial<FeeStructure>
  ): Promise<FeeStructure> {
    // If setting as default, unset other defaults first
    if (updates.is_default) {
      const { data: structure } = await supabase
        .from('fee_structures')
        .select('user_id')
        .eq('id', structureId)
        .single();

      if (structure) {
        await supabase
          .from('fee_structures')
          .update({ is_default: false })
          .eq('user_id', structure.user_id)
          .eq('is_default', true)
          .neq('id', structureId);
      }
    }

    const { data, error } = await supabase
      .from('fee_structures')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', structureId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteFeeStructure(structureId: string): Promise<void> {
    const { error } = await supabase
      .from('fee_structures')
      .delete()
      .eq('id', structureId);

    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Fee Calculation
  // ═══════════════════════════════════════════════════════════════════

  async calculateFees(request: CalculateFeesRequest): Promise<CalculateFeesResponse> {
    const { data, error } = await supabase.functions.invoke('calculate-transaction-fees', {
      body: request,
    });

    if (error) throw error;

    if (!data.success) {
      throw new Error(data.error || 'Failed to calculate fees');
    }

    return data;
  }

  async calculateFeesPreview(
    userId: string,
    totalAmount: number,
    feeStructureId?: string
  ): Promise<FeeCalculationResult> {
    const { data, error } = await supabase.rpc('calculate_transaction_fees', {
      p_user_id: userId,
      p_total_amount: totalAmount,
      p_fee_structure_id: feeStructureId || null,
    });

    if (error) throw error;
    return data;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Transaction Fees
  // ═══════════════════════════════════════════════════════════════════

  async getTransactionFees(userId: string, filters?: {
    invoiceId?: string;
    status?: string;
  }): Promise<TransactionFee[]> {
    let query = supabase
      .from('transaction_fees')
      .select('*')
      .eq('user_id', userId);

    if (filters?.invoiceId) {
      query = query.eq('invoice_id', filters.invoiceId);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  async getTransactionFeeById(transactionFeeId: string): Promise<TransactionFee | null> {
    const { data, error } = await supabase
      .from('transaction_fees')
      .select('*')
      .eq('id', transactionFeeId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Payout Processing
  // ═══════════════════════════════════════════════════════════════════

  async processPayouts(request: ProcessPayoutsRequest): Promise<ProcessPayoutsResponse> {
    const { data, error } = await supabase.functions.invoke('process-payouts', {
      body: request,
    });

    if (error) throw error;

    if (!data.success) {
      throw new Error(data.error || 'Failed to process payouts');
    }

    return data;
  }

  async getPayoutRecords(userId: string, filters?: {
    transactionFeeId?: string;
    recipientType?: string;
    status?: string;
  }): Promise<PayoutRecord[]> {
    let query = supabase
      .from('payout_records')
      .select('*')
      .eq('user_id', userId);

    if (filters?.transactionFeeId) {
      query = query.eq('transaction_fee_id', filters.transactionFeeId);
    }

    if (filters?.recipientType) {
      query = query.eq('recipient_type', filters.recipientType);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  async updatePayoutStatus(
    payoutId: string,
    status: string,
    errorMessage?: string
  ): Promise<PayoutRecord> {
    const updates: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'completed') {
      updates.completed_at = new Date().toISOString();
    } else if (status === 'failed') {
      updates.failed_at = new Date().toISOString();
      if (errorMessage) {
        updates.error_message = errorMessage;
      }
    }

    const { data, error } = await supabase
      .from('payout_records')
      .update(updates)
      .eq('id', payoutId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getPayoutSummary(
    userId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<PayoutSummary> {
    const { data, error } = await supabase.rpc('get_payout_summary', {
      p_user_id: userId,
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
    });

    if (error) throw error;
    return data;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════════════

  formatAmount(amount: number): string {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  calculateFeePercentage(feeAmount: number, totalAmount: number): number {
    if (totalAmount === 0) return 0;
    return (feeAmount / totalAmount) * 100;
  }

  getFeeBreakdownSummary(transactionFee: TransactionFee): string {
    const lines: string[] = [];
    
    lines.push(`Total Amount: ${this.formatAmount(transactionFee.total_amount)}`);
    
    if (transactionFee.platform_fee > 0) {
      lines.push(`Platform Fee: ${this.formatAmount(transactionFee.platform_fee)}`);
    }
    
    if (transactionFee.gateway_fee > 0) {
      lines.push(`Gateway Fee: ${this.formatAmount(transactionFee.gateway_fee)}`);
    }
    
    if (transactionFee.other_fees > 0) {
      lines.push(`Other Fees: ${this.formatAmount(transactionFee.other_fees)}`);
    }
    
    lines.push(`Total Fees: ${this.formatAmount(transactionFee.total_fees)}`);
    lines.push(`Vendor Amount: ${this.formatAmount(transactionFee.vendor_amount)}`);
    
    return lines.join('\n');
  }
}

export const feeProcessingService = new FeeProcessingService();
