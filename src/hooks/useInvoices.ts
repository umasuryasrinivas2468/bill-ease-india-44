
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email?: string;
  client_gst_number?: string;
  client_address?: string;
  amount: number;
  gst_amount: number;
  total_amount: number;
  status: 'paid' | 'pending' | 'overdue';
  invoice_date: string;
  due_date: string;
  items: any[];
  notes?: string;
  created_at: string;
}

export const useInvoices = () => {
  const { user } = useUser();
  
  return useQuery({
    queryKey: ['invoices', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        console.error('User not authenticated or invalid user ID:', user?.id);
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      console.log('Fetching invoices for user:', normalizedUserId);
      
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', normalizedUserId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching invoices:', error);
        throw error;
      }
      
      console.log('Fetched invoices:', data);
      return data as Invoice[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useCreateInvoice = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async (invoiceData: Omit<Invoice, 'id' | 'created_at'>) => {
      if (!user || !isValidUserId(user.id)) {
        console.error('User not authenticated or invalid user ID:', user?.id);
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      console.log('Creating invoice for user:', normalizedUserId);
      console.log('Invoice data to insert:', { ...invoiceData, user_id: normalizedUserId });
      
      // Insert the invoice
      const { data, error } = await supabase
        .from('invoices')
        .insert([{ ...invoiceData, user_id: normalizedUserId }])
        .select()
        .single();
      
      if (error) {
        console.error('Supabase error creating invoice:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(`Failed to save invoice: ${error.message}`);
      }
      
      console.log('Successfully created invoice:', data);
      return data;
    },
    onSuccess: (data) => {
      console.log('Invoice creation successful, invalidating queries');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error) => {
      console.error('Mutation error:', error);
    },
  });
};
