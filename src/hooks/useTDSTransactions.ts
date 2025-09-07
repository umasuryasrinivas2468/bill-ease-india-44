import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSupabaseUser } from './useSupabaseUser';
import { toast } from '@/hooks/use-toast';
export interface TDSTransaction {
  id: string;
  user_id: string;
  client_id: string;
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
  clients?: {
    name: string;
    gst_number?: string;
  };
  tds_rules?: {
    category: string;
  };
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

export const useTDSTransactions = (filters?: {
  startDate?: string;
  endDate?: string;
  period?: 'monthly' | 'quarterly' | 'yearly';
}) => {
  const { supabaseUser } = useSupabaseUser();

  return useQuery({
    queryKey: ['tds-transactions', filters],
    queryFn: async () => {
      if (!supabaseUser?.id) throw new Error('User not authenticated');
      
      let query = supabase
        .from('tds_transactions')
        .select(`
          *,
          clients(name, gst_number),
          tds_rules(category)
        `)
        .eq('user_id', supabaseUser.id);

      if (filters?.startDate) {
        query = query.gte('transaction_date', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('transaction_date', filters.endDate);
      }

      // Handle period filters
      if (filters?.period) {
        const now = new Date();
        let startDate: Date;

        switch (filters.period) {
          case 'monthly':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'quarterly':
            const currentQuarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
            break;
          case 'yearly':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
        }

        query = query.gte('transaction_date', startDate.toISOString().split('T')[0]);
      }

      const { data, error } = await query.order('transaction_date', { ascending: false });

      if (error) throw error;
      return data as TDSTransaction[];
    },
    enabled: !!supabaseUser?.id,
  });
};

export const useCreateTDSTransaction = () => {
  const { supabaseUser } = useSupabaseUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionData: CreateTDSTransactionData) => {
      if (!supabaseUser?.id) throw new Error('User not authenticated');

      // Calculate TDS amount and net payable
      const tdsAmount = Math.round(transactionData.transaction_amount * transactionData.tds_rate / 100 * 100) / 100;
      const netPayable = Math.round((transactionData.transaction_amount - tdsAmount) * 100) / 100;

      const { data, error } = await supabase
        .from('tds_transactions')
        .insert([{
          ...transactionData,
          user_id: supabaseUser.id,
          tds_amount: tdsAmount,
          net_payable: netPayable,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tds-transactions'] });
      toast({
        title: "Success",
        description: "TDS transaction recorded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create TDS transaction.",
        variant: "destructive",
      });
    },
  });
};

// Hook to get TDS summary for reports
export const useTDSSummary = (filters?: {
  startDate?: string;
  endDate?: string;
  period?: 'monthly' | 'quarterly' | 'yearly';
}) => {
  const { supabaseUser } = useSupabaseUser();

  return useQuery({
    queryKey: ['tds-summary', filters],
    queryFn: async () => {
      if (!supabaseUser?.id) throw new Error('User not authenticated');
      
      let query = supabase
        .from('tds_transactions')
        .select('transaction_amount, tds_amount, tds_rate, transaction_date, tds_rules(category)')
        .eq('user_id', supabaseUser.id);

      if (filters?.startDate) {
        query = query.gte('transaction_date', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('transaction_date', filters.endDate);
      }

      // Handle period filters
      if (filters?.period) {
        const now = new Date();
        let startDate: Date;

        switch (filters.period) {
          case 'monthly':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'quarterly':
            const currentQuarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
            break;
          case 'yearly':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
        }

        query = query.gte('transaction_date', startDate.toISOString().split('T')[0]);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Calculate summary statistics
      const totalTransactionAmount = data.reduce((sum, t) => sum + Number(t.transaction_amount), 0);
      const totalTDSDeducted = data.reduce((sum, t) => sum + Number(t.tds_amount), 0);
      const totalNetPayable = totalTransactionAmount - totalTDSDeducted;

      // Group by category
      const categoryBreakdown = data.reduce((acc, t) => {
        const category = (t.tds_rules as any)?.category || 'Other';
        if (!acc[category]) {
          acc[category] = {
            category,
            totalAmount: 0,
            totalTDS: 0,
            transactionCount: 0,
          };
        }
        acc[category].totalAmount += Number(t.transaction_amount);
        acc[category].totalTDS += Number(t.tds_amount);
        acc[category].transactionCount += 1;
        return acc;
      }, {} as Record<string, any>);

      return {
        totalTransactionAmount,
        totalTDSDeducted,
        totalNetPayable,
        transactionCount: data.length,
        categoryBreakdown: Object.values(categoryBreakdown),
      };
    },
    enabled: !!supabaseUser?.id,
  });
};