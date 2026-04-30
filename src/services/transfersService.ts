import { supabase } from '@/lib/supabase';
import type {
  LinkedAccount,
  FeeConfiguration,
  TransferRecord,
  TransferSummary,
  CreateOrderWithTransfersRequest,
  CreateOrderWithTransfersResponse,
} from '@/types/transfers';

class TransfersService {
  // ═══════════════════════════════════════════════════════════════════
  // Linked Accounts Management
  // ═══════════════════════════════════════════════════════════════════

  async getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
    const { data, error } = await supabase
      .from('linked_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createLinkedAccount(account: Partial<LinkedAccount>): Promise<LinkedAccount> {
    const { data, error } = await supabase
      .from('linked_accounts')
      .insert(account)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateLinkedAccount(
    accountId: string,
    updates: Partial<LinkedAccount>
  ): Promise<LinkedAccount> {
    const { data, error } = await supabase
      .from('linked_accounts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', accountId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteLinkedAccount(accountId: string): Promise<void> {
    const { error } = await supabase
      .from('linked_accounts')
      .delete()
      .eq('id', accountId);

    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Fee Configurations Management
  // ═══════════════════════════════════════════════════════════════════

  async getFeeConfigurations(userId: string): Promise<FeeConfiguration[]> {
    const { data, error } = await supabase
      .from('fee_configurations')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getDefaultFeeConfiguration(userId: string): Promise<FeeConfiguration | null> {
    const { data, error } = await supabase
      .from('fee_configurations')
      .select('*')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async createFeeConfiguration(config: Partial<FeeConfiguration>): Promise<FeeConfiguration> {
    // If setting as default, unset other defaults first
    if (config.is_default && config.user_id) {
      await supabase
        .from('fee_configurations')
        .update({ is_default: false })
        .eq('user_id', config.user_id)
        .eq('is_default', true);
    }

    const { data, error } = await supabase
      .from('fee_configurations')
      .insert(config)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateFeeConfiguration(
    configId: string,
    updates: Partial<FeeConfiguration>
  ): Promise<FeeConfiguration> {
    // If setting as default, unset other defaults first
    if (updates.is_default) {
      const { data: config } = await supabase
        .from('fee_configurations')
        .select('user_id')
        .eq('id', configId)
        .single();

      if (config) {
        await supabase
          .from('fee_configurations')
          .update({ is_default: false })
          .eq('user_id', config.user_id)
          .eq('is_default', true)
          .neq('id', configId);
      }
    }

    const { data, error } = await supabase
      .from('fee_configurations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', configId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteFeeConfiguration(configId: string): Promise<void> {
    const { error } = await supabase
      .from('fee_configurations')
      .delete()
      .eq('id', configId);

    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Transfer Records
  // ═══════════════════════════════════════════════════════════════════

  async getTransferRecords(userId: string, filters?: {
    invoiceId?: string;
    orderId?: string;
    status?: string;
  }): Promise<TransferRecord[]> {
    let query = supabase
      .from('transfer_records')
      .select('*')
      .eq('user_id', userId);

    if (filters?.invoiceId) {
      query = query.eq('invoice_id', filters.invoiceId);
    }

    if (filters?.orderId) {
      query = query.eq('order_id', filters.orderId);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  async getInvoiceTransferSummary(invoiceId: string): Promise<TransferSummary | null> {
    const { data, error } = await supabase.rpc('get_invoice_transfer_summary', {
      p_invoice_id: invoiceId,
    });

    if (error) throw error;
    return data;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Order Creation with Transfers
  // ═══════════════════════════════════════════════════════════════════

  async createOrderWithTransfers(
    request: CreateOrderWithTransfersRequest
  ): Promise<CreateOrderWithTransfersResponse> {
    const { data, error } = await supabase.functions.invoke('create-order-with-transfers', {
      body: request,
    });

    if (error) throw error;

    if (!data.success) {
      throw new Error(data.error || 'Failed to create order with transfers');
    }

    return data;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Fee Calculation Helpers
  // ═══════════════════════════════════════════════════════════════════

  calculateFeeAmount(
    totalAmount: number,
    feeType: 'percentage' | 'fixed',
    feeValue: number
  ): number {
    if (feeType === 'percentage') {
      return Math.round((totalAmount * feeValue) / 100);
    } else if (feeType === 'fixed') {
      return feeValue;
    }
    return 0;
  }

  calculateTransferBreakdown(
    totalAmount: number,
    config: FeeConfiguration
  ): {
    platformFee: number;
    thirdPartyFees: Array<{ name: string; amount: number }>;
    vendorAmount: number;
    total: number;
  } {
    let platformFee = 0;
    const thirdPartyFees: Array<{ name: string; amount: number }> = [];

    // Calculate platform fee
    if (config.platform_fee_type && config.platform_fee_type !== 'none') {
      platformFee = this.calculateFeeAmount(
        totalAmount,
        config.platform_fee_type,
        config.platform_fee_value || 0
      );
    }

    // Calculate third-party fees
    if (Array.isArray(config.third_party_fees)) {
      for (const fee of config.third_party_fees) {
        const amount = this.calculateFeeAmount(totalAmount, fee.fee_type, fee.fee_value);
        thirdPartyFees.push({ name: fee.name, amount });
      }
    }

    const totalFees = platformFee + thirdPartyFees.reduce((sum, f) => sum + f.amount, 0);
    const vendorAmount = totalAmount - totalFees;

    return {
      platformFee,
      thirdPartyFees,
      vendorAmount,
      total: totalAmount,
    };
  }
}

export const transfersService = new TransfersService();
