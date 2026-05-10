import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface RecurringInvoice {
  id: string;
  user_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_gst: string | null;
  customer_address: string | null;
  template_name: string;
  amount: number;
  gst_rate: number;
  place_of_supply: string | null;
  intra_state: boolean | null;
  cost_center_id: string | null;
  project_id: string | null;
  branch_id: string | null;
  department: string | null;
  notes: string | null;
  items: any[];
  payment_terms_days: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  interval_count: number;
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  last_generated_date: string | null;
  due_offset_days: number;
  is_active: boolean;
  auto_post: boolean;
  created_at: string;
  updated_at: string;
}

export const useRecurringInvoices = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['recurring-invoices', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('ar_recurring_invoices')
        .select('*')
        .eq('user_id', uid)
        .order('next_due_date', { ascending: true });
      if (error) throw error;
      return (data || []) as RecurringInvoice[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useUpsertRecurringInvoice = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<RecurringInvoice> & { template_name: string; customer_name: string; amount: number; frequency: RecurringInvoice['frequency']; start_date: string; next_due_date: string }) => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      const uid = normalizeUserId(user.id);
      const payload = { ...input, user_id: uid };
      if (input.id) {
        const { data, error } = await supabase
          .from('ar_recurring_invoices')
          .update(payload)
          .eq('id', input.id)
          .eq('user_id', uid)
          .select()
          .single();
        if (error) throw error;
        return data as RecurringInvoice;
      }
      const { data, error } = await supabase
        .from('ar_recurring_invoices')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as RecurringInvoice;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-invoices'] });
      toast({ title: 'Saved', description: 'Recurring invoice schedule updated.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
};

export const useGenerateRecurringInvoices = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (asOf?: string) => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase.rpc('generate_ar_recurring_invoices', {
        p_user_id: uid,
        p_as_of: asOf || new Date().toISOString().split('T')[0],
      });
      if (error) throw error;
      return (data || []) as { invoice_id: string; recurring_id: string; invoice_number: string }[];
    },
    onSuccess: (rows) => {
      qc.invalidateQueries({ queryKey: ['recurring-invoices'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['ar-dashboard'] });
      toast({ title: 'Done', description: `Generated ${rows.length} invoice(s).` });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
};
