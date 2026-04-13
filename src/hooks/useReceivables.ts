import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeUserId } from '@/lib/userUtils';

export interface Receivable {
  id: string;
  user_id: string;
  customer_name: string;
  customer_email?: string;
  related_sales_order_id?: string;
  related_sales_order_number?: string;
  invoice_number?: string;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  due_date: string;
  status: 'pending' | 'overdue' | 'paid' | 'partial';
  payment_date?: string;
  notes?: string;
  is_from_sales_order?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const useReceivables = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['receivables', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const normalizedUserId = normalizeUserId(user.id);

      const { data: receivablesData, error: receivablesError } = await supabase
        .from('receivables' as any)
        .select('*')
        .eq('user_id', normalizedUserId)
        .order('due_date', { ascending: true });

      if (receivablesError) {
        console.error('Error fetching receivables:', receivablesError);
        throw receivablesError;
      }

      const { data: salesOrdersData, error: salesOrdersError } = await supabase
        .from('sales_orders' as any)
        .select('*')
        .eq('user_id', normalizedUserId)
        .eq('status', 'confirmed')
        .neq('payment_status', 'paid')
        .order('due_date', { ascending: true });

      if (salesOrdersError) {
        console.error('Error fetching sales orders for receivables:', salesOrdersError);
        throw salesOrdersError;
      }

      const existingOrderIds = (receivablesData || [])
        .map((receivable: any) => receivable.related_sales_order_id)
        .filter(Boolean);

      const salesOrdersAsReceivables = (salesOrdersData || [])
        .filter((order: any) => !existingOrderIds.includes(order.id))
        .map((order: any) => ({
          id: `so-${order.id}`,
          user_id: order.user_id,
          customer_name: order.client_name,
          customer_email: order.client_email,
          related_sales_order_id: order.id,
          related_sales_order_number: order.order_number,
          invoice_number: order.order_number,
          amount_due: Number(order.total_amount || 0),
          amount_paid: 0,
          amount_remaining: Number(order.total_amount || 0),
          due_date: order.due_date,
          status: new Date(order.due_date) < new Date() ? 'overdue' : 'pending',
          payment_date: null,
          notes: order.notes,
          created_at: order.created_at,
          updated_at: order.updated_at,
          is_from_sales_order: true,
        }));

      return [...(receivablesData || []), ...salesOrdersAsReceivables] as Receivable[];
    },
    enabled: !!user?.id,
  });
};
