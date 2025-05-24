
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
      const { count: totalInvoices } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', normalizedUserId);
      
      // Get total clients count
      const { count: totalClients } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', normalizedUserId);
      
      // Get revenue and pending amount
      const { data: invoiceStats } = await supabase
        .from('invoices')
        .select('total_amount, status')
        .eq('user_id', normalizedUserId);
      
      const totalRevenue = invoiceStats?.reduce((sum, invoice) => {
        return invoice.status === 'paid' ? sum + Number(invoice.total_amount) : sum;
      }, 0) || 0;
      
      const pendingAmount = invoiceStats?.reduce((sum, invoice) => {
        return invoice.status === 'pending' || invoice.status === 'overdue' 
          ? sum + Number(invoice.total_amount) : sum;
      }, 0) || 0;
      
      // Get recent invoices
      const { data: recentInvoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, client_name, total_amount, status, invoice_date')
        .eq('user_id', normalizedUserId)
        .order('created_at', { ascending: false })
        .limit(3);
      
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
