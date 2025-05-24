
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
      
      // Get revenue and pending amount
      const { data: invoiceStats, error: invoiceStatsError } = await supabase
        .from('invoices')
        .select('total_amount, status')
        .eq('user_id', normalizedUserId);
      
      if (invoiceStatsError) {
        console.error('Error fetching invoice stats:', invoiceStatsError);
      }
      
      const totalRevenue = invoiceStats?.reduce((sum, invoice) => {
        return invoice.status === 'paid' ? sum + Number(invoice.total_amount) : sum;
      }, 0) || 0;
      
      const pendingAmount = invoiceStats?.reduce((sum, invoice) => {
        return invoice.status === 'pending' || invoice.status === 'overdue' 
          ? sum + Number(invoice.total_amount) : sum;
      }, 0) || 0;
      
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
        recentInvoicesCount: recentInvoices?.length || 0
      });
      
      return {
        totalInvoices: totalInvoices || 0,
        totalClients: totalClients || 0,
        totalRevenue,
        pendingAmount,
        recentInvoices: recentInvoices || []
      };
    },
    enabled: !!user && isValidUserId(user?.id),
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  });
};
