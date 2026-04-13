
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import { postVendorPaymentJournal, postAdvanceAdjustmentJournal } from '@/utils/autoJournalEntry';
import type { VendorBillPayment, AdvanceAdjustment } from '@/types/vendorPayments';

export const useVendorBillPayments = (billId?: string) => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['vendor-bill-payments', user?.id, billId],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');
      const uid = normalizeUserId(user.id);

      let query = supabase
        .from('vendor_bill_payments')
        .select('*')
        .eq('user_id', uid)
        .order('payment_date', { ascending: false });

      if (billId) query = query.eq('bill_id', billId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as VendorBillPayment[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useAdvanceAdjustments = (advanceId?: string) => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['advance-adjustments', user?.id, advanceId],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');
      const uid = normalizeUserId(user.id);

      let query = supabase
        .from('advance_adjustments')
        .select('*')
        .eq('user_id', uid)
        .order('adjustment_date', { ascending: false });

      if (advanceId) query = query.eq('advance_id', advanceId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AdvanceAdjustment[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

/** Record a direct payment against a purchase bill */
export const useRecordBillPayment = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      bill_id: string;
      bill_number: string;
      vendor_id: string;
      vendor_name: string;
      payment_date: string;
      amount: number;
      payment_mode: string;
      reference_number?: string;
      notes?: string;
      attachment_url?: string;
      attachment_name?: string;
    }) => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');
      const uid = normalizeUserId(user.id);

      // Post auto journal: Payables (Dr) → Bank/Cash (Cr)
      const journal = await postVendorPaymentJournal(uid, {
        bill_number: input.bill_number,
        date: input.payment_date,
        vendor_name: input.vendor_name,
        amount: input.amount,
        payment_mode: input.payment_mode,
      });

      // Insert payment record
      const { data: payment, error } = await supabase
        .from('vendor_bill_payments')
        .insert({
          user_id: uid,
          bill_id: input.bill_id,
          bill_number: input.bill_number,
          vendor_id: input.vendor_id,
          vendor_name: input.vendor_name,
          payment_date: input.payment_date,
          amount: input.amount,
          payment_mode: input.payment_mode,
          reference_number: input.reference_number || null,
          payment_type: 'direct',
          journal_id: journal?.id || null,
          notes: input.notes || null,
          attachment_url: input.attachment_url || null,
          attachment_name: input.attachment_name || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Update bill paid_amount and status
      await updateBillPaymentStatus(uid, input.bill_id, input.amount);

      return payment as VendorBillPayment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-bill-payments'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-bills'] });
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      toast({ title: 'Success', description: 'Bill payment recorded with journal entry.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to record payment.', variant: 'destructive' });
    },
  });
};

/** Adjust a vendor advance against a purchase bill */
export const useAdjustAdvance = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      advance_id: string;
      advance_number: string;
      bill_id: string;
      bill_number: string;
      vendor_id: string;
      vendor_name: string;
      adjustment_date: string;
      amount: number;
      notes?: string;
    }) => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');
      const uid = normalizeUserId(user.id);

      // Post auto journal: Payables (Dr) → Vendor Advance (Cr)
      const journal = await postAdvanceAdjustmentJournal(uid, {
        advance_number: input.advance_number,
        bill_number: input.bill_number,
        date: input.adjustment_date,
        vendor_name: input.vendor_name,
        amount: input.amount,
      });

      // Insert adjustment record
      const { data: adj, error } = await supabase
        .from('advance_adjustments')
        .insert({
          user_id: uid,
          advance_id: input.advance_id,
          advance_number: input.advance_number,
          bill_id: input.bill_id,
          bill_number: input.bill_number,
          vendor_id: input.vendor_id,
          vendor_name: input.vendor_name,
          adjustment_date: input.adjustment_date,
          amount: input.amount,
          journal_id: journal?.id || null,
          notes: input.notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Also record as a bill payment (type = advance_adjustment)
      await supabase.from('vendor_bill_payments').insert({
        user_id: uid,
        bill_id: input.bill_id,
        bill_number: input.bill_number,
        vendor_id: input.vendor_id,
        vendor_name: input.vendor_name,
        payment_date: input.adjustment_date,
        amount: input.amount,
        payment_mode: 'bank',
        payment_type: 'advance_adjustment',
        advance_id: input.advance_id,
        advance_number: input.advance_number,
        journal_id: journal?.id || null,
        notes: `Advance adjustment: ${input.advance_number}`,
      });

      // Update advance: increase adjusted_amount, decrease unadjusted
      const { data: advance } = await supabase
        .from('vendor_advances')
        .select('amount, adjusted_amount')
        .eq('id', input.advance_id)
        .single();

      if (advance) {
        const newAdjusted = (advance.adjusted_amount || 0) + input.amount;
        const newUnadjusted = advance.amount - newAdjusted;
        const newStatus = newUnadjusted <= 0.01 ? 'fully_adjusted' : 'partially_adjusted';

        await supabase
          .from('vendor_advances')
          .update({
            adjusted_amount: Math.round(newAdjusted * 100) / 100,
            unadjusted_amount: Math.max(0, Math.round(newUnadjusted * 100) / 100),
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.advance_id);
      }

      // Update bill paid_amount and status
      await updateBillPaymentStatus(uid, input.bill_id, input.amount);

      return adj as AdvanceAdjustment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advance-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-advances'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-bill-payments'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-bills'] });
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      toast({ title: 'Success', description: 'Advance adjusted against bill with journal entry.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to adjust advance.', variant: 'destructive' });
    },
  });
};

/** Helper: update purchase bill paid_amount & status after a payment */
async function updateBillPaymentStatus(userId: string, billId: string, paymentAmount: number) {
  const { data: bill } = await supabase
    .from('purchase_bills')
    .select('total_amount, paid_amount')
    .eq('id', billId)
    .eq('user_id', userId)
    .single();

  if (!bill) return;

  const newPaid = (bill.paid_amount || 0) + paymentAmount;
  const status = newPaid >= bill.total_amount ? 'paid' : 'partially_paid';

  await supabase
    .from('purchase_bills')
    .update({
      paid_amount: Math.round(newPaid * 100) / 100,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', billId)
    .eq('user_id', userId);
}
