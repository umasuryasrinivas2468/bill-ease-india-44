import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface InvoiceRegisterRow {
  user_id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  client_name: string;
  client_gst_number: string | null;
  client_address: string | null;
  place_of_supply: string | null;
  seller_state: string | null;
  intra_state: boolean;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  cess_amount: number;
  gst_amount: number;
  total_amount: number;
  paid_amount: number;
  outstanding: number;
  status: string;
  lifecycle_stage: string | null;
  cost_center_id: string | null;
  project_id: string | null;
  branch_id: string | null;
  department: string | null;
  rate_buckets: any;
  items: any;
  journal_id?: string | null;
  journal_number?: string | null;
  posted_at?: string | null;
  is_reversed?: boolean | null;
}

export const useInvoiceRegister = (filters?: { from?: string; to?: string; withJournal?: boolean }) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['invoice-register', user?.id, filters],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      const view = filters?.withJournal ? 'v_invoice_register_with_journal' : 'v_invoice_register';
      let q = supabase.from(view).select('*').eq('user_id', uid).order('invoice_date', { ascending: false });
      if (filters?.from) q = q.gte('invoice_date', filters.from);
      if (filters?.to)   q = q.lte('invoice_date', filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as InvoiceRegisterRow[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};
