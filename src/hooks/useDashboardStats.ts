
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export const useDashboardStats = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['dashboard-stats', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        console.error('User not authenticated or invalid user ID:', user?.id);
        throw new Error('User not authenticated or invalid user ID');
      }

      const normalizedUserId = normalizeUserId(user.id);
      console.log('Fetching dashboard stats for user:', normalizedUserId);

      // Get total invoices count
      const { count: totalInvoices, error: invoiceCountError } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', normalizedUserId);

      if (invoiceCountError) {
        console.error('Error fetching invoice count:', invoiceCountError);
      }

      // Get total clients count
      const { count: totalClients, error: clientCountError } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', normalizedUserId);

      if (clientCountError) {
        console.error('Error fetching client count:', clientCountError);
      }

      // Get revenue and pending amount — include paid_amount for partial payments
      const { data: invoiceStats, error: invoiceStatsError } = await supabase
        .from('invoices')
        .select('total_amount, paid_amount, status')
        .eq('user_id', normalizedUserId);

      if (invoiceStatsError) {
        console.error('Error fetching invoice stats:', invoiceStatsError);
      }

      // Revenue = sum of all paid_amount across ALL invoices (covers partial + full payments)
      const totalRevenue = invoiceStats?.reduce((sum, invoice) => {
        const paidAmount = Number(invoice.paid_amount || 0);
        const totalAmount = Number(invoice.total_amount || 0);
        if (invoice.status === 'paid') {
          // Fully paid: use total_amount (paid_amount may not be set)
          return sum + totalAmount;
        }
        // Partial payments on pending/overdue invoices
        return sum + paidAmount;
      }, 0) || 0;

      // Pending = total_amount - paid_amount for unpaid invoices
      const pendingAmount = invoiceStats?.reduce((sum, invoice) => {
        if (invoice.status === 'pending' || invoice.status === 'overdue' || invoice.status === 'partial') {
          const remaining = Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0);
          return sum + Math.max(0, remaining);
        }
        return sum;
      }, 0) || 0;

      // Get customer advance payments received
      const { data: advanceData, error: advanceError } = await supabase
        .from('payment_received')
        .select('amount, payment_type')
        .eq('user_id', normalizedUserId);

      if (advanceError) {
        console.error('Error fetching advances:', advanceError);
      }

      const advancesReceived = (advanceData || [])
        .filter(p => p.payment_type === 'customer_advance')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const paymentsReceivedCount = (advanceData || []).length;

      // Get recent invoices
      const { data: recentInvoices, error: recentInvoicesError } = await supabase
        .from('invoices')
        .select('id, invoice_number, client_name, total_amount, status, invoice_date')
        .eq('user_id', normalizedUserId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (recentInvoicesError) {
        console.error('Error fetching recent invoices:', recentInvoicesError);
      }

      console.log('Dashboard stats fetched:', {
        totalInvoices: totalInvoices || 0,
        totalClients: totalClients || 0,
        totalRevenue,
        pendingAmount,
        advancesReceived,
        recentInvoicesCount: recentInvoices?.length || 0
      });

      return {
        totalInvoices: totalInvoices || 0,
        totalClients: totalClients || 0,
        totalRevenue,
        pendingAmount,
        advancesReceived,
        paymentsReceivedCount,
        recentInvoices: recentInvoices || []
      };
    },
    enabled: !!user && isValidUserId(user?.id),
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  });
};
