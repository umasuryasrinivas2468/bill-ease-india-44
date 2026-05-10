import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import {
  postCustomerAdvanceJournal,
  postCustomerAdvanceAdjustmentJournal,
} from '@/utils/autoJournalEntry';

export interface CustomerAdvance {
  id: string;
  user_id: string;
  customer_id: string | null;
  customer_name: string;
  advance_number: string;
  advance_date: string;
  amount: number;
  applied_amount: number;
  outstanding_amount: number;
  payment_mode: string | null;
  reference_number: string | null;
  deposit_account: string | null;
  tax_amount: number;
  place_of_supply: string | null;
  description: string | null;
  status: 'open' | 'partial' | 'applied' | 'refunded' | 'cancelled';
  cost_center_id: string | null;
  project_id: string | null;
  branch_id: string | null;
  department: string | null;
  source_payment_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerAdvanceAdjustment {
  id: string;
  user_id: string;
  advance_id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  amount: number;
  adjustment_date: string;
  cost_center_id: string | null;
  project_id: string | null;
  branch_id: string | null;
  department: string | null;
  notes: string | null;
  created_at: string;
}

const generateAdvanceNumber = async (uid: string): Promise<string> => {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('customer_advances')
    .select('advance_number')
    .eq('user_id', uid)
    .like('advance_number', `CADV/${year}/%`)
    .order('advance_number', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const m = data[0].advance_number.match(/CADV\/\d+\/(\d+)/);
    if (m) seq = parseInt(m[1]) + 1;
  }
  return `CADV/${year}/${String(seq).padStart(4, '0')}`;
};

export const useCustomerAdvances = (customerId?: string) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['customer-advances', user?.id, customerId],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      let q = supabase
        .from('customer_advances')
        .select('*')
        .eq('user_id', uid)
        .order('advance_date', { ascending: false });
      if (customerId) q = q.eq('customer_id', customerId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CustomerAdvance[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useCreateCustomerAdvance = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      customer_id?: string | null;
      customer_name: string;
      advance_date: string;
      amount: number;
      payment_mode: string;
      reference_number?: string;
      deposit_account?: string;
      tax_amount?: number;
      place_of_supply?: string;
      description?: string;
      cost_center_id?: string | null;
      project_id?: string | null;
      branch_id?: string | null;
      department?: string | null;
      notes?: string;
    }) => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      const uid = normalizeUserId(user.id);
      const advance_number = await generateAdvanceNumber(uid);

      const { data: created, error } = await supabase
        .from('customer_advances')
        .insert({
          user_id: uid,
          customer_id: input.customer_id || null,
          customer_name: input.customer_name,
          advance_number,
          advance_date: input.advance_date,
          amount: input.amount,
          applied_amount: 0,
          payment_mode: input.payment_mode,
          reference_number: input.reference_number || null,
          deposit_account: input.deposit_account || null,
          tax_amount: input.tax_amount || 0,
          place_of_supply: input.place_of_supply || null,
          description: input.description || null,
          status: 'open',
          cost_center_id: input.cost_center_id || null,
          project_id: input.project_id || null,
          branch_id: input.branch_id || null,
          department: input.department || null,
          notes: input.notes || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Post journal: Dr Bank/Cash, Cr Customer Advances (+ GST on advance if any)
      await postCustomerAdvanceJournal(uid, {
        advance_id: created.id,
        customer_name: input.customer_name,
        customer_id: input.customer_id || undefined,
        date: input.advance_date,
        amount: input.amount,
        payment_mode: input.payment_mode,
        reference_number: input.reference_number,
        tax_amount: input.tax_amount,
      });

      return created as CustomerAdvance;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-advances'] });
      qc.invalidateQueries({ queryKey: ['ar-dashboard'] });
      qc.invalidateQueries({ queryKey: ['customer-ledger'] });
      toast({ title: 'Advance recorded', description: 'Customer advance posted to ledger.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
};

export const useApplyCustomerAdvance = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      advance_id: string;
      invoice_id: string;
      invoice_number: string;
      customer_id?: string | null;
      customer_name: string;
      amount: number;
      adjustment_date?: string;
      notes?: string;
    }) => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      const uid = normalizeUserId(user.id);
      const today = input.adjustment_date || new Date().toISOString().split('T')[0];

      // Block over-application.
      const { data: adv } = await supabase
        .from('customer_advances')
        .select('amount, applied_amount')
        .eq('id', input.advance_id)
        .single();
      const remaining = Number(adv?.amount || 0) - Number(adv?.applied_amount || 0);
      if (input.amount > remaining + 0.01) {
        throw new Error(`Cannot apply ${input.amount}: only ${remaining.toFixed(2)} remaining on this advance.`);
      }

      const { data: created, error } = await supabase
        .from('customer_advance_adjustments')
        .insert({
          user_id: uid,
          advance_id: input.advance_id,
          invoice_id: input.invoice_id,
          invoice_number: input.invoice_number,
          customer_id: input.customer_id || null,
          customer_name: input.customer_name,
          amount: input.amount,
          adjustment_date: today,
          notes: input.notes || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Journal: Dr Customer Advances, Cr AR
      await postCustomerAdvanceAdjustmentJournal(uid, {
        adjustment_id: created.id,
        customer_name: input.customer_name,
        customer_id: input.customer_id || undefined,
        invoice_number: input.invoice_number,
        date: today,
        amount: input.amount,
      });

      // Allocation row → invoice paid_amount + status auto-rolled by trigger
      await supabase.rpc('allocate_payment_to_invoices', {
        p_user_id: uid,
        p_source_type: 'customer_advance_adjustment',
        p_source_id: created.id,
        p_customer_id: input.customer_id || null,
        p_allocations: [{ invoice_id: input.invoice_id, amount: input.amount }],
        p_date: today,
      });

      return created as CustomerAdvanceAdjustment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-advances'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['ar-aging'] });
      qc.invalidateQueries({ queryKey: ['customer-ledger'] });
      qc.invalidateQueries({ queryKey: ['ar-dashboard'] });
      toast({ title: 'Advance applied', description: 'Invoice cleared via advance.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
};
