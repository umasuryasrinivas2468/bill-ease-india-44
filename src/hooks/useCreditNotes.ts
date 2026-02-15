
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface CreditNote {
  id: string;
  credit_note_number: string;
  original_invoice_id?: string;
  client_name: string;
  client_email?: string;
  client_gst_number?: string;
  client_address?: string;
  amount: number;
  gst_amount: number;
  total_amount: number;
  credit_note_date: string;
  reason?: string;
  items: any[];
  status: 'issued' | 'applied' | 'cancelled';
  created_at: string;
}

export const useCreditNotes = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['credit-notes', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      const normalizedUserId = normalizeUserId(user.id);

      const { data, error } = await supabase
        .from('credit_notes')
        .select('*')
        .eq('user_id', normalizedUserId)
        .order('credit_note_date', { ascending: false });

      if (error) {
        console.error('Error fetching credit notes:', error);
        throw error;
      }

      return (data || []) as CreditNote[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};
