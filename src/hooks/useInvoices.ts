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
  advance?: number;
  discount?: number;
  roundoff?: number;
  gst_rate?: number;
  from_email?: string;
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
      
      // Check for overdue invoices and update status
      const today = new Date().toISOString().split('T')[0];
      const invoicesWithStatus = (data || []).map(invoice => {
        if (invoice.status === 'pending' && invoice.due_date < today) {
          return { ...invoice, status: 'overdue' };
        }
        return invoice;
      });
      
      return invoicesWithStatus as Invoice[];
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
      const payload = { ...invoiceData, user_id: normalizedUserId };
      console.log('[CreateInvoice] Preparing to insert into table: /invoices');
      console.log('[CreateInvoice] Payload:', payload);
      
      const { data, error } = await supabase
        .from('invoices')
        .insert([payload])
        .select()
        .single();
      
      if (error) {
        // Enhanced 404 diagnostics (if some layer attempts HTTP route)
        if ((error as any)?.code === '404' || String(error.message || '').includes('404')) {
          console.error('[CreateInvoice] 404 while creating invoice');
          console.error('[CreateInvoice] Expected endpoint: Supabase table "invoices" via RPC');
          console.error('[CreateInvoice] Last known payload:', payload);
        } else {
          console.error('[CreateInvoice] Supabase error creating invoice:', error);
        }
        throw new Error(`Failed to save invoice: ${error.message}`);
      }
      
      console.log('[CreateInvoice] Successfully created invoice:', data);
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

export const useDeleteInvoice = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId)
        .eq('user_id', normalizedUserId);
      
      if (error) {
        console.error('Error deleting invoice:', error);
        throw error;
      }
      
      return invoiceId;
    },
    onSuccess: () => {
      console.log('Invoice deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error) => {
      console.error('Delete mutation error:', error);
    },
  });
};

export const useUpdateInvoiceStatus = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async ({ invoiceId, status }: { invoiceId: string; status: 'paid' | 'pending' | 'overdue' }) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      
      const { data, error } = await supabase
        .from('invoices')
        .update({ status })
        .eq('id', invoiceId)
        .eq('user_id', normalizedUserId)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating invoice status:', error);
        throw error;
      }
      
      return data;
    },
    onSuccess: () => {
      console.log('Invoice status updated successfully');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error) => {
      console.error('Update status mutation error:', error);
    },
  });
};
