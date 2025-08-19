import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId } from '@/lib/userUtils';

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
  // Add items_with_product_id so we can read it from DB when present
  items_with_product_id?: any[];
  // Also support items_product_mapping for compatibility
  items_product_mapping?: any[];
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
      
      const uid = user.id;
      console.log('Fetching invoices for user:', uid);
      
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching invoices:', error);
        throw error;
      }
      
      console.log('Fetched invoices:', data);
      
      // Check for overdue invoices and update status (client-side for view)
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
      
      const uid = user.id;

      // Build items_with_product_id by mapping invoice items to inventory product IDs
      // Prefer the product_id already present on each item; otherwise map by product_name/description.
      let itemsWithProductId: any[] = [];
      if (Array.isArray(invoiceData.items) && invoiceData.items.length > 0) {
        console.log('[CreateInvoice] Mapping items to inventory product IDs...');
        // Fetch minimal inventory list for mapping
        const { data: inventory, error: invError } = await supabase
          .from('inventory')
          .select('id, product_name')
          .eq('user_id', uid);

        if (invError) {
          console.error('[CreateInvoice] Failed to fetch inventory for mapping:', invError);
          throw invError;
        }

        const inv = inventory || [];
        itemsWithProductId = invoiceData.items.map((item: any, idx: number) => {
          // Prefer existing product_id if already set by the UI
          if (item?.product_id) {
            console.log(`[CreateInvoice] Item #${idx + 1} already has product_id:`, item.product_id);
            return item;
          }

          const nameCandidate =
            item?.product_name ??
            item?.name ??
            item?.description ??
            item?.item_name ??
            '';

          const matched = inv.find(i => i.product_name === nameCandidate);
          const mapped = { ...item, product_id: matched?.id ?? null };

          console.log(`[CreateInvoice] Item #${idx + 1} "${nameCandidate}" => product_id:`, mapped.product_id);
          return mapped;
        });
      }

      const payload = { 
        ...invoiceData, 
        user_id: uid,
        // Persist the mapping alongside existing items
        items_with_product_id: itemsWithProductId.length ? itemsWithProductId : invoiceData.items,
        // Also keep a copy in items_product_mapping for compatibility
        items_product_mapping: itemsWithProductId.length ? itemsWithProductId : invoiceData.items,
      };
      
      console.log('[CreateInvoice] Creating invoice with payload:', {
        ...payload,
        // Avoid logging huge arrays completely
        items_with_product_id_preview: Array.isArray(payload.items_with_product_id) ? payload.items_with_product_id.slice(0, 3) : null
      });
      console.log('[CreateInvoice] Target table: invoices');
      console.log('[CreateInvoice] Supabase URL:', 'https://vhntnkvtzmerpdhousfr.supabase.co');
      console.log('[CreateInvoice] Request URL:', `https://vhntnkvtzmerpdhousfr.supabase.co/rest/v1/invoices`);
      console.log('[CreateInvoice] User ID:', uid);
      
      const { data, error } = await supabase
        .from('invoices')
        .insert([payload])
        .select()
        .single();
      
      if (error) {
        console.error('[CreateInvoice] Supabase error:', error);
        console.error('[CreateInvoice] Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        
        if (error.code === 'PGRST116') {
          throw new Error('Database table not found. Please check your database setup.');
        } else if (error.code === 'PGRST301') {
          throw new Error('Permission denied. Please check your authentication.');
        } else if (error.code === '42P01') {
          throw new Error('Table "invoices" does not exist. Please ensure the database schema is properly set up.');
        } else {
          throw new Error(`Failed to create invoice: ${error.message}`);
        }
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
      console.error('Invoice creation failed:', error);
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
      
      const uid = user.id;
      
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId)
        .eq('user_id', uid);
      
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
      
      const uid = user.id;
      
      const { data, error } = await supabase
        .from('invoices')
        .update({ status })
        .eq('id', invoiceId)
        .eq('user_id', uid)
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
