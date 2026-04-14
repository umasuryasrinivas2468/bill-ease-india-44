import React, { useState, useEffect, useMemo } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import {
  FileText, Download, Building2, Calculator, BookOpen, FileSpreadsheet, Loader2,
  ScrollText, ClipboardList, Scale, Wallet, Receipt, ArrowLeftRight, BarChart3,
  TrendingUp, TrendingDown, Activity, Package, ArrowUpDown, Bot, Sparkles,
  DollarSign, PieChart, Boxes, MoveHorizontal, Minus,
} from 'lucide-react';
import ITCReport from '@/components/reports/ITCReport';
import RCMLiabilityReport from '@/components/reports/RCMLiabilityReport';
import GSTSummaryReport from '@/components/reports/GSTSummaryReport';
import ScheduleIIIBalanceSheet from '@/components/reports/ScheduleIIIBalanceSheet';
import ScheduleIIIProfitLoss from '@/components/reports/ScheduleIIIProfitLoss';
import { useEnhancedBusinessData } from '@/hooks/useEnhancedBusinessData';
import {
  fetchFinancialData,
  getFinancialYearOptions,
  CompanyDetails,
  FinancialData
} from '@/services/financialStatementsService';
import { generateFinancialStatementsPDF } from '@/utils/financialStatementsPDF';
import {
  generateIncomeExpenditurePDF,
  generateJournalAuditPDF,
  processJournalsForIncomeExpenditure,
  IncomeExpenditureData,
  CompanyInfo
} from '@/utils/incomeExpenditurePDF';
import {
  generateReceiptsPaymentsPDF,
  generateTrialBalancePDF,
  processJournalsForReceiptsPayments,
  processJournalsForTrialBalance,
  ReceiptsPaymentsData,
  TrialBalanceData
} from '@/utils/receiptsPaymentsPDF';
import { useJournalsWithLines } from '@/hooks/useJournals';

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmtINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const pct = (n: number) => `${n >= 0 ? '' : ''}${n.toFixed(1)}%`;

const getMonthRange = (offset: number) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const end = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  const label = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  return { start, end, label };
};

