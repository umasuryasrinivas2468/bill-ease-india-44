
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import { postVendorAdvanceJournal } from '@/utils/autoJournalEntry';
import type { VendorAdvance } from '@/types/vendorPayments';

const generateAdvanceNumber = async (userId: string): Promise<string> => {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('vendor_advances')
    .select('advance_number')
    .eq('user_id', userId)
    .like('advance_number', `ADV/${year}/%`)
    .order('advance_number', { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const m = data[0].advance_number.match(/ADV\/\d+\/(\d+)/);
    if (m) seq = parseInt(m[1]) + 1;
  }
  return `ADV/${year}/${String(seq).padStart(4, '0')}`;
};

export const useVendorAdvances = (vendorId?: string) => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['vendor-advances', user?.id, vendorId],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');
      const uid = normalizeUserId(user.id);

      let query = supabase
        .from('vendor_advances')
        .select('*')
        .eq('user_id', uid)
        .order('advance_date', { ascending: false });

      if (vendorId) query = query.eq('vendor_id', vendorId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as VendorAdvance[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useCreateVendorAdvance = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      vendor_id: string;
      vendor_name: string;
      advance_date: string;
      amount: number;
      payment_mode: string;
      reference_number?: string;
      notes?: string;
      attachment_url?: string;
      attachment_name?: string;
    }) => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');
      const uid = normalizeUserId(user.id);
      const advanceNumber = await generateAdvanceNumber(uid);

      // Post auto journal: Advance (Dr) → Bank/Cash (Cr)
      const journal = await postVendorAdvanceJournal(uid, {
        advance_number: advanceNumber,
        advance_date: input.advance_date,
        vendor_name: input.vendor_name,
        amount: input.amount,
        payment_mode: input.payment_mode,
      });

      const { data, error } = await supabase
        .from('vendor_advances')
        .insert({
          user_id: uid,
          vendor_id: input.vendor_id,
          vendor_name: input.vendor_name,
          advance_number: advanceNumber,
          advance_date: input.advance_date,
          amount: input.amount,
          payment_mode: input.payment_mode,
          reference_number: input.reference_number || null,
          notes: input.notes || null,
          adjusted_amount: 0,
          unadjusted_amount: input.amount,
          status: 'active',
          journal_id: journal?.id || null,
          attachment_url: input.attachment_url || null,
          attachment_name: input.attachment_name || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as VendorAdvance;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-advances'] });
      toast({ title: 'Success', description: 'Vendor advance recorded with journal entry.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to record advance.', variant: 'destructive' });
    },
  });
};

export const useVendorAdvanceSummary = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['vendor-advance-summary', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');
      const uid = normalizeUserId(user.id);

      const { data, error } = await supabase
        .from('vendor_advances')
        .select('amount, adjusted_amount, unadjusted_amount, status')
        .eq('user_id', uid);

      if (error) throw error;
      const advances = data || [];

      return {
        totalAdvances: advances.reduce((s, a) => s + (a.amount || 0), 0),
        totalAdjusted: advances.reduce((s, a) => s + (a.adjusted_amount || 0), 0),
        totalUnadjusted: advances.reduce((s, a) => s + (a.unadjusted_amount || 0), 0),
        activeCount: advances.filter(a => a.status === 'active').length,
        partialCount: advances.filter(a => a.status === 'partially_adjusted').length,
        fullyAdjustedCount: advances.filter(a => a.status === 'fully_adjusted').length,
      };
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};
