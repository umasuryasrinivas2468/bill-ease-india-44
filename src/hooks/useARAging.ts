import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export type AgingBucket =
  | 'not_due'
  | 'overdue_0_30'
  | 'overdue_31_60'
  | 'overdue_61_90'
  | 'overdue_90_plus';

export interface ARAgingRow {
  user_id: string;
  customer_id: string | null;
  customer_name: string;
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  outstanding: number;
  status: string;
  days_overdue: number;
  bucket: AgingBucket;
}

export interface ARAgingSummary {
  user_id: string;
  customer_id: string | null;
  customer_name: string;
  invoice_count: number;
  total_outstanding: number;
  not_due: number;
  overdue_0_30: number;
  overdue_31_60: number;
  overdue_61_90: number;
  overdue_90_plus: number;
}

export const useARAging = (filters?: { customerId?: string; bucket?: AgingBucket }) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['ar-aging', user?.id, filters],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      let q = supabase
        .from('v_ar_aging')
        .select('*')
        .eq('user_id', uid)
        .order('days_overdue', { ascending: false });
      if (filters?.customerId) q = q.eq('customer_id', filters.customerId);
      if (filters?.bucket)     q = q.eq('bucket', filters.bucket);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ARAgingRow[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useARAgingSummary = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['ar-aging-summary', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('v_ar_aging_summary')
        .select('*')
        .eq('user_id', uid)
        .order('total_outstanding', { ascending: false });
      if (error) throw error;
      return (data || []) as ARAgingSummary[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export interface CashInflowWeek {
  user_id: string;
  week: string;
  invoice_count: number;
  expected_inflow: number;
  overdue_portion: number;
}

export const useCashInflowForecast = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['cash-inflow-forecast', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('v_cash_inflow_forecast')
        .select('*')
        .eq('user_id', uid);
      if (error) throw error;
      return (data || []) as CashInflowWeek[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};
