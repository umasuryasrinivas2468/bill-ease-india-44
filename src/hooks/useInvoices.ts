import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { postPaymentReceivedJournal } from '@/utils/autoJournalEntry';

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
  paid_amount?: number;
  advance?: number;
  discount?: number;
  roundoff?: number;
  gst_rate?: number;
  from_email?: string;
  status: 'paid' | 'pending' | 'overdue' | 'partial';
  invoice_date: string;
  due_date: string;
  items: any[];
  // Keep items_with_product_id for storing mapped items with product_id
  items_with_product_id?: any[];
  notes?: string;
  created_at: string;
}

export const useInvoices = () => {
  const { user } = useUser();
  const normalizedUserId = user ? normalizeUserId(user.id) : null;
  
  return useQuery({
    queryKey: ['invoices', normalizedUserId],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        console.error('User not authenticated or invalid user ID:', user?.id);
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const uid = normalizeUserId(user.id);
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
      
      console.log('Fetched invoices:', data?.length || 0, 'records');
      
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
          const nameCandidate =
            item?.product_name ??
            item?.name ??
            item?.description ??
            item?.item_name ??
            '';

          const matched = inv.find(i => i.product_name === nameCandidate);
          const product_id = item?.product_id ?? matched?.id ?? null;

          const quantity = Number(item?.quantity ?? 0);
          const rate = Number(item?.rate ?? 0);
          const amountFromItem = Number(item?.amount);
          const amount = Number.isFinite(amountFromItem) ? amountFromItem : quantity * rate;

          const hsn_sac = item?.hsn_sac ?? '';

          const mapped = {
            ...item,
            product_id,
            quantity,
            rate,
            amount,
            hsn_sac,
          };

          console.log(`[CreateInvoice] Item #${idx + 1} "${nameCandidate}" => product_id:`, product_id);
          return mapped;
        });
      }

      const payload = { 
        ...invoiceData, 
        user_id: uid,
        // Persist only items_with_product_id (drop items_product_mapping)
        items_with_product_id: itemsWithProductId.length ? itemsWithProductId : invoiceData.items,
      };
      
      console.log('[CreateInvoice] Creating invoice with payload:', {
        ...payload,
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

export const useRecordInvoicePayment = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async ({ invoiceId, paymentAmount, totalAmount }: { invoiceId: string; paymentAmount: number; totalAmount: number }) => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');
      const uid = normalizeUserId(user.id);

      // Fetch current paid_amount (include user_id filter for RLS)
      const { data: current, error: fetchError } = await supabase
        .from('invoices')
        .select('paid_amount, total_amount, invoice_number, client_name')
        .eq('id', invoiceId)
        .eq('user_id', uid)
        .single();

      if (fetchError) {
        console.error('Failed to fetch invoice for payment:', fetchError);
        throw new Error('Could not fetch invoice. Please refresh and try again.');
      }

      const currentPaid = Number(current?.paid_amount) || 0;
      const invoiceTotal = Number(current?.total_amount) || totalAmount;
      const newPaidAmount = currentPaid + paymentAmount;
      const newStatus: Invoice['status'] =
        newPaidAmount >= invoiceTotal ? 'paid' : 'partial';

      console.log('[Payment] Invoice:', current.invoice_number, '| Current paid:', currentPaid, '| New payment:', paymentAmount, '| New total paid:', newPaidAmount, '| Status:', newStatus);

      const { data, error } = await supabase
        .from('invoices')
        .update({
          paid_amount: newPaidAmount,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)
        .eq('user_id', uid)
        .select()
        .single();

      if (error) {
        console.error('Failed to update invoice payment:', error);
        throw new Error('Payment update failed. Check if paid_amount column exists in the database.');
      }

      // Post payment journal for every payment (partial or full)
      try {
        await postPaymentReceivedJournal(uid, {
          invoice_number: current.invoice_number,
          date: new Date().toISOString().split('T')[0],
          client_name: current.client_name,
          amount: paymentAmount,
        });
      } catch (journalErr) {
        console.error('Auto payment journal failed:', journalErr);
      }

      return data as Invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
};

export const useUpdateInvoiceStatus = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async ({ invoiceId, status }: { invoiceId: string; status: 'paid' | 'pending' | 'overdue' | 'partial' }) => {
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
      
      // Auto-create payment journal when marked as paid
      if (status === 'paid' && data) {
        try {
          await postPaymentReceivedJournal(uid, {
            invoice_number: data.invoice_number,
            date: new Date().toISOString().split('T')[0],
            client_name: data.client_name,
            amount: data.total_amount,
          });
        } catch (journalErr) {
          console.error('Auto payment journal failed:', journalErr);
        }
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
