
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface Quotation {
  id: string;
  quotation_number: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  discount?: number;
  quotation_date: string;
  validity_period: number;
  items: any[];
  items_with_product_id?: any[];
  terms_conditions?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'hold' | 'expired';
  created_at: string;
}

export const useQuotations = () => {
  const { user } = useUser();
  const normalizedUserId = user ? normalizeUserId(user.id) : null;

  return useQuery({
    queryKey: ['quotations', normalizedUserId],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        console.error('[useQuotations] User not authenticated or invalid user ID:', user?.id);
        throw new Error('User not authenticated or invalid user ID');
      }
      const normalizedUserId = normalizeUserId(user.id);
      console.log('[useQuotations] Fetching quotations for user:', normalizedUserId);

      const { data, error } = await supabase
        .from('quotations')
        .select('*')
        .eq('user_id', normalizedUserId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useQuotations] Error fetching quotations:', error);
        throw error;
      }

      console.log('[useQuotations] Fetched quotations:', data?.length || 0);
      return (data || []) as Quotation[];
    },
    enabled: !!user && isValidUserId(user?.id),
    staleTime: 2 * 60 * 1000,
  });
};

export const useUpdateQuotationStatus = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ quotationId, status }: { quotationId: string; status: Quotation['status'] }) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      const normalizedUserId = normalizeUserId(user.id);

      const { data, error } = await supabase
        .from('quotations')
        .update({ status })
        .eq('id', quotationId)
        .eq('user_id', normalizedUserId)
        .select()
        .single();

      if (error) {
        console.error('[useUpdateQuotationStatus] Error updating quotation status:', error);
        throw error;
      }

      return data as Quotation;
    },
    onSuccess: () => {
      console.log('[useUpdateQuotationStatus] Status updated, invalidating quotations');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error) => {
      console.error('[useUpdateQuotationStatus] Mutation error:', error);
    },
  });
};
