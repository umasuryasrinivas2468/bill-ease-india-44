import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId } from '@/lib/userUtils';

export interface Payable {
  id: string;
  user_id: string;
  vendor_name: string;
  vendor_email?: string;
  vendor_phone?: string;
  related_purchase_order_id?: string;
  related_purchase_order_number?: string;
  bill_number?: string;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  due_date: string;
  payment_date?: string;
  status: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export const usePayables = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['payables', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('payables')
        .select('*')
        .eq('user_id', normalizedUserId)
        .order('due_date', { ascending: true });

      if (error) {
        console.error('Error fetching payables:', error);
        throw error;
      }

      return data as Payable[];
    },
    enabled: !!user?.id,
  });
};

export const useMarkPayablePaid = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async ({ payableId }: { payableId: string }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const normalizedUserId = normalizeUserId(user.id);

      // First get the current payable to get amount_due
      const { data: currentPayable, error: fetchError } = await supabase
        .from('payables')
        .select('amount_due')
        .eq('id', payableId)
        .eq('user_id', normalizedUserId)
        .single();

      if (fetchError || !currentPayable) {
        throw fetchError || new Error('Payable not found');
      }

      const { data, error } = await supabase
        .from('payables')
        .update({ 
          status: 'paid', 
          payment_date: new Date().toISOString().split('T')[0],
          amount_paid: currentPayable.amount_due,
          amount_remaining: 0
        })
        .eq('id', payableId)
        .eq('user_id', normalizedUserId)
        .select()
        .single();

      if (error) {
        console.error('Error marking payable as paid:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables'] });
    },
  });
};
