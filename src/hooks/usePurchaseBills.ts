
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface PurchaseBill {
  id: string;
  user_id: string;
  vendor_id?: string;
  bill_number: string;
  vendor_name: string;
  vendor_email?: string;
  vendor_gst_number?: string;
  vendor_address?: string;
  amount: number;
  gst_amount: number;
  total_amount: number;
  bill_date: string;
  due_date: string;
  items: any[];
  status: 'paid' | 'pending' | 'overdue' | 'partially_paid';
  paid_amount?: number;
  notes?: string;
  created_at: string;
}

export const usePurchaseBills = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['purchase-bills', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        console.error('User not authenticated or invalid user ID:', user?.id);
        throw new Error('User not authenticated or invalid user ID');
      }
      const normalizedUserId = normalizeUserId(user.id);

      const { data, error } = await supabase
        .from('purchase_bills')
        .select('*')
        .eq('user_id', normalizedUserId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching purchase bills:', error);
        throw error;
      }

      // derive overdue statuses
      const today = new Date().toISOString().split('T')[0];
      const withStatus = (data || []).map(b => {
        if ((b.status === 'pending' || b.status === 'partially_paid') && b.due_date < today) {
          return { ...b, status: 'overdue' as const };
        }
        return b;
      });

      return withStatus as PurchaseBill[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useMarkBillPaid = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ billId }: { billId: string }) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      const normalizedUserId = normalizeUserId(user.id);

      // Fetch bill to get total_amount
      const { data: bill, error: fetchErr } = await supabase
        .from('purchase_bills')
        .select('id, total_amount')
        .eq('id', billId)
        .eq('user_id', normalizedUserId)
        .single();

      if (fetchErr) {
        console.error('Error fetching bill before marking paid:', fetchErr);
        throw fetchErr;
      }

      // Mark paid and set paid_amount
      const { data, error } = await supabase
        .from('purchase_bills')
        .update({ status: 'paid', paid_amount: bill?.total_amount ?? 0 })
        .eq('id', billId)
        .eq('user_id', normalizedUserId)
        .select()
        .single();

      if (error) {
        console.error('Error marking bill as paid:', error);
        throw error;
      }

      // Note: Journal auto-entry can be added after we map Payables and Bank accounts.
      console.log('Bill marked paid. Consider creating journal: Dr. Payable, Cr. Bank');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-bills'] });
    },
  });
};
