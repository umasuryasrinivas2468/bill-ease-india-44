import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface VendorLiabilitySummaryRow {
  user_id: string;
  vendor_id: string | null;
  vendor_name: string;
  liability_count: number;
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  overdue_outstanding: number;
  committed_open: number;
  net_liability: number;
}

export interface VendorLiabilityRow {
  id: string;
  user_id: string;
  vendor_id: string | null;
  vendor_name: string;
  expense_id: string | null;
  bill_number: string | null;
  po_id: string | null;
  po_number: string | null;
  po_line_index: number | null;
  product_description: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  due_date: string | null;
  status: 'open' | 'partial' | 'paid' | 'void';
  source: 'invoice_match' | 'direct_invoice' | 'manual';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Per-vendor aggregate (committed PO + invoiced + outstanding). */
export const useVendorLiabilitySummary = () => {
  const { user } = useUser();
  const enabled = !!user && isValidUserId(user?.id);
  const uid = user?.id ? normalizeUserId(user.id) : '';

  return useQuery({
    queryKey: ['vendor-liability-summary', uid],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_vendor_liability_summary' as never)
        .select('*')
        .eq('user_id', uid)
        .order('net_liability', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as VendorLiabilitySummaryRow[];
    },
  });
};

/** Drill-down: liabilities for one vendor (or one PO). */
export const useVendorLiabilities = (opts: { vendorId?: string; poId?: string } = {}) => {
  const { user } = useUser();
  const enabled = !!user && isValidUserId(user?.id) && (!!opts.vendorId || !!opts.poId);
  const uid = user?.id ? normalizeUserId(user.id) : '';

  return useQuery({
    queryKey: ['vendor-liabilities', uid, opts.vendorId, opts.poId],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('vendor_liabilities')
        .select('*')
        .eq('user_id', uid)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (opts.vendorId) q = q.eq('vendor_id', opts.vendorId);
      if (opts.poId) q = q.eq('po_id', opts.poId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as VendorLiabilityRow[];
    },
  });
};
