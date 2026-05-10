import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface ARDashboardStats {
  user_id: string;
  open_invoice_count: number;
  overdue_count: number;
  paid_count: number;
  total_outstanding: number;
  total_overdue: number;
  this_month_billed: number;
  this_month_collected: number;
  active_customer_count: number;
  unapplied_advances: number;
  pending_approvals: number;
  open_fraud_alerts: number;
}

export const useARDashboard = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['ar-dashboard', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return null;
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('v_ar_dashboard')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as ARDashboardStats | null;
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export interface CustomerConcentrationRow {
  user_id: string;
  customer_id: string | null;
  customer_name: string;
  invoice_count: number;
  total_outstanding: number;
  pct_of_total: number;
  overdue_amount: number;
}

export const useCustomerConcentration = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['customer-concentration', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('v_customer_concentration')
        .select('*')
        .eq('user_id', uid)
        .order('total_outstanding', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as CustomerConcentrationRow[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export interface PendingArApproval {
  request_id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  reference: string | null;
  amount: number | null;
  required_levels: number;
  current_level: number;
  requested_by: string | null;
  requested_at: string;
  counterparty: string | null;
  entity_date: string | null;
  rule_perms: string[] | null;
}

export const usePendingArApprovals = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['pending-ar-approvals', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('v_pending_ar_approvals')
        .select('*')
        .eq('user_id', uid)
        .order('requested_at', { ascending: false });
      if (error) throw error;
      return (data || []) as PendingArApproval[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export interface OpenArFraudAlert {
  id: string;
  user_id: string;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  entity_type: string | null;
  entity_id: string | null;
  reference: string | null;
  amount: number | null;
  details: any;
  status: string;
  created_at: string;
  counterparty: string | null;
}

export const useOpenArFraudAlerts = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['open-ar-fraud-alerts', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('v_open_ar_fraud_alerts')
        .select('*')
        .eq('user_id', uid);
      if (error) throw error;
      return (data || []) as OpenArFraudAlert[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export interface CustomerProfitability {
  user_id: string;
  customer_id: string;
  customer_name: string;
  revenue: number;
  cogs: number;
  returns_value: number;
  gross_margin?: number;
  margin_pct?: number;
}

export const useCustomerProfitability = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['customer-profitability', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('v_customer_profitability')
        .select('*')
        .eq('user_id', uid);
      if (error) throw error;
      return (data || []).map((r: CustomerProfitability) => {
        const margin = Number(r.revenue || 0) - Number(r.cogs || 0) - Number(r.returns_value || 0);
        const pct = r.revenue > 0 ? (margin / Number(r.revenue)) * 100 : 0;
        return { ...r, gross_margin: margin, margin_pct: Math.round(pct * 100) / 100 };
      }) as CustomerProfitability[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};