const ChangeIndicator = ({ current, previous }: { current: number; previous: number }) => {
  if (previous === 0 && current === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const change = previous === 0 ? 100 : ((current - previous) / Math.abs(previous)) * 100;
  const isUp = change > 0;
  const isDown = change < 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? 'text-emerald-600' : isDown ? 'text-rose-600' : 'text-muted-foreground'}`}>
      {isUp ? <TrendingUp className="h-3 w-3" /> : isDown ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {Math.abs(change).toFixed(1)}%
    </span>
  );
};

const StatBox = ({ label, value, sub, icon: Icon, color = 'blue' }: { label: string; value: string; sub?: string; icon: any; color?: string }) => (
  <div className={`rounded-xl border bg-${color}-50/50 dark:bg-${color}-950/20 p-4`}>
    <div className="flex items-center gap-2 mb-2">
      <div className={`w-8 h-8 rounded-lg bg-${color}-100 dark:bg-${color}-900/40 flex items-center justify-center`}>
        <Icon className={`h-4 w-4 text-${color}-600 dark:text-${color}-400`} />
      </div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
    <p className="text-lg font-bold">{value}</p>
    {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

// ── Main Component ──────────────────────────────────────────────────────────
const FinancialStatements = () => {
  const { user } = useUser();
  const userId = user?.id;
  const { getBusinessInfo } = useEnhancedBusinessData();
  const businessInfo = getBusinessInfo();
  const { data: journalsData, isLoading: journalsLoading } = useJournalsWithLines();

  const [financialYear, setFinancialYear] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [financialData, setFinancialData] = useState<FinancialData | null>(null);
  const [incomeExpenditureData, setIncomeExpenditureData] = useState<IncomeExpenditureData | null>(null);
  const [receiptsPaymentsData, setReceiptsPaymentsData] = useState<ReceiptsPaymentsData | null>(null);
  const [trialBalanceData, setTrialBalanceData] = useState<TrialBalanceData | null>(null);
  const [misAiReason, setMisAiReason] = useState<string>('');
  const [misAiLoading, setMisAiLoading] = useState(false);

  const [companyDetails, setCompanyDetails] = useState<CompanyDetails>({
    companyName: businessInfo?.businessName || '',
    cin: '',
    pan: '',
    address: businessInfo ? `${businessInfo.address || ''}, ${businessInfo.city || ''}, ${businessInfo.state || ''}, ${businessInfo.pincode || ''}` : '',
    place: businessInfo?.city || '',
    dateOfIncorporation: '',
    ownerName: businessInfo?.ownerName || '',
    directorDIN: '',
    secondDirectorName: '',
    secondDirectorDIN: ''
  });

  const fyOptions = getFinancialYearOptions();
  const thisMonth = getMonthRange(0);
  const lastMonth = getMonthRange(-1);

  // ── Queries ─────────────────────────────────────────────────────────────
  // MIS: This month data
  const { data: thisMonthData } = useQuery({
    queryKey: ['mis-this-month', userId],
    queryFn: async () => {
      const [invoices, expenses, journals] = await Promise.all([
        supabase.from('invoices').select('amount, status').eq('user_id', userId!).gte('invoice_date', thisMonth.start).lte('invoice_date', thisMonth.end),
        supabase.from('expenses').select('total_amount, amount, category_name').eq('user_id', userId!).gte('expense_date', thisMonth.start).lte('expense_date', thisMonth.end),
        supabase.from('journals').select('total_debit, total_credit, status, narration').eq('user_id', userId!).eq('status', 'posted').gte('journal_date', thisMonth.start).lte('journal_date', thisMonth.end),
      ]);
      const revenue = (invoices.data || []).reduce((s, i) => s + Number(i.amount || 0), 0);
      const expense = (expenses.data || []).reduce((s, e) => s + Number(e.total_amount || e.amount || 0), 0);
      const totalDebit = (journals.data || []).reduce((s, j) => s + Number(j.total_debit || 0), 0);
      const totalCredit = (journals.data || []).reduce((s, j) => s + Number(j.total_credit || 0), 0);
      const expByCategory = (expenses.data || []).reduce((acc, e) => {
        const cat = e.category_name || 'Other';
        acc[cat] = (acc[cat] || 0) + Number(e.total_amount || e.amount || 0);
        return acc;
      }, {} as Record<string, number>);
      return { revenue, expense, totalDebit, totalCredit, profit: revenue - expense, expByCategory, invoiceCount: invoices.data?.length || 0, expenseCount: expenses.data?.length || 0 };
    },
    enabled: !!userId,
  });

  // MIS: Last month data
  const { data: lastMonthData } = useQuery({
    queryKey: ['mis-last-month', userId],
    queryFn: async () => {
      const [invoices, expenses, journals] = await Promise.all([
        supabase.from('invoices').select('amount, status').eq('user_id', userId!).gte('invoice_date', lastMonth.start).lte('invoice_date', lastMonth.end),
        supabase.from('expenses').select('total_amount, amount, category_name').eq('user_id', userId!).gte('expense_date', lastMonth.start).lte('expense_date', lastMonth.end),
        supabase.from('journals').select('total_debit, total_credit, status').eq('user_id', userId!).eq('status', 'posted').gte('journal_date', lastMonth.start).lte('journal_date', lastMonth.end),
      ]);
      const revenue = (invoices.data || []).reduce((s, i) => s + Number(i.amount || 0), 0);
      const expense = (expenses.data || []).reduce((s, e) => s + Number(e.total_amount || e.amount || 0), 0);
      const totalDebit = (journals.data || []).reduce((s, j) => s + Number(j.total_debit || 0), 0);
      const totalCredit = (journals.data || []).reduce((s, j) => s + Number(j.total_credit || 0), 0);
      const expByCategory = (expenses.data || []).reduce((acc, e) => {
        const cat = e.category_name || 'Other';
        acc[cat] = (acc[cat] || 0) + Number(e.total_amount || e.amount || 0);
        return acc;
      }, {} as Record<string, number>);
      return { revenue, expense, totalDebit, totalCredit, profit: revenue - expense, expByCategory, invoiceCount: invoices.data?.length || 0, expenseCount: expenses.data?.length || 0 };
    },
    enabled: !!userId,
  });

  // Performance Ratios data
  const { data: ratioData } = useQuery({
    queryKey: ['performance-ratios', userId],
    queryFn: async () => {
      const [accounts, receivables, payables, invoices, expenses, inventory] = await Promise.all([
        supabase.from('accounts').select('account_name, account_type, opening_balance').eq('user_id', userId!).eq('is_active', true),
        supabase.from('receivables').select('amount_remaining, status').eq('user_id', userId!),
        supabase.from('payables').select('amount_remaining, status').eq('user_id', userId!),
        supabase.from('invoices').select('amount, status').eq('user_id', userId!),
        supabase.from('expenses').select('total_amount, amount').eq('user_id', userId!),
        supabase.from('inventory').select('stock_quantity, purchase_price, selling_price, type').eq('user_id', userId!),
      ]);

      const accs = accounts.data || [];
      const cashBank = accs.filter(a => a.account_type === 'Asset' && /cash|bank|current|savings/i.test(a.account_name)).reduce((s, a) => s + Number(a.opening_balance || 0), 0);
      const totalAssets = accs.filter(a => a.account_type === 'Asset').reduce((s, a) => s + Number(a.opening_balance || 0), 0);
      const totalLiabilities = accs.filter(a => a.account_type === 'Liability').reduce((s, a) => s + Number(a.opening_balance || 0), 0);
      const totalEquity = accs.filter(a => a.account_type === 'Equity').reduce((s, a) => s + Number(a.opening_balance || 0), 0);

      const tradeReceivables = (receivables.data || []).filter(r => r.status !== 'paid').reduce((s, r) => s + Number(r.amount_remaining || 0), 0);
      const tradePayables = (payables.data || []).filter(p => p.status !== 'paid').reduce((s, p) => s + Number(p.amount_remaining || 0), 0);

      const totalRevenue = (invoices.data || []).reduce((s, i) => s + Number(i.amount || 0), 0);
      const totalExpenses = (expenses.data || []).reduce((s, e) => s + Number(e.total_amount || e.amount || 0), 0);
      const netProfit = totalRevenue - totalExpenses;

      const inv = (inventory.data || []).filter(i => i.type === 'goods');
      const inventoryValue = inv.reduce((s, i) => s + (Number(i.stock_quantity || 0) * Number(i.purchase_price || 0)), 0);

      const currentAssets = cashBank + tradeReceivables + inventoryValue;
      const currentLiabilities = tradePayables;

      return {
        currentRatio: currentLiabilities > 0 ? currentAssets / currentLiabilities : 0,
        quickRatio: currentLiabilities > 0 ? (currentAssets - inventoryValue) / currentLiabilities : 0,
        debtToEquity: totalEquity > 0 ? totalLiabilities / totalEquity : 0,
        roe: totalEquity > 0 ? (netProfit / totalEquity) * 100 : 0,
        roa: totalAssets > 0 ? (netProfit / totalAssets) * 100 : 0,
        grossMargin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0,
        netMargin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
        assetTurnover: totalAssets > 0 ? totalRevenue / totalAssets : 0,
        receivableTurnover: tradeReceivables > 0 ? totalRevenue / tradeReceivables : 0,
        payableTurnover: tradePayables > 0 ? totalExpenses / tradePayables : 0,
        workingCapital: currentAssets - currentLiabilities,
        inventoryTurnover: inventoryValue > 0 ? totalExpenses / inventoryValue : 0,
        cashBank, totalAssets, totalLiabilities, totalEquity, tradeReceivables, tradePayables, inventoryValue, totalRevenue, totalExpenses, netProfit,
      };
    },
    enabled: !!userId,
  });

  // Cash flow forecast data
  const { data: cashFlowData } = useQuery({
    queryKey: ['cashflow-forecast', userId],
    queryFn: async () => {
      const months: { label: string; inflow: number; outflow: number; net: number }[] = [];
      for (let i = -5; i <= 0; i++) {
        const m = getMonthRange(i);
        const [inv, exp] = await Promise.all([
          supabase.from('invoices').select('amount').eq('user_id', userId!).gte('invoice_date', m.start).lte('invoice_date', m.end),
          supabase.from('expenses').select('total_amount, amount').eq('user_id', userId!).gte('expense_date', m.start).lte('expense_date', m.end),
        ]);
        const inflow = (inv.data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
        const outflow = (exp.data || []).reduce((s, r) => s + Number(r.total_amount || r.amount || 0), 0);
        months.push({ label: m.label, inflow, outflow, net: inflow - outflow });
      }
      // Forecast next 3 months based on avg
      const avgIn = months.reduce((s, m) => s + m.inflow, 0) / months.length;
      const avgOut = months.reduce((s, m) => s + m.outflow, 0) / months.length;
      for (let i = 1; i <= 3; i++) {
        const m = getMonthRange(i);
        const growthFactor = 1 + (i * 0.02);
        months.push({ label: `${m.label} (F)`, inflow: Math.round(avgIn * growthFactor), outflow: Math.round(avgOut * growthFactor), net: Math.round((avgIn - avgOut) * growthFactor) });
      }
      return months;
    },
    enabled: !!userId,
  });

  // Inventory ageing data
  const { data: inventoryData } = useQuery({
    queryKey: ['inventory-ageing', userId],
    queryFn: async () => {
      const { data } = await supabase.from('inventory').select('*').eq('user_id', userId!);
      const items = data || [];
      const now = new Date();
      return items.filter(i => i.type === 'goods').map(item => {
        const created = new Date(item.created_at || item.updated_at || now.toISOString());
        const ageDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        const value = Number(item.stock_quantity || 0) * Number(item.purchase_price || 0);
        let bucket: string;
        if (ageDays <= 30) bucket = '0-30 days';
        else if (ageDays <= 60) bucket = '31-60 days';
        else if (ageDays <= 90) bucket = '61-90 days';
        else bucket = '90+ days';
        return { ...item, ageDays, value, bucket };
      });
    },
    enabled: !!userId,
  });

  // Stock movement: inward from purchase_bills, outward from invoices
  const { data: stockMovement } = useQuery({
    queryKey: ['stock-movement', userId],
    queryFn: async () => {
      const [invResult, purchaseResult, inventoryResult] = await Promise.all([
        supabase.from('invoices').select('amount, invoice_date, client_name, status').eq('user_id', userId!).order('invoice_date', { ascending: false }).limit(50),
        supabase.from('purchase_bills').select('total_amount, bill_date, vendor_name, status').eq('user_id', userId!).order('bill_date', { ascending: false }).limit(50),
        supabase.from('inventory').select('product_name, sku, stock_quantity, purchase_price, selling_price, reorder_level, type, updated_at').eq('user_id', userId!),
      ]);
      return {
        sales: (invResult.data || []).map(i => ({ date: i.invoice_date, party: i.client_name, amount: Number(i.amount || 0), type: 'outward' as const, status: i.status })),
        purchases: (purchaseResult.data || []).map(p => ({ date: p.bill_date, party: p.vendor_name, amount: Number(p.total_amount || 0), type: 'inward' as const, status: p.status })),
        inventory: (inventoryResult.data || []).filter(i => i.type === 'goods'),
      };
    },
    enabled: !!userId,
  });

  // Detailed P&L data
  const { data: detailedPnL } = useQuery({
    queryKey: ['detailed-pnl', userId],
    queryFn: async () => {
      const [invoices, expenses, journals, journalLines, accounts] = await Promise.all([
        supabase.from('invoices').select('amount, invoice_date, client_name, status, gst_amount').eq('user_id', userId!),
        supabase.from('expenses').select('total_amount, amount, expense_date, vendor_name, category_name, gst_amount, tds_amount').eq('user_id', userId!),
        supabase.from('journals').select('id, journal_date, narration, total_debit, total_credit, status').eq('user_id', userId!).eq('status', 'posted'),
        supabase.from('journal_lines').select('journal_id, account_id, debit, credit, line_narration').eq('user_id', userId!),
        supabase.from('accounts').select('id, account_name, account_type, account_code').eq('user_id', userId!).eq('is_active', true),
      ]);

      const accs = accounts.data || [];
      const lines = journalLines.data || [];
      const incomeAccounts = accs.filter(a => a.account_type === 'Income');
      const expenseAccounts = accs.filter(a => a.account_type === 'Expense');

      // Build account-wise totals from journal lines
      const accountTotals: Record<string, { name: string; type: string; debit: number; credit: number }> = {};
      for (const line of lines) {
        const acc = accs.find(a => a.id === line.account_id);
        if (!acc) continue;
        if (!accountTotals[acc.id]) accountTotals[acc.id] = { name: acc.account_name, type: acc.account_type, debit: 0, credit: 0 };
        accountTotals[acc.id].debit += Number(line.debit || 0);
        accountTotals[acc.id].credit += Number(line.credit || 0);
      }

      // Revenue from invoices
      const invoiceRevenue = (invoices.data || []).reduce((s, i) => s + Number(i.amount || 0), 0);
      const invoiceGST = (invoices.data || []).reduce((s, i) => s + Number(i.gst_amount || 0), 0);

      // Expenses by category
      const expByCategory: Record<string, { amount: number; count: number; gst: number; tds: number }> = {};
      for (const e of (expenses.data || [])) {
        const cat = e.category_name || 'Other Expenses';
        if (!expByCategory[cat]) expByCategory[cat] = { amount: 0, count: 0, gst: 0, tds: 0 };
        expByCategory[cat].amount += Number(e.total_amount || e.amount || 0);
        expByCategory[cat].count++;
        expByCategory[cat].gst += Number(e.gst_amount || 0);
        expByCategory[cat].tds += Number(e.tds_amount || 0);
      }

      const totalExpenseAmt = Object.values(expByCategory).reduce((s, v) => s + v.amount, 0);
      const totalGSTInput = Object.values(expByCategory).reduce((s, v) => s + v.gst, 0);
      const totalTDS = Object.values(expByCategory).reduce((s, v) => s + v.tds, 0);

      // Journal-based income/expense
      const journalIncome = Object.values(accountTotals).filter(a => a.type === 'Income').map(a => ({ name: a.name, amount: a.credit - a.debit }));
      const journalExpense = Object.values(accountTotals).filter(a => a.type === 'Expense').map(a => ({ name: a.name, amount: a.debit - a.credit }));

      return {
        invoiceRevenue, invoiceGST,
        expByCategory, totalExpenseAmt, totalGSTInput, totalTDS,
        journalIncome, journalExpense, accountTotals,
        grossProfit: invoiceRevenue - totalExpenseAmt,
        netProfit: invoiceRevenue - totalExpenseAmt - (invoiceRevenue - totalExpenseAmt > 0 ? (invoiceRevenue - totalExpenseAmt) * 0.25 : 0),
        taxExpense: invoiceRevenue - totalExpenseAmt > 0 ? (invoiceRevenue - totalExpenseAmt) * 0.25 : 0,
      };
    },
    enabled: !!userId,
  });

  // ── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (journalsData && journalsData.journals.length > 0) {
      setIncomeExpenditureData(processJournalsForIncomeExpenditure(journalsData.journals, journalsData.lines, journalsData.accounts));
      setReceiptsPaymentsData(processJournalsForReceiptsPayments(journalsData.journals, journalsData.lines, journalsData.accounts));
      setTrialBalanceData(processJournalsForTrialBalance(journalsData.journals, journalsData.lines, journalsData.accounts));
    }
  }, [journalsData]);

  useEffect(() => {
    if (businessInfo) {
      setCompanyDetails(prev => ({
        ...prev,
        companyName: businessInfo.businessName || prev.companyName,
        ownerName: businessInfo.ownerName || prev.ownerName,
        address: `${businessInfo.address || ''}, ${businessInfo.city || ''}, ${businessInfo.state || ''}, ${businessInfo.pincode || ''}`.replace(/^, |, $/g, ''),
        place: businessInfo.city || prev.place,
      }));
    }
  }, [businessInfo]);

  // ── MIS AI Analysis ─────────────────────────────────────────────────────
  const handleMisAiAnalysis = async () => {
    if (!thisMonthData || !lastMonthData) return;
    setMisAiLoading(true);
    try {
      const prompt = `Analyze this MIS (Management Information System) financial comparison for an Indian business and provide 4-5 key insights with reasons for the changes. Be specific with numbers.

Last Month (${lastMonth.label}): Revenue: ₹${lastMonthData.revenue}, Expenses: ₹${lastMonthData.expense}, Profit: ₹${lastMonthData.profit}, Invoices: ${lastMonthData.invoiceCount}, Debit: ₹${lastMonthData.totalDebit}, Credit: ₹${lastMonthData.totalCredit}
Expense breakdown: ${JSON.stringify(lastMonthData.expByCategory)}

This Month (${thisMonth.label}): Revenue: ₹${thisMonthData.revenue}, Expenses: ₹${thisMonthData.expense}, Profit: ₹${thisMonthData.profit}, Invoices: ${thisMonthData.invoiceCount}, Debit: ₹${thisMonthData.totalDebit}, Credit: ₹${thisMonthData.totalCredit}
Expense breakdown: ${JSON.stringify(thisMonthData.expByCategory)}

Provide actionable insights in bullet points. Keep it concise.`;

      const { data, error } = await supabase.functions.invoke('inventory-insights', {
        body: { prompt, analysisType: 'mis-analysis' },
      });
      if (error) throw error;
      setMisAiReason(data?.analysis || data?.text || 'AI analysis unavailable. Check your edge function.');
    } catch (err: any) {
      setMisAiReason('AI analysis failed: ' + err.message);
    } finally {
      setMisAiLoading(false);
    }
  };

  // ── Handlers (PDF generation) ───────────────────────────────────────────
  const handleFetchData = async () => {
    if (!userId || !financialYear) { toast.error('Please select a financial year'); return; }
    setLoading(true);
    try {
      const data = await fetchFinancialData(userId, financialYear);
      setFinancialData(data);
      toast.success('Financial data loaded successfully');
    } catch (error) { toast.error('Failed to fetch financial data'); } finally { setLoading(false); }
  };

  const getCompanyInfo = (): CompanyInfo => ({
    companyName: companyDetails.companyName, address: companyDetails.address,
    financialYear: financialYear || fyOptions[0], pan: companyDetails.pan, cin: companyDetails.cin,
  });

  const handleGeneratePDF = () => {
    if (!financialData || !companyDetails.companyName) { toast.error('Please fill company details and fetch data first'); return; }
    try {
      generateFinancialStatementsPDF(companyDetails, financialData, financialYear).save(`Financial_Statements_${companyDetails.companyName.replace(/\s+/g, '_')}_${financialYear}.pdf`);
      toast.success('PDF generated');
    } catch { toast.error('Failed to generate PDF'); }
  };

  const handlePDF = (type: string) => {
    if (!companyDetails.companyName) { toast.error('Please fill company name'); return; }
    try {
      const info = getCompanyInfo();
      if (type === 'ie' && incomeExpenditureData) generateIncomeExpenditurePDF(info, incomeExpenditureData).save(`Income_Expenditure_${info.companyName.replace(/\s+/g, '_')}.pdf`);
      else if (type === 'audit' && journalsData) generateJournalAuditPDF(info, journalsData.journals, journalsData.lines, journalsData.accounts).save(`Journal_Audit_${info.companyName.replace(/\s+/g, '_')}.pdf`);
      else if (type === 'rp' && receiptsPaymentsData) generateReceiptsPaymentsPDF(info, receiptsPaymentsData).save(`Receipts_Payments_${info.companyName.replace(/\s+/g, '_')}.pdf`);
      else if (type === 'tb' && trialBalanceData) generateTrialBalancePDF(info, trialBalanceData).save(`Trial_Balance_${info.companyName.replace(/\s+/g, '_')}.pdf`);
      else { toast.error('No data available'); return; }
      toast.success('PDF generated');
    } catch { toast.error('Failed to generate PDF'); }
  };

  // ── Inventory Ageing Summary ────────────────────────────────────────────
  const ageingSummary = useMemo(() => {
    if (!inventoryData?.length) return [];
    const buckets: Record<string, { count: number; value: number; items: typeof inventoryData }> = {
      '0-30 days': { count: 0, value: 0, items: [] },
      '31-60 days': { count: 0, value: 0, items: [] },
      '61-90 days': { count: 0, value: 0, items: [] },
      '90+ days': { count: 0, value: 0, items: [] },
    };
    for (const item of inventoryData) {
      const b = buckets[item.bucket];
      if (b) { b.count++; b.value += item.value; b.items.push(item); }
    }
    return Object.entries(buckets).map(([label, data]) => ({ label, ...data }));
  }, [inventoryData]);

  const formatCurrency = fmtINR;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Financial Statements & MIS</h1>
            <p className="text-muted-foreground text-xs mt-0.5">CA-grade reports, MIS dashboard, ratios & analytics</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="mis" className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex h-10 p-1 gap-1 w-auto min-w-full">
            <TabsTrigger value="mis" className="gap-1.5 text-xs"><Activity className="h-3.5 w-3.5" /> MIS Report</TabsTrigger>
            <TabsTrigger value="detailed-pnl" className="gap-1.5 text-xs"><Calculator className="h-3.5 w-3.5" /> Detailed P&L</TabsTrigger>
            <TabsTrigger value="ratios" className="gap-1.5 text-xs"><PieChart className="h-3.5 w-3.5" /> Ratios</TabsTrigger>
            <TabsTrigger value="cashflow" className="gap-1.5 text-xs"><DollarSign className="h-3.5 w-3.5" /> Cash Flow</TabsTrigger>
            <TabsTrigger value="inv-ageing" className="gap-1.5 text-xs"><Boxes className="h-3.5 w-3.5" /> Inv. Ageing</TabsTrigger>
            <TabsTrigger value="stock" className="gap-1.5 text-xs"><MoveHorizontal className="h-3.5 w-3.5" /> Stock Movement</TabsTrigger>
            <TabsTrigger value="setup" className="gap-1.5 text-xs"><Building2 className="h-3.5 w-3.5" /> Setup</TabsTrigger>
            <TabsTrigger value="pnl" className="gap-1.5 text-xs"><Calculator className="h-3.5 w-3.5" /> P&L</TabsTrigger>
            <TabsTrigger value="sch3-pnl" className="gap-1.5 text-xs"><Calculator className="h-3.5 w-3.5" /> Sch III</TabsTrigger>
            <TabsTrigger value="balance" className="gap-1.5 text-xs"><BookOpen className="h-3.5 w-3.5" /> Balance</TabsTrigger>
            <TabsTrigger value="trial-balance" className="gap-1.5 text-xs"><Scale className="h-3.5 w-3.5" /> Trial Bal</TabsTrigger>
            <TabsTrigger value="income-expenditure" className="gap-1.5 text-xs"><ScrollText className="h-3.5 w-3.5" /> I&E</TabsTrigger>
            <TabsTrigger value="receipts-payments" className="gap-1.5 text-xs"><Wallet className="h-3.5 w-3.5" /> R&P</TabsTrigger>
            <TabsTrigger value="journal-audit" className="gap-1.5 text-xs"><ClipboardList className="h-3.5 w-3.5" /> Audit</TabsTrigger>
            <TabsTrigger value="itc-report" className="gap-1.5 text-xs"><Receipt className="h-3.5 w-3.5" /> ITC</TabsTrigger>
            <TabsTrigger value="rcm-report" className="gap-1.5 text-xs"><ArrowLeftRight className="h-3.5 w-3.5" /> RCM</TabsTrigger>
            <TabsTrigger value="gst-summary" className="gap-1.5 text-xs"><BarChart3 className="h-3.5 w-3.5" /> GST</TabsTrigger>
          </TabsList>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            MIS REPORT
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="mis" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> MIS Report — Month-on-Month Comparison</CardTitle>
                  <CardDescription className="text-xs mt-1">{lastMonth.label} vs {thisMonth.label}</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={handleMisAiAnalysis} disabled={misAiLoading || !thisMonthData || !lastMonthData} className="gap-1.5">
                  {misAiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                  AI Insights
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {thisMonthData && lastMonthData ? (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Revenue</p>
                      <p className="text-lg font-bold">{fmtINR(thisMonthData.revenue)}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">vs {fmtINR(lastMonthData.revenue)}</span>
                        <ChangeIndicator current={thisMonthData.revenue} previous={lastMonthData.revenue} />
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Expenses</p>
                      <p className="text-lg font-bold">{fmtINR(thisMonthData.expense)}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">vs {fmtINR(lastMonthData.expense)}</span>
                        <ChangeIndicator current={thisMonthData.expense} previous={lastMonthData.expense} />
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Profit</p>
                      <p className={`text-lg font-bold ${thisMonthData.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtINR(thisMonthData.profit)}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">vs {fmtINR(lastMonthData.profit)}</span>
                        <ChangeIndicator current={thisMonthData.profit} previous={lastMonthData.profit} />
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Journal Entries</p>
                      <p className="text-lg font-bold">Dr {fmtINR(thisMonthData.totalDebit)}</p>
                      <p className="text-sm text-muted-foreground">Cr {fmtINR(thisMonthData.totalCredit)}</p>
                    </div>
                  </div>

                  {/* Detailed comparison table */}
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="pl-4">Particulars</TableHead>
                          <TableHead className="text-right">{lastMonth.label}</TableHead>
                          <TableHead className="text-right">{thisMonth.label}</TableHead>
                          <TableHead className="text-right pr-4">Change</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { label: 'Revenue', last: lastMonthData.revenue, current: thisMonthData.revenue },
                          { label: 'Total Expenses', last: lastMonthData.expense, current: thisMonthData.expense },
                          { label: 'Net Profit / Loss', last: lastMonthData.profit, current: thisMonthData.profit },
                          { label: 'Total Debit', last: lastMonthData.totalDebit, current: thisMonthData.totalDebit },
                          { label: 'Total Credit', last: lastMonthData.totalCredit, current: thisMonthData.totalCredit },
                          { label: 'Invoice Count', last: lastMonthData.invoiceCount, current: thisMonthData.invoiceCount },
                          { label: 'Expense Entries', last: lastMonthData.expenseCount, current: thisMonthData.expenseCount },
                        ].map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="pl-4 font-medium">{row.label}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{typeof row.last === 'number' && row.last > 999 ? fmtINR(row.last) : row.last}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{typeof row.current === 'number' && row.current > 999 ? fmtINR(row.current) : row.current}</TableCell>
                            <TableCell className="text-right pr-4"><ChangeIndicator current={row.current} previous={row.last} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Expense category breakdown */}
                  {Object.keys(thisMonthData.expByCategory).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Expense Category Breakdown</h4>
                      <div className="overflow-auto">
                        <Table>
                          <TableHeader className="bg-muted/40">
                            <TableRow>
                              <TableHead className="pl-4">Category</TableHead>
                              <TableHead className="text-right">{lastMonth.label}</TableHead>
                              <TableHead className="text-right">{thisMonth.label}</TableHead>
                              <TableHead className="text-right pr-4">Change</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.keys({ ...lastMonthData.expByCategory, ...thisMonthData.expByCategory }).map(cat => (
                              <TableRow key={cat}>
                                <TableCell className="pl-4">{cat}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{fmtINR(lastMonthData.expByCategory[cat] || 0)}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{fmtINR(thisMonthData.expByCategory[cat] || 0)}</TableCell>
                                <TableCell className="text-right pr-4"><ChangeIndicator current={thisMonthData.expByCategory[cat] || 0} previous={lastMonthData.expByCategory[cat] || 0} /></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {/* AI Insights */}
                  {misAiReason && (
                    <Card className="border-primary/20 bg-primary/5">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="text-sm font-semibold">AI Analysis</span>
                        </div>
                        <div className="text-sm whitespace-pre-wrap leading-relaxed">{misAiReason}</div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  <p className="text-sm">Loading MIS data...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            DETAILED P&L BREAKDOWN
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="detailed-pnl" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" /> Detailed Profit & Loss Breakdown</CardTitle>
              <CardDescription className="text-xs">Complete account-wise income and expense analysis with GST & TDS</CardDescription>
            </CardHeader>
            <CardContent>
              {detailedPnL ? (
                <div className="space-y-6">
                  {/* Summary boxes */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <StatBox label="Gross Revenue" value={fmtINR(detailedPnL.invoiceRevenue)} icon={TrendingUp} color="emerald" />
                    <StatBox label="Total Expenses" value={fmtINR(detailedPnL.totalExpenseAmt)} icon={TrendingDown} color="rose" />
                    <StatBox label="Gross Profit" value={fmtINR(detailedPnL.grossProfit)} icon={Activity} color={detailedPnL.grossProfit >= 0 ? 'emerald' : 'rose'} />
                    <StatBox label="Tax (25%)" value={fmtINR(detailedPnL.taxExpense)} icon={Receipt} color="amber" />
                    <StatBox label="Net Profit" value={fmtINR(detailedPnL.netProfit)} icon={DollarSign} color={detailedPnL.netProfit >= 0 ? 'emerald' : 'rose'} />
                  </div>

                  {/* Revenue Section */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><TrendingUp className="h-4 w-4" /> Revenue</h4>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader className="bg-emerald-50/50 dark:bg-emerald-950/20">
                          <TableRow>
                            <TableHead className="pl-4">Particulars</TableHead>
                            <TableHead className="text-right pr-4">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="pl-4">Revenue from Operations (Invoices)</TableCell>
                            <TableCell className="text-right pr-4 font-mono font-semibold text-emerald-600">{fmtINR(detailedPnL.invoiceRevenue)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="pl-4 text-muted-foreground">GST Collected</TableCell>
                            <TableCell className="text-right pr-4 font-mono text-sm text-muted-foreground">{fmtINR(detailedPnL.invoiceGST)}</TableCell>
                          </TableRow>
                          {detailedPnL.journalIncome.map((item, i) => (
                            <TableRow key={i}>
                              <TableCell className="pl-4">{item.name}</TableCell>
                              <TableCell className="text-right pr-4 font-mono text-sm">{fmtINR(item.amount)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-emerald-50/30 dark:bg-emerald-950/10 font-bold">
                            <TableCell className="pl-4">Total Revenue</TableCell>
                            <TableCell className="text-right pr-4 font-mono">{fmtINR(detailedPnL.invoiceRevenue)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Expense Breakdown by Category */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-rose-700 dark:text-rose-400"><TrendingDown className="h-4 w-4" /> Expenses — Category-wise Breakdown</h4>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader className="bg-rose-50/50 dark:bg-rose-950/20">
                          <TableRow>
                            <TableHead className="pl-4">Category</TableHead>
                            <TableHead className="text-right">Entries</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">GST Input</TableHead>
                            <TableHead className="text-right pr-4">TDS</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(detailedPnL.expByCategory)
                            .sort(([, a], [, b]) => b.amount - a.amount)
                            .map(([cat, data], i) => (
                            <TableRow key={i}>
                              <TableCell className="pl-4">{cat}</TableCell>
                              <TableCell className="text-right"><Badge variant="secondary" className="text-xs">{data.count}</Badge></TableCell>
                              <TableCell className="text-right font-mono text-sm text-rose-600 dark:text-rose-400">{fmtINR(data.amount)}</TableCell>
                              <TableCell className="text-right font-mono text-xs text-muted-foreground">{data.gst > 0 ? fmtINR(data.gst) : '—'}</TableCell>
                              <TableCell className="text-right pr-4 font-mono text-xs text-muted-foreground">{data.tds > 0 ? fmtINR(data.tds) : '—'}</TableCell>
                            </TableRow>
                          ))}
                          {detailedPnL.journalExpense.map((item, i) => (
                            <TableRow key={`je-${i}`}>
                              <TableCell className="pl-4 text-muted-foreground">{item.name} (Journal)</TableCell>
                              <TableCell className="text-right">—</TableCell>
                              <TableCell className="text-right font-mono text-sm">{fmtINR(item.amount)}</TableCell>
                              <TableCell className="text-right">—</TableCell>
                              <TableCell className="text-right pr-4">—</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-rose-50/30 dark:bg-rose-950/10 font-bold">
                            <TableCell className="pl-4">Total Expenses</TableCell>
                            <TableCell className="text-right"></TableCell>
                            <TableCell className="text-right font-mono">{fmtINR(detailedPnL.totalExpenseAmt)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmtINR(detailedPnL.totalGSTInput)}</TableCell>
                            <TableCell className="text-right pr-4 font-mono text-xs">{fmtINR(detailedPnL.totalTDS)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* P&L Summary */}
                  <div className="rounded-xl bg-muted/50 p-4 space-y-2">
                    <div className="flex justify-between"><span>Revenue from Operations</span><span className="font-mono font-semibold text-emerald-600">{fmtINR(detailedPnL.invoiceRevenue)}</span></div>
                    <div className="flex justify-between"><span>Less: Total Expenses</span><span className="font-mono font-semibold text-rose-600">({fmtINR(detailedPnL.totalExpenseAmt)})</span></div>
                    <div className="flex justify-between border-t pt-2"><span className="font-semibold">Profit Before Tax</span><span className={`font-mono font-bold ${detailedPnL.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtINR(detailedPnL.grossProfit)}</span></div>
                    <div className="flex justify-between"><span>Less: Tax Expense (25%)</span><span className="font-mono text-sm">({fmtINR(detailedPnL.taxExpense)})</span></div>
                    <div className="flex justify-between border-t pt-2"><span className="font-bold text-lg">Net Profit After Tax</span><span className={`font-mono font-bold text-lg ${detailedPnL.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtINR(detailedPnL.netProfit)}</span></div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  <p className="text-sm">Loading P&L data...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            PERFORMANCE RATIOS
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="ratios" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><PieChart className="h-4 w-4 text-primary" /> Performance Ratios</CardTitle>
              <CardDescription className="text-xs">Key financial ratios calculated from your accounts, invoices, and expenses</CardDescription>
            </CardHeader>
            <CardContent>
              {ratioData ? (
                <div className="space-y-6">
                  {/* Key figures */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatBox label="Total Assets" value={fmtINR(ratioData.totalAssets)} icon={Building2} color="blue" />
                    <StatBox label="Cash & Bank" value={fmtINR(ratioData.cashBank)} icon={DollarSign} color="emerald" />
                    <StatBox label="Total Revenue" value={fmtINR(ratioData.totalRevenue)} icon={TrendingUp} color="emerald" />
                    <StatBox label="Net Profit" value={fmtINR(ratioData.netProfit)} icon={Activity} color={ratioData.netProfit >= 0 ? 'emerald' : 'rose'} />
                  </div>

                  {/* Ratio cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { title: 'Liquidity Ratios', items: [
                        { label: 'Current Ratio', value: ratioData.currentRatio.toFixed(2), benchmark: '> 1.5', good: ratioData.currentRatio >= 1.5, desc: 'Current Assets / Current Liabilities' },
                        { label: 'Quick Ratio', value: ratioData.quickRatio.toFixed(2), benchmark: '> 1.0', good: ratioData.quickRatio >= 1.0, desc: '(Current Assets - Inventory) / Current Liabilities' },
                        { label: 'Working Capital', value: fmtINR(ratioData.workingCapital), benchmark: '> 0', good: ratioData.workingCapital > 0, desc: 'Current Assets - Current Liabilities' },
                      ]},
                      { title: 'Profitability Ratios', items: [
                        { label: 'Gross Margin', value: pct(ratioData.grossMargin), benchmark: '> 20%', good: ratioData.grossMargin >= 20, desc: '(Revenue - Expenses) / Revenue' },
                        { label: 'Net Margin', value: pct(ratioData.netMargin), benchmark: '> 10%', good: ratioData.netMargin >= 10, desc: 'Net Profit / Revenue' },
                        { label: 'Return on Equity (ROE)', value: pct(ratioData.roe), benchmark: '> 15%', good: ratioData.roe >= 15, desc: 'Net Profit / Total Equity' },
                        { label: 'Return on Assets (ROA)', value: pct(ratioData.roa), benchmark: '> 5%', good: ratioData.roa >= 5, desc: 'Net Profit / Total Assets' },
                      ]},
                      { title: 'Efficiency Ratios', items: [
                        { label: 'Asset Turnover', value: ratioData.assetTurnover.toFixed(2) + 'x', benchmark: '> 1.0x', good: ratioData.assetTurnover >= 1, desc: 'Revenue / Total Assets' },
                        { label: 'Receivable Turnover', value: ratioData.receivableTurnover.toFixed(2) + 'x', benchmark: '> 5x', good: ratioData.receivableTurnover >= 5, desc: 'Revenue / Trade Receivables' },
                        { label: 'Inventory Turnover', value: ratioData.inventoryTurnover.toFixed(2) + 'x', benchmark: '> 4x', good: ratioData.inventoryTurnover >= 4, desc: 'Expenses / Inventory Value' },
                        { label: 'Debt to Equity', value: ratioData.debtToEquity.toFixed(2), benchmark: '< 2.0', good: ratioData.debtToEquity <= 2, desc: 'Total Liabilities / Total Equity' },
                      ]},
                    ].map((section, si) => (
                      <Card key={si} className="border">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-semibold">{section.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4 space-y-3">
                          {section.items.map((item, ii) => (
                            <div key={ii} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm">{item.label}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-semibold text-sm">{item.value}</span>
                                  <Badge variant="outline" className={`text-[10px] ${item.good ? 'text-emerald-600 border-emerald-300' : 'text-amber-600 border-amber-300'}`}>
                                    {item.benchmark}
                                  </Badge>
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  <p className="text-sm">Loading ratio data...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            CASH FLOW FORECASTING
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="cashflow" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /> Cash Flow Analysis & Forecasting</CardTitle>
              <CardDescription className="text-xs">6 months historical + 3 months forecast based on trends</CardDescription>
            </CardHeader>
            <CardContent>
              {cashFlowData ? (
                <div className="space-y-4">
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="pl-4">Month</TableHead>
                          <TableHead className="text-right">Inflow (Revenue)</TableHead>
                          <TableHead className="text-right">Outflow (Expenses)</TableHead>
                          <TableHead className="text-right">Net Cash Flow</TableHead>
                          <TableHead className="text-right pr-4">Cumulative</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cashFlowData.map((m, i) => {
                          const cumulative = cashFlowData.slice(0, i + 1).reduce((s, r) => s + r.net, 0);
                          const isForecast = m.label.includes('(F)');
                          return (
                            <TableRow key={i} className={isForecast ? 'bg-blue-50/30 dark:bg-blue-950/10' : ''}>
                              <TableCell className="pl-4">
                                <span className="font-medium">{m.label}</span>
                                {isForecast && <Badge variant="outline" className="ml-2 text-[9px] text-blue-600 border-blue-300">Forecast</Badge>}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-emerald-600">{fmtINR(m.inflow)}</TableCell>
                              <TableCell className="text-right font-mono text-sm text-rose-600">{fmtINR(m.outflow)}</TableCell>
                              <TableCell className={`text-right font-mono text-sm font-semibold ${m.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtINR(m.net)}</TableCell>
                              <TableCell className={`text-right pr-4 font-mono text-sm ${cumulative >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtINR(cumulative)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatBox label="Avg Monthly Inflow" value={fmtINR(cashFlowData.filter(m => !m.label.includes('(F)')).reduce((s, m) => s + m.inflow, 0) / 6)} icon={TrendingUp} color="emerald" />
                    <StatBox label="Avg Monthly Outflow" value={fmtINR(cashFlowData.filter(m => !m.label.includes('(F)')).reduce((s, m) => s + m.outflow, 0) / 6)} icon={TrendingDown} color="rose" />
                    <StatBox label="Net 6-Month Cash Flow" value={fmtINR(cashFlowData.filter(m => !m.label.includes('(F)')).reduce((s, m) => s + m.net, 0))} icon={Activity} color="blue" />
                    <StatBox label="3-Month Forecast Net" value={fmtINR(cashFlowData.filter(m => m.label.includes('(F)')).reduce((s, m) => s + m.net, 0))} icon={Sparkles} color="blue" />
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  <p className="text-sm">Loading cash flow data...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            INVENTORY AGEING
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="inv-ageing" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Boxes className="h-4 w-4 text-primary" /> Inventory Ageing Analysis</CardTitle>
              <CardDescription className="text-xs">How long stock items have been in inventory, by age bucket</CardDescription>
            </CardHeader>
            <CardContent>
              {inventoryData ? (
                inventoryData.length > 0 ? (
                  <div className="space-y-4">
                    {/* Bucket summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {ageingSummary.map((b, i) => (
                        <div key={i} className={`rounded-xl border p-4 ${i === 3 ? 'border-rose-200 bg-rose-50/30 dark:border-rose-800 dark:bg-rose-950/20' : i === 2 ? 'border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20' : ''}`}>
                          <p className="text-xs font-semibold text-muted-foreground">{b.label}</p>
                          <p className="text-lg font-bold mt-1">{b.count} items</p>
                          <p className="text-xs text-muted-foreground">{fmtINR(b.value)} value</p>
                        </div>
                      ))}
                    </div>

                    {/* Item list */}
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader className="bg-muted/40">
                          <TableRow>
                            <TableHead className="pl-4">Product</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit Cost</TableHead>
                            <TableHead className="text-right">Total Value</TableHead>
                            <TableHead className="text-right">Age (Days)</TableHead>
                            <TableHead className="pr-4">Bucket</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inventoryData.sort((a, b) => b.ageDays - a.ageDays).map((item, i) => (
                            <TableRow key={i} className={item.ageDays > 90 ? 'bg-rose-50/30 dark:bg-rose-950/10' : item.ageDays > 60 ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''}>
                              <TableCell className="pl-4 font-medium">{item.product_name}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{item.sku}</TableCell>
                              <TableCell className="text-right">{item.stock_quantity}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{fmtINR(Number(item.purchase_price || 0))}</TableCell>
                              <TableCell className="text-right font-mono text-sm font-semibold">{fmtINR(item.value)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{item.ageDays}</TableCell>
                              <TableCell className="pr-4">
                                <Badge variant="outline" className={`text-[10px] ${item.ageDays > 90 ? 'text-rose-600 border-rose-300' : item.ageDays > 60 ? 'text-amber-600 border-amber-300' : 'text-emerald-600 border-emerald-300'}`}>
                                  {item.bucket}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No inventory items found. Add goods items in Inventory page first.</p>
                  </div>
                )
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  <p className="text-sm">Loading inventory data...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            STOCK MOVEMENT
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="stock" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><MoveHorizontal className="h-4 w-4 text-primary" /> Stock Movement Report</CardTitle>
              <CardDescription className="text-xs">Inward (purchases) and outward (sales) stock movement with current stock levels</CardDescription>
            </CardHeader>
            <CardContent>
              {stockMovement ? (
                <div className="space-y-6">
                  {/* Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatBox label="Total Purchases" value={fmtINR(stockMovement.purchases.reduce((s, p) => s + p.amount, 0))} sub={`${stockMovement.purchases.length} entries`} icon={ArrowUpDown} color="blue" />
                    <StatBox label="Total Sales" value={fmtINR(stockMovement.sales.reduce((s, p) => s + p.amount, 0))} sub={`${stockMovement.sales.length} entries`} icon={ArrowUpDown} color="emerald" />
                    <StatBox label="Stock Items" value={String(stockMovement.inventory.length)} sub="Goods only" icon={Package} color="amber" />
                    <StatBox label="Stock Value" value={fmtINR(stockMovement.inventory.reduce((s, i) => s + (Number(i.stock_quantity || 0) * Number(i.purchase_price || 0)), 0))} icon={DollarSign} color="blue" />
                  </div>

                  {/* Current Stock Levels */}
                  {stockMovement.inventory.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Current Stock Levels</h4>
                      <div className="overflow-auto">
                        <Table>
                          <TableHeader className="bg-muted/40">
                            <TableRow>
                              <TableHead className="pl-4">Product</TableHead>
                              <TableHead>SKU</TableHead>
                              <TableHead className="text-right">Stock Qty</TableHead>
                              <TableHead className="text-right">Purchase Price</TableHead>
                              <TableHead className="text-right">Selling Price</TableHead>
                              <TableHead className="text-right">Stock Value</TableHead>
                              <TableHead className="text-right pr-4">Reorder Level</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stockMovement.inventory.map((item, i) => {
                              const qty = Number(item.stock_quantity || 0);
                              const reorder = Number(item.reorder_level || 0);
                              const isLow = qty <= reorder && reorder > 0;
                              return (
                                <TableRow key={i} className={isLow ? 'bg-rose-50/30 dark:bg-rose-950/10' : ''}>
                                  <TableCell className="pl-4 font-medium">{item.product_name}</TableCell>
                                  <TableCell className="font-mono text-xs text-muted-foreground">{item.sku}</TableCell>
                                  <TableCell className="text-right">
                                    <span className={isLow ? 'text-rose-600 font-semibold' : ''}>{qty}</span>
                                    {isLow && <Badge variant="outline" className="ml-1 text-[9px] text-rose-600 border-rose-300">Low</Badge>}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm">{fmtINR(Number(item.purchase_price || 0))}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">{fmtINR(Number(item.selling_price || 0))}</TableCell>
                                  <TableCell className="text-right font-mono text-sm font-semibold">{fmtINR(qty * Number(item.purchase_price || 0))}</TableCell>
                                  <TableCell className="text-right pr-4">{reorder || '—'}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {/* Recent Movements */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Recent Stock Movement (Purchases & Sales)</h4>
                    <div className="overflow-auto max-h-[400px]">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm">
                          <TableRow className="bg-muted/40">
                            <TableHead className="pl-4">Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Party</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="pr-4">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...stockMovement.purchases.map(p => ({ ...p })), ...stockMovement.sales.map(s => ({ ...s }))]
                            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                            .slice(0, 30)
                            .map((item, i) => (
                            <TableRow key={i}>
                              <TableCell className="pl-4 font-mono text-xs">{item.date || '—'}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] gap-1 ${item.type === 'inward' ? 'text-blue-600 border-blue-300' : 'text-emerald-600 border-emerald-300'}`}>
                                  {item.type === 'inward' ? 'Purchase' : 'Sale'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">{item.party || '—'}</TableCell>
                              <TableCell className="text-right font-mono text-sm font-semibold">{fmtINR(item.amount)}</TableCell>
                              <TableCell className="pr-4"><Badge variant="secondary" className="text-[10px]">{item.status || '—'}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  <p className="text-sm">Loading stock data...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            EXISTING TABS (Setup, P&L, Sch III, Balance, Trial Bal, I&E, R&P, Audit, ITC, RCM, GST)
        ═══════════════════════════════════════════════════════════════════ */}

        {/* Setup */}
        <TabsContent value="setup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Company Details & Financial Year</CardTitle>
              <CardDescription>Enter your company information for the financial statements header</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="companyName">Company Name *</Label><Input id="companyName" value={companyDetails.companyName} onChange={e => setCompanyDetails(p => ({ ...p, companyName: e.target.value }))} placeholder="Company Name" /></div>
                <div className="space-y-2"><Label htmlFor="cin">CIN Number</Label><Input id="cin" value={companyDetails.cin} onChange={e => setCompanyDetails(p => ({ ...p, cin: e.target.value }))} placeholder="U62013TS2024PTC184046" /></div>
                <div className="space-y-2"><Label htmlFor="pan">PAN Number</Label><Input id="pan" value={companyDetails.pan} onChange={e => setCompanyDetails(p => ({ ...p, pan: e.target.value }))} placeholder="ABACA4623P" /></div>
                <div className="space-y-2"><Label htmlFor="dateOfIncorporation">Date of Incorporation</Label><Input id="dateOfIncorporation" type="date" value={companyDetails.dateOfIncorporation} onChange={e => setCompanyDetails(p => ({ ...p, dateOfIncorporation: e.target.value }))} /></div>
                <div className="md:col-span-2 space-y-2"><Label htmlFor="address">Registered Address</Label><Input id="address" value={companyDetails.address} onChange={e => setCompanyDetails(p => ({ ...p, address: e.target.value }))} /></div>
              </div>
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold mb-3">Director Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Director Name *</Label><Input value={companyDetails.ownerName} onChange={e => setCompanyDetails(p => ({ ...p, ownerName: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Director DIN</Label><Input value={companyDetails.directorDIN} onChange={e => setCompanyDetails(p => ({ ...p, directorDIN: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Second Director Name</Label><Input value={companyDetails.secondDirectorName} onChange={e => setCompanyDetails(p => ({ ...p, secondDirectorName: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Second Director DIN</Label><Input value={companyDetails.secondDirectorDIN} onChange={e => setCompanyDetails(p => ({ ...p, secondDirectorDIN: e.target.value }))} /></div>
                </div>
              </div>
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold mb-3">Financial Year</h3>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 space-y-2">
                    <Label>Select Financial Year</Label>
                    <Select value={financialYear} onValueChange={setFinancialYear}>
                      <SelectTrigger><SelectValue placeholder="Select FY" /></SelectTrigger>
                      <SelectContent>{fyOptions.map(fy => <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleFetchData} disabled={loading || !financialYear}>
                      {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...</> : <><FileSpreadsheet className="mr-2 h-4 w-4" /> Fetch Financial Data</>}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* P&L */}
        <TabsContent value="pnl" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Profit & Loss Statement</CardTitle><CardDescription>Statutory P&L for the financial year</CardDescription></CardHeader>
            <CardContent>
              {financialData ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b"><th className="text-left py-2 px-3">Sr.No</th><th className="text-left py-2 px-3">Particulars</th><th className="text-center py-2 px-3">Note</th><th className="text-right py-2 px-3">FY {financialYear}</th></tr></thead>
                      <tbody>
                        <tr className="border-b"><td className="py-2 px-3">I</td><td className="py-2 px-3">Revenue from Operations</td><td className="text-center py-2 px-3">5</td><td className="text-right py-2 px-3">{formatCurrency(financialData.revenueFromOperations)}</td></tr>
                        <tr className="border-b"><td className="py-2 px-3">II</td><td className="py-2 px-3">Other Income</td><td className="text-center py-2 px-3">6</td><td className="text-right py-2 px-3">{formatCurrency(financialData.otherIncome)}</td></tr>
                        <tr className="border-b bg-muted/30"><td className="py-2 px-3">III</td><td className="py-2 px-3 font-semibold">Total Revenue (I+II)</td><td></td><td className="text-right py-2 px-3 font-semibold">{formatCurrency(financialData.totalRevenue)}</td></tr>
                        <tr className="border-b"><td className="py-2 px-3">IV</td><td className="py-2 px-3 font-semibold">Expenses:</td><td></td><td></td></tr>
                        <tr className="border-b"><td></td><td className="py-2 px-3 pl-6">Employee Benefit Expense</td><td></td><td className="text-right py-2 px-3">{formatCurrency(financialData.employeeBenefitExpense)}</td></tr>
                        <tr className="border-b"><td></td><td className="py-2 px-3 pl-6">Financial Costs</td><td></td><td className="text-right py-2 px-3">{formatCurrency(financialData.financialCosts)}</td></tr>
                        <tr className="border-b"><td></td><td className="py-2 px-3 pl-6">Depreciation</td><td></td><td className="text-right py-2 px-3">{formatCurrency(financialData.depreciationExpense)}</td></tr>
                        <tr className="border-b"><td></td><td className="py-2 px-3 pl-6">Other Expenses</td><td className="text-center py-2 px-3">7</td><td className="text-right py-2 px-3">{formatCurrency(financialData.otherExpenses)}</td></tr>
                        <tr className="border-b bg-muted/30"><td></td><td className="py-2 px-3 font-semibold">Total Expenses (IV)</td><td></td><td className="text-right py-2 px-3 font-semibold">{formatCurrency(financialData.totalExpenses)}</td></tr>
                        <tr className="border-b"><td className="py-2 px-3">V</td><td className="py-2 px-3">Profit/(Loss) Before Tax</td><td></td><td className={`text-right py-2 px-3 font-semibold ${financialData.profitBeforeTax >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(financialData.profitBeforeTax)}</td></tr>
                        <tr className="border-b"><td className="py-2 px-3">VI</td><td className="py-2 px-3">Tax Expense</td><td></td><td className="text-right py-2 px-3">{formatCurrency(financialData.taxExpense)}</td></tr>
                        <tr className="bg-primary/10"><td className="py-2 px-3">VII</td><td className="py-2 px-3 font-bold">Profit/(Loss) for the Period</td><td></td><td className={`text-right py-2 px-3 font-bold ${financialData.profitAfterTax >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(financialData.profitAfterTax)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <Button onClick={handleGeneratePDF}><Download className="mr-2 h-4 w-4" /> Download Financial Statements PDF</Button>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground"><Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No data available. Go to Setup tab and fetch data first.</p></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sch3-pnl" className="space-y-4">
          <ScheduleIIIProfitLoss financialData={financialData} companyDetails={companyDetails} financialYear={financialYear || fyOptions[0]} formatCurrency={formatCurrency} />
        </TabsContent>

        <TabsContent value="balance" className="space-y-4">
          <ScheduleIIIBalanceSheet financialData={financialData} companyDetails={companyDetails} financialYear={financialYear || fyOptions[0]} formatCurrency={formatCurrency} />
        </TabsContent>

        {/* Trial Balance */}
        <TabsContent value="trial-balance" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Trial Balance</CardTitle><CardDescription>Opening, period, and closing balances from journal entries</CardDescription></CardHeader>
            <CardContent>
              {journalsLoading ? (
                <div className="text-center py-12"><Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin" /><p>Loading...</p></div>
              ) : trialBalanceData && trialBalanceData.accounts.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-muted/50"><th className="border p-2 text-left" rowSpan={2}>Account</th><th className="border p-2 text-center" colSpan={2}>Opening</th><th className="border p-2 text-center" colSpan={2}>During Period</th><th className="border p-2 text-center" colSpan={2}>Closing</th></tr>
                        <tr className="bg-muted/30"><th className="border p-2 text-right">Dr</th><th className="border p-2 text-right">Cr</th><th className="border p-2 text-right">Dr</th><th className="border p-2 text-right">Cr</th><th className="border p-2 text-right">Dr</th><th className="border p-2 text-right">Cr</th></tr>
                      </thead>
                      <tbody>
                        {trialBalanceData.accounts.map((acc, i) => (
                          <tr key={i} className="border-b hover:bg-muted/20">
                            <td className="border p-2">{acc.accountName}</td>
                            <td className="border p-2 text-right">{acc.openingDebit > 0 ? formatCurrency(acc.openingDebit) : '—'}</td>
                            <td className="border p-2 text-right">{acc.openingCredit > 0 ? formatCurrency(acc.openingCredit) : '—'}</td>
                            <td className="border p-2 text-right">{acc.periodDebit > 0 ? formatCurrency(acc.periodDebit) : '—'}</td>
                            <td className="border p-2 text-right">{acc.periodCredit > 0 ? formatCurrency(acc.periodCredit) : '—'}</td>
                            <td className="border p-2 text-right">{acc.closingDebit > 0 ? formatCurrency(acc.closingDebit) : '—'}</td>
                            <td className="border p-2 text-right">{acc.closingCredit > 0 ? formatCurrency(acc.closingCredit) : '—'}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/50 font-bold">
                          <td className="border p-2">TOTAL</td>
                          <td className="border p-2 text-right">{formatCurrency(trialBalanceData.totals.openingDebit)}</td>
                          <td className="border p-2 text-right">{formatCurrency(trialBalanceData.totals.openingCredit)}</td>
                          <td className="border p-2 text-right">{formatCurrency(trialBalanceData.totals.periodDebit)}</td>
                          <td className="border p-2 text-right">{formatCurrency(trialBalanceData.totals.periodCredit)}</td>
                          <td className="border p-2 text-right">{formatCurrency(trialBalanceData.totals.closingDebit)}</td>
                          <td className="border p-2 text-right">{formatCurrency(trialBalanceData.totals.closingCredit)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-4 items-center">
                    <Button onClick={() => handlePDF('tb')}><Download className="mr-2 h-4 w-4" /> Download Trial Balance PDF</Button>
                    <span className="text-sm">{trialBalanceData.totals.closingDebit === trialBalanceData.totals.closingCredit ? <span className="text-green-600">Trial Balance is balanced</span> : <span className="text-red-600">Difference: {formatCurrency(Math.abs(trialBalanceData.totals.closingDebit - trialBalanceData.totals.closingCredit))}</span>}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground"><Scale className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No journal entries found.</p></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Income & Expenditure */}
        <TabsContent value="income-expenditure" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Income & Expenditure Account</CardTitle><CardDescription>Statutory audit style statement from journals</CardDescription></CardHeader>
            <CardContent>
              {journalsLoading ? (
                <div className="text-center py-12"><Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin" /><p>Loading...</p></div>
              ) : incomeExpenditureData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-bold text-lg mb-4 border-b pb-2">EXPENDITURE</h3>
                      <div className="space-y-2">
                        {incomeExpenditureData.expenditure.map((item, i) => <div key={i} className="flex justify-between py-1"><span>{item.particulars}</span><span>{formatCurrency(item.amount)}</span></div>)}
                        {incomeExpenditureData.surplus > 0 && <div className="flex justify-between py-1 font-semibold text-green-600 border-t pt-2"><span>Surplus</span><span>{formatCurrency(incomeExpenditureData.surplus)}</span></div>}
                        <div className="flex justify-between py-2 font-bold border-t"><span>TOTAL</span><span>{formatCurrency(incomeExpenditureData.totalIncome)}</span></div>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg mb-4 border-b pb-2">INCOME</h3>
                      <div className="space-y-2">
                        {incomeExpenditureData.income.map((item, i) => <div key={i} className="flex justify-between py-1"><span>{item.particulars}</span><span>{formatCurrency(item.amount)}</span></div>)}
                        {incomeExpenditureData.surplus < 0 && <div className="flex justify-between py-1 font-semibold text-red-600 border-t pt-2"><span>Deficit</span><span>{formatCurrency(Math.abs(incomeExpenditureData.surplus))}</span></div>}
                        <div className="flex justify-between py-2 font-bold border-t"><span>TOTAL</span><span>{formatCurrency(incomeExpenditureData.totalIncome)}</span></div>
                      </div>
                    </div>
                  </div>
                  <Button onClick={() => handlePDF('ie')}><Download className="mr-2 h-4 w-4" /> Download I&E PDF</Button>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground"><ScrollText className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No journal entries found.</p></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Receipts & Payments */}
        <TabsContent value="receipts-payments" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Receipts & Payments Account</CardTitle><CardDescription>Cash-based statement for non-profit accounting</CardDescription></CardHeader>
            <CardContent>
              {journalsLoading ? (
                <div className="text-center py-12"><Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin" /><p>Loading...</p></div>
              ) : receiptsPaymentsData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-bold text-lg mb-4 border-b pb-2">RECEIPTS</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between py-1 font-semibold bg-muted/30 px-2 rounded"><span>Opening Balance</span><span>{formatCurrency(receiptsPaymentsData.openingBalance)}</span></div>
                        {receiptsPaymentsData.receipts.map((item, i) => <div key={i} className="flex justify-between py-1"><span>To {item.particulars}</span><span>{formatCurrency(item.amount)}</span></div>)}
                        <div className="flex justify-between py-2 font-bold border-t"><span>TOTAL</span><span>{formatCurrency(receiptsPaymentsData.openingBalance + receiptsPaymentsData.totalReceipts)}</span></div>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg mb-4 border-b pb-2">PAYMENTS</h3>
                      <div className="space-y-2">
                        {receiptsPaymentsData.payments.map((item, i) => <div key={i} className="flex justify-between py-1"><span>By {item.particulars}</span><span>{formatCurrency(item.amount)}</span></div>)}
                        <div className="flex justify-between py-1 font-semibold bg-muted/30 px-2 rounded"><span>Closing Balance</span><span>{formatCurrency(receiptsPaymentsData.closingBalance)}</span></div>
                        <div className="flex justify-between py-2 font-bold border-t"><span>TOTAL</span><span>{formatCurrency(receiptsPaymentsData.totalPayments + receiptsPaymentsData.closingBalance)}</span></div>
                      </div>
                    </div>
                  </div>
                  <Button onClick={() => handlePDF('rp')}><Download className="mr-2 h-4 w-4" /> Download R&P PDF</Button>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground"><Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No journal entries found.</p></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Journal Audit */}
        <TabsContent value="journal-audit" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Journal Audit Report</CardTitle><CardDescription>Detailed audit of all journal entries</CardDescription></CardHeader>
            <CardContent>
              {journalsLoading ? (
                <div className="text-center py-12"><Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin" /><p>Loading...</p></div>
              ) : journalsData && journalsData.journals.length > 0 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-muted/50 rounded-lg p-4 text-center"><p className="text-2xl font-bold">{journalsData.journals.length}</p><p className="text-sm text-muted-foreground">Total Entries</p></div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center"><p className="text-2xl font-bold text-green-600">{journalsData.journals.filter(j => j.status === 'posted').length}</p><p className="text-sm text-muted-foreground">Posted</p></div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center"><p className="text-2xl font-bold">{formatCurrency(journalsData.journals.reduce((s, j) => s + (Number(j.total_debit) || 0), 0))}</p><p className="text-sm text-muted-foreground">Total Debits</p></div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center"><p className="text-2xl font-bold">{formatCurrency(journalsData.journals.reduce((s, j) => s + (Number(j.total_credit) || 0), 0))}</p><p className="text-sm text-muted-foreground">Total Credits</p></div>
                  </div>
                  <Button onClick={() => handlePDF('audit')}><Download className="mr-2 h-4 w-4" /> Download Journal Audit PDF</Button>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground"><ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No journal entries found.</p></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="itc-report"><ITCReport /></TabsContent>
        <TabsContent value="rcm-report"><RCMLiabilityReport /></TabsContent>
        <TabsContent value="gst-summary"><GSTSummaryReport /></TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialStatements;
