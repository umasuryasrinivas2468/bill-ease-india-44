import { useMemo } from 'react';
import { useInvoices } from '@/hooks/useInvoices';
import { useQuotations } from '@/hooks/useQuotations';
import { useClients } from '@/hooks/useClients';
import { useJournalsWithLines } from '@/hooks/useJournals';
import { useInventory } from '@/hooks/useInventory';
import { useTDSTransactions } from '@/hooks/useTDSTransactions';
import { useBusinessData } from '@/hooks/useBusinessData';
import { usePayables } from '@/hooks/usePayables';
import { format } from 'date-fns';

export const usePerformanceData = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: quotations = [] } = useQuotations();
  const { data: clients = [] } = useClients();
  const { data: journalData } = useJournalsWithLines();
  const journals = journalData?.journals || [];
  const journalLines = journalData?.lines || [];
  const accounts = journalData?.accounts || [];
  const { data: inventories = [] } = useInventory();
  const { data: tdsTransactions = [] } = useTDSTransactions();
  const { data: payables = [] } = usePayables();
  const { getBusinessInfo, getBusinessAssets } = useBusinessData();
  
  const businessInfo = getBusinessInfo();
  const businessAssets = getBusinessAssets();

  const performanceData = useMemo(() => {
    // Calculate total revenue from paid invoices
    const paidInvoices = invoices.filter(inv => inv.status === 'paid');
    const totalRevenue = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);

    // Count quotations sent and accepted
    const quotationsSent = quotations.length;
    const quotationsAccepted = quotations.filter(q => q.status === 'accepted').length;

    // Calculate TDS amount
    const tdsAmount = tdsTransactions.reduce((sum, transaction) => 
      sum + Number(transaction.tds_amount || 0), 0);

    // Get current period
    const currentDate = new Date();
    const period = format(currentDate, 'MMMM yyyy');

    // Basic cashflow approximation from invoices and journal lines
    const cashIn = paidInvoices.reduce((s, inv) => s + Number(inv.total_amount || 0), 0);
    // Treat journal lines with credit values as cash outflows approximation
    const cashOut = journalLines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);

    // Client revenue breakdown
    const revenueByClient: Record<string, number> = {};
    paidInvoices.forEach(inv => {
      const name = inv.client_name || 'Unknown';
      revenueByClient[name] = (revenueByClient[name] || 0) + Number(inv.total_amount || 0);
    });

    // inventories from hook
    // (hook was called above via useInventory)

  return {
      // Original summary fields
      invoicesCreated: invoices.length,
      journalsCount: journals.length,
      quotationsSent,
      quotationsAccepted,
      clientsCount: clients.length,
      tdsAmount,
      totalRevenue,
      businessName: businessInfo?.businessName || 'Your Business',
      period,
      // Arrays and detailed data
      invoices,
      quotations,
      clients,
  journals,
  journalLines,
  accounts,
      tdsTransactions,
      revenueByClient,
      cashIn,
      cashOut,
  inventories,
    businessAssets,
      payables,
      // Derived quick metrics
      paidInvoices: paidInvoices.length,
      pendingInvoices: invoices.filter(inv => inv.status === 'pending').length,
      overDueInvoices: invoices.filter(inv => inv.status === 'overdue').length,
      totalGstCollected: paidInvoices.reduce((sum, inv) => sum + Number(inv.gst_amount || 0), 0)
    } as const;
  }, [invoices, quotations, clients, journalData, tdsTransactions, payables, businessInfo]);

  return performanceData;
};