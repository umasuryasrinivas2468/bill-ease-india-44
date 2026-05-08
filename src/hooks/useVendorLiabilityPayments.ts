import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import { postVendorPaymentJournal } from '@/utils/autoJournalEntry';

export interface RecordLiabilityPaymentInput {
  vendor_id: string;
  vendor_name: string;
  amount: number;
  payment_date: string;
  payment_mode: 'cash' | 'bank' | 'credit_card' | 'debit_card' | 'upi' | 'cheque';
  reference_number?: string;
  notes?: string;
}

/**
 * Record a vendor payment against the new vendor_liabilities ledger.
 * Uses the apply_payment_to_liabilities RPC which allocates the amount
 * FIFO across open liabilities (oldest due_date first), updating each row's
 * paid_amount/status. Also posts the AP/Bank journal so the GL stays in sync.
 *
 * Distinct from useRecordBillPayment (which drives the legacy purchase_bills
 * flow) — this hook is for invoices captured via expense-ocr → vendor_liabilities.
 */
export const useRecordVendorLiabilityPayment = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RecordLiabilityPaymentInput) => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');
      const uid = normalizeUserId(user.id);

      const { data: applied, error: rpcError } = await supabase.rpc('apply_payment_to_liabilities', {
        p_user_id: uid,
        p_vendor_id: input.vendor_id,
        p_amount: input.amount,
        p_payment_id: null,
      });
      if (rpcError) throw rpcError;

      const allocated = Number(applied) || 0;
      if (allocated <= 0) {
        throw new Error('No open liabilities for this vendor — payment not applied.');
      }

      await postVendorPaymentJournal(uid, {
        bill_number: `VL-${Date.now()}`,
        date: input.payment_date,
        vendor_name: input.vendor_name,
        vendor_id: input.vendor_id,
        amount: allocated,
        payment_mode: input.payment_mode,
        reference: input.reference_number,
      });

      return { allocated, leftover: input.amount - allocated };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['vendor-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-liability-summary'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      const leftoverNote = result.leftover > 0 ? ` ${result.leftover.toFixed(2)} unallocated.` : '';
      toast({
        title: 'Payment applied',
        description: `Allocated ${result.allocated.toFixed(2)} across open liabilities.${leftoverNote}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Payment failed',
        description: error.message || 'Could not apply payment to vendor liabilities.',
        variant: 'destructive',
      });
    },
  });
};
