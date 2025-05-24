
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/ClerkAuthProvider';

export const useDashboardStats = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['dashboard-stats', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      // Get total invoices count
      const { count: totalInvoices } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      
      // Get total clients count
      const { count: totalClients } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      
      // Get revenue and pending amount
      const { data: invoiceStats } = await supabase
        .from('invoices')
        .select('total_amount, status')
        .eq('user_id', user.id);
      
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
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);
      
      return {
        totalInvoices: totalInvoices || 0,
        totalClients: totalClients || 0,
        totalRevenue,
        pendingAmount,
        recentInvoices: recentInvoices || []
      };
    },
    enabled: !!user,
  });
};
