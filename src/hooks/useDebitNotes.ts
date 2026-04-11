
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface DebitNote {
  id: string;
  debit_note_number: string;
  original_invoice_id?: string;
  vendor_name: string;
  vendor_email?: string;
  vendor_gst_number?: string;
  vendor_address?: string;
  amount: number;
  gst_amount: number;
  total_amount: number;
  debit_note_date: string;
  reason?: string;
  items: any[];
  status: 'issued' | 'applied' | 'cancelled';
  created_at: string;
}

export const useDebitNotes = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['debit-notes', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      const normalizedUserId = normalizeUserId(user.id);

      const { data, error } = await supabase
        .from('debit_notes')
        .select('*')
        .eq('user_id', normalizedUserId)
        .order('debit_note_date', { ascending: false });

      if (error) {
        console.error('Error fetching debit notes:', error);
        throw error;
      }

      return (data || []) as DebitNote[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};
