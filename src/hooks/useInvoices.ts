
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/ClerkAuthProvider';

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
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['invoices', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      console.log('Fetching invoices for user:', user.id);
      
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching invoices:', error);
        throw error;
      }
      
      console.log('Fetched invoices:', data);
      return data as Invoice[];
    },
    enabled: !!user,
  });
};

export const useCreateInvoice = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (invoiceData: Omit<Invoice, 'id' | 'created_at'>) => {
      if (!user) throw new Error('User not authenticated');
      
      console.log('Creating invoice:', invoiceData);
      
      const { data, error } = await supabase
        .from('invoices')
        .insert([{ ...invoiceData, user_id: user.id }])
        .select()
        .single();
      
      if (error) {
        console.error('Error creating invoice:', error);
        throw error;
      }
      
      console.log('Created invoice:', data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
};
