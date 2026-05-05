import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface VendorLedgerRow {
  user_id: string;
  vendor_id: string;
  vendor_name: string;
  txn_date: string;
  txn_type: 'bill' | 'payment' | 'advance_adjustment';
  reference: string | null;
  source_id: string;
  debit: number;
  credit: number;
  narration: string;
  running_balance?: number;
}

export const useVendorLedger = (vendorId?: string) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['vendor-ledger', user?.id, vendorId],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id) || !vendorId) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('v_vendor_ledger')
        .select('*')
        .eq('user_id', uid)
        .eq('vendor_id', vendorId)
        .order('txn_date', { ascending: true });
      if (error) throw error;

      // running balance: credit increases payable, debit reduces it
      let bal = 0;
      const rows = (data || []).map((r: VendorLedgerRow) => {
        bal += Number(r.credit || 0) - Number(r.debit || 0);
        return { ...r, running_balance: Math.round(bal * 100) / 100 };
      });
      return rows as VendorLedgerRow[];
    },
    enabled: !!user && !!vendorId && isValidUserId(user?.id),
  });
};

export interface GstItcRow {
  user_id: string;
  period_month: string;
  vendor_name: string;
  vendor_gst_number: string | null;
  bill_count: number;
  taxable_value: number;
  itc_available: number;
  gross_value: number;
}

export const useGstItc = (filters?: { from?: string; to?: string }) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['gst-itc', user?.id, filters],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      let q = supabase
        .from('v_gst_itc_summary')
        .select('*')
        .eq('user_id', uid)
        .order('period_month', { ascending: false });
      if (filters?.from) q = q.gte('period_month', filters.from);
      if (filters?.to)   q = q.lte('period_month', filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as GstItcRow[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};
