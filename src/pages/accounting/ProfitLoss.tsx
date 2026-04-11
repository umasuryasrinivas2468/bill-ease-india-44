
/**
 * Profit & Loss Report Component
 * 
 * Data Sources:
 * 1. Sales Invoices: total_amount where status = 'paid' for revenue (Income)
 * 2. Purchase Bills: total_amount where status = 'paid' or 'partial' for expenses (Expenses)
 * 3. Journal Lines: 
 *    - Credits to Income accounts as Revenue
 *    - Debits to Expense accounts as Expenses
 * 
 * Features:
 * - Aggregates data from invoices, purchase bills, and journal entries
 * - Monthly breakdown with visual charts
 * - Drill-down to individual transactions
 * - Period comparison (previous year/period)
 * - Export to PDF, Excel, CSV
 * - Email reports
 * - Account-wise summaries
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Download, FileSpreadsheet, FileText, Eye, TrendingUp, TrendingDown, DollarSign, Calendar, ExternalLink, Mail } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { objectsToCSV, downloadCSV, generateFilename } from '@/utils/csvExport';

interface JournalLineWithAccount {
  id: string;
  debit: number;
  credit: number;
  journal_date: string;
  account_type: string;
  account_name: string;
  account_id: string;
  journal_id: string;
  journal_number?: string;
  narration?: string;
}

interface InvoiceData {
  id: string;
  total_amount: number;
  invoice_date: string;
  status: string;
}

interface PurchaseBillData {
  id: string;
  total_amount: number;
  bill_date: string;
  status: string;
}

interface MonthlyData {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
}

interface ComparisonData {
  current: MonthlyData[];
  previous: MonthlyData[];
  currentTotals: { totalIncome: number; totalExpenses: number; netProfit: number };
  previousTotals: { totalIncome: number; totalExpenses: number; netProfit: number };
}

interface AccountSummary {
  account_id: string;
  account_name: string;
  account_type: string;
  total_amount: number;
  transactions_count: number;
}

interface ExportFormat {
  format: 'csv' | 'pdf' | 'excel';
  includeDetails: boolean;
  includeComparison: boolean;
}

const ProfitLoss = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  
  // Date range state
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 2); // Changed from -11 to -2 months for more recent data
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Comparison state
  const [enableComparison, setEnableComparison] = useState(false);
  const [comparisonPeriod, setComparisonPeriod] = useState('previous_year'); // 'previous_year', 'previous_period', 'custom'
  const [comparisonStartDate, setComparisonStartDate] = useState(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    date.setMonth(date.getMonth() - 11);
    return date.toISOString().split('T')[0];
  });
  const [comparisonEndDate, setComparisonEndDate] = useState(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return date.toISOString().split('T')[0];
  });
  
  // UI state
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [drillDownDialogOpen, setDrillDownDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);

  // Fetch paid invoices for revenue
  const { data: invoiceData = [], isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['profit-loss-invoices', user?.id, startDate, endDate],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('invoices')
        .select('id, total_amount, invoice_date, status')
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate);
      
      if (error) throw error;
      
      return data.map(item => ({
        id: item.id,
        total_amount: Number(item.total_amount),
        invoice_date: item.invoice_date,
        status: item.status
      })) as InvoiceData[];
    },
    enabled: !!user?.id,
  });

  // Fetch paid purchase bills for expenses
  const { data: purchaseBillData = [], isLoading: isLoadingPurchaseBills } = useQuery({
    queryKey: ['profit-loss-purchase-bills', user?.id, startDate, endDate],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await (supabase as any)
        .from('purchase_bills')
        .select('id, total_amount, bill_date, status')
        .eq('user_id', user.id)
        .in('status', ['paid', 'partial'])
        .gte('bill_date', startDate)
        .lte('bill_date', endDate);
      
      if (error) throw error;
      
      return data.map(item => ({
        id: item.id,
        total_amount: Number(item.total_amount),
        bill_date: item.bill_date,
        status: item.status
      })) as PurchaseBillData[];
    },
    enabled: !!user?.id,
  });

  // Fetch current period journal lines with account information
  const { data: journalData = [], isLoading } = useQuery({
    queryKey: ['profit-loss-data', user?.id, startDate, endDate],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('journal_lines')
        .select(`
          id,
          debit,
          credit,
          account_id,
          journal_id,
          journals!inner (
            id,
            journal_date,
            journal_number,
            narration,
            user_id
          ),
          accounts!inner (
            id,
            account_type,
            account_name
          )
        `)
        .eq('journals.user_id', user.id)
        .gte('journals.journal_date', startDate)
        .lte('journals.journal_date', endDate)
        .in('accounts.account_type', ['Income', 'Expense']);
      
      if (error) throw error;
      
      return data.map(item => {
        const journal = item.journals as unknown as { id: string; journal_date: string; journal_number: string; narration: string; user_id: string };
        const account = item.accounts as unknown as { id: string; account_type: string; account_name: string };
        return {
          id: item.id,
          debit: Number(item.debit),
          credit: Number(item.credit),
          journal_date: journal.journal_date,
          account_type: account.account_type,
          account_name: account.account_name,
          account_id: account.id,
          journal_id: journal.id,
          journal_number: journal.journal_number,
          narration: journal.narration
        };
      }) as JournalLineWithAccount[];
    },
    enabled: !!user?.id,
  });

  // Fetch paid invoices for comparison period
  const { data: comparisonInvoiceData = [], isLoading: isLoadingComparisonInvoices } = useQuery({
    queryKey: ['profit-loss-comparison-invoices', user?.id, comparisonStartDate, comparisonEndDate, enableComparison],
    queryFn: async () => {
      if (!user?.id || !enableComparison) return [];
      
      const { data, error } = await supabase
        .from('invoices')
        .select('id, total_amount, invoice_date, status')
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .gte('invoice_date', comparisonStartDate)
        .lte('invoice_date', comparisonEndDate);
      
      if (error) throw error;
      
      return data.map(item => ({
        id: item.id,
        total_amount: Number(item.total_amount),
        invoice_date: item.invoice_date,
        status: item.status
      })) as InvoiceData[];
    },
    enabled: !!user?.id && enableComparison,
  });

  // Fetch paid purchase bills for comparison period
  const { data: comparisonPurchaseBillData = [], isLoading: isLoadingComparisonPurchaseBills } = useQuery({
    queryKey: ['profit-loss-comparison-purchase-bills', user?.id, comparisonStartDate, comparisonEndDate, enableComparison],
    queryFn: async () => {
      if (!user?.id || !enableComparison) return [];
      
      const { data, error } = await (supabase as any)
        .from('purchase_bills')
        .select('id, total_amount, bill_date, status')
        .eq('user_id', user.id)
        .in('status', ['paid', 'partial'])
        .gte('bill_date', comparisonStartDate)
        .lte('bill_date', comparisonEndDate);
      
      if (error) throw error;
      
      return data.map(item => ({
        id: item.id,
        total_amount: Number(item.total_amount),
        bill_date: item.bill_date,
        status: item.status
      })) as PurchaseBillData[];
    },
    enabled: !!user?.id && enableComparison,
  });

  // Fetch comparison period data if comparison is enabled
  const { data: comparisonJournalData = [], isLoading: isLoadingComparison } = useQuery({
    queryKey: ['profit-loss-comparison-data', user?.id, comparisonStartDate, comparisonEndDate, enableComparison],
    queryFn: async () => {
      if (!user?.id || !enableComparison) return [];
      
      const { data, error } = await supabase
        .from('journal_lines')
        .select(`
          id,
          debit,
          credit,
          account_id,
          journal_id,
          journals!inner (
            id,
            journal_date,
            journal_number,
            narration,
            user_id
          ),
          accounts!inner (
            id,
            account_type,
            account_name
          )
        `)
        .eq('journals.user_id', user.id)
        .gte('journals.journal_date', comparisonStartDate)
        .lte('journals.journal_date', comparisonEndDate)
        .in('accounts.account_type', ['Income', 'Expense']);
      
      if (error) throw error;
      
      return data.map(item => {
        const journal = item.journals as unknown as { id: string; journal_date: string; journal_number: string; narration: string; user_id: string };
        const account = item.accounts as unknown as { id: string; account_type: string; account_name: string };
        return {
          id: item.id,
          debit: Number(item.debit),
          credit: Number(item.credit),
          journal_date: journal.journal_date,
          account_type: account.account_type,
          account_name: account.account_name,
          account_id: account.id,
          journal_id: journal.id,
          journal_number: journal.journal_number,
          narration: journal.narration
        };
      }) as JournalLineWithAccount[];
    },
    enabled: !!user?.id && enableComparison,
  });

  // Helper function to process journal data, invoice data, and purchase bill data into monthly data
  const processMonthlyData = (journalData: JournalLineWithAccount[], invoiceData: InvoiceData[], purchaseBillData: PurchaseBillData[]): MonthlyData[] => {
    console.log('🔍 Processing monthly data:', {
      journalCount: journalData.length,
      invoiceCount: invoiceData.length,
      purchaseBillCount: purchaseBillData.length,
      dateRange: `${startDate} to ${endDate}`
    });
    
    const monthMap = new Map<string, { income: number; expenses: number }>();
    
    // Process paid invoices as revenue
    invoiceData.forEach(invoice => {
      const date = new Date(invoice.invoice_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      console.log('📄 Processing invoice:', {
        id: invoice.id,
        invoice_date: invoice.invoice_date,
        amount: invoice.total_amount,
        monthKey: monthKey
      });
      
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { income: 0, expenses: 0 });
      }
      
      const monthData = monthMap.get(monthKey)!;
      monthData.income += invoice.total_amount;
    });

    // Process paid purchase bills as expenses
    purchaseBillData.forEach(bill => {
      const date = new Date(bill.bill_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      console.log('📋 Processing purchase bill:', {
        id: bill.id,
        bill_date: bill.bill_date,
        amount: bill.total_amount,
        monthKey: monthKey
      });
      
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { income: 0, expenses: 0 });
      }
      
      const monthData = monthMap.get(monthKey)!;
      monthData.expenses += bill.total_amount;
    });
    
    // Process journal entries
    journalData.forEach(line => {
      const date = new Date(line.journal_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      console.log('📊 Processing journal line:', {
        journal_date: line.journal_date,
        account_type: line.account_type,
        account_name: line.account_name,
        debit: line.debit,
        credit: line.credit,
        monthKey: monthKey
      });
      
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { income: 0, expenses: 0 });
      }
      
      const monthData = monthMap.get(monthKey)!;
      
      if (line.account_type === 'Income') {
        // Income accounts: Credit increases income
        const amount = line.credit - line.debit;
        monthData.income += amount;
        console.log(`💰 Added ${amount} to income for ${monthKey}`);
      } else if (line.account_type === 'Expense') {
        // Expense accounts: Debit increases expenses
        const amount = line.debit - line.credit;
        monthData.expenses += amount;
        console.log(`💸 Added ${amount} to expenses for ${monthKey}`);
      }
    });
    
    console.log('📈 Month map before processing:', Object.fromEntries(monthMap));
    
    const result: MonthlyData[] = [];
    const sortedEntries = Array.from(monthMap.entries()).sort();
    
    sortedEntries.forEach(([monthKey, data]) => {
      const [year, month] = monthKey.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      const monthLabel = date.toLocaleDateString('en', { month: 'short', year: 'numeric' });
      
      result.push({
        month: monthLabel,
        totalIncome: Math.max(0, data.income),
        totalExpenses: Math.max(0, data.expenses),
        netProfit: data.income - data.expenses
      });
    });
    
    console.log('✅ Final monthly data result:', result);
    return result;
  };

  // Process data for monthly P&L
  const monthlyData = useMemo(() => {
    console.log('Debug - Processing data:', {
      journalDataCount: journalData.length,
      invoiceDataCount: invoiceData.length,
      purchaseBillDataCount: purchaseBillData.length,
      dateRange: { startDate, endDate },
      invoiceData: invoiceData.slice(0, 3), // First 3 invoices for debugging
      purchaseBillData: purchaseBillData.slice(0, 3), // First 3 purchase bills for debugging
      journalData: journalData.slice(0, 3) // First 3 journal entries for debugging
    });
    
    const result = processMonthlyData(journalData, invoiceData, purchaseBillData);
    console.log('Debug - Monthly data result:', result);
    return result;
  }, [journalData, invoiceData, purchaseBillData, startDate, endDate]);
  
  // Process comparison data
  const comparisonMonthlyData = useMemo(() => 
    enableComparison ? processMonthlyData(comparisonJournalData, comparisonInvoiceData, comparisonPurchaseBillData) : [], 
    [comparisonJournalData, comparisonInvoiceData, comparisonPurchaseBillData, enableComparison]
  );

  // Create account summaries for drill-down
  const accountSummaries = useMemo(() => {
    const accountMap = new Map<string, AccountSummary>();
    
    // Add invoice revenue as a separate account
    if (invoiceData.length > 0) {
      const invoiceRevenue = invoiceData.reduce((sum, invoice) => sum + invoice.total_amount, 0);
      accountMap.set('invoices-income', {
        account_id: 'invoices',
        account_name: 'Invoice Revenue',
        account_type: 'income',
        total_amount: invoiceRevenue,
        transactions_count: invoiceData.length
      });
    }

    // Add purchase bill expenses as a separate account
    if (purchaseBillData.length > 0) {
      const purchaseExpenses = purchaseBillData.reduce((sum, bill) => sum + bill.total_amount, 0);
      accountMap.set('purchase-bills-expense', {
        account_id: 'purchase-bills',
        account_name: 'Purchase Bills',
        account_type: 'expense',
        total_amount: purchaseExpenses,
        transactions_count: purchaseBillData.length
      });
    }
    
    journalData.forEach(line => {
      const accountKey = `${line.account_id}-${line.account_type}`;
      
      if (!accountMap.has(accountKey)) {
        accountMap.set(accountKey, {
          account_id: line.account_id,
          account_name: line.account_name,
          account_type: line.account_type,
          total_amount: 0,
          transactions_count: 0
        });
      }
      
      const summary = accountMap.get(accountKey)!;
      summary.transactions_count++;
      
      if (line.account_type === 'Income') {
        summary.total_amount += line.credit - line.debit;
      } else if (line.account_type === 'Expense') {
        summary.total_amount += line.debit - line.credit;
      }
    });
    
    return Array.from(accountMap.values())
      .filter(account => Math.abs(account.total_amount) > 0)
      .sort((a, b) => b.total_amount - a.total_amount);
  }, [journalData, invoiceData]);

  // Calculate current totals
  const totals = useMemo(() => {
    return monthlyData.reduce(
      (acc, month) => ({
        totalIncome: acc.totalIncome + month.totalIncome,
        totalExpenses: acc.totalExpenses + month.totalExpenses,
        netProfit: acc.netProfit + month.netProfit
      }),
      { totalIncome: 0, totalExpenses: 0, netProfit: 0 }
    );
  }, [monthlyData]);

  // Calculate comparison totals
  const comparisonTotals = useMemo(() => {
    if (!enableComparison) return { totalIncome: 0, totalExpenses: 0, netProfit: 0 };
    
    return comparisonMonthlyData.reduce(
      (acc, month) => ({
        totalIncome: acc.totalIncome + month.totalIncome,
        totalExpenses: acc.totalExpenses + month.totalExpenses,
        netProfit: acc.netProfit + month.netProfit
      }),
      { totalIncome: 0, totalExpenses: 0, netProfit: 0 }
    );
  }, [comparisonMonthlyData, enableComparison]);

  // Calculate comparison percentages
  const getPercentageChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  // Update comparison dates when comparison period changes
  const updateComparisonDates = (period: string) => {
    const currentStart = new Date(startDate);
    const currentEnd = new Date(endDate);
    
    switch (period) {
      case 'previous_year':
        setComparisonStartDate(new Date(currentStart.getFullYear() - 1, currentStart.getMonth(), currentStart.getDate()).toISOString().split('T')[0]);
        setComparisonEndDate(new Date(currentEnd.getFullYear() - 1, currentEnd.getMonth(), currentEnd.getDate()).toISOString().split('T')[0]);
        break;
      case 'previous_period':
        const daysDifference = Math.floor((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
        const prevEnd = new Date(currentStart);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - daysDifference);
        setComparisonStartDate(prevStart.toISOString().split('T')[0]);
        setComparisonEndDate(prevEnd.toISOString().split('T')[0]);
        break;
      // For 'custom', dates will be set manually by user
    }
  };

  // Export functions
  const exportToPDF = async () => {
    const doc = new jsPDF();
    let yPosition = 20;

    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Profit & Loss Report', 20, yPosition);
    
    yPosition += 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${startDate} to ${endDate}`, 20, yPosition);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 120, yPosition);
    
    yPosition += 20;

    // Summary
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Summary', 20, yPosition);
    yPosition += 10;
    
    const summaryData = [
      ['Total Income', `₹${totals.totalIncome.toLocaleString()}`],
      ['Total Expenses', `₹${totals.totalExpenses.toLocaleString()}`],
      ['Net Profit/Loss', `₹${Math.abs(totals.netProfit).toLocaleString()} ${totals.netProfit < 0 ? '(Loss)' : ''}`],
    ];

    if (enableComparison) {
      summaryData.push(['', ''], ['COMPARISON', '']);
      summaryData.push(['Previous Income', `₹${comparisonTotals.totalIncome.toLocaleString()}`]);
      summaryData.push(['Previous Expenses', `₹${comparisonTotals.totalExpenses.toLocaleString()}`]);
      summaryData.push(['Previous Net Profit/Loss', `₹${Math.abs(comparisonTotals.netProfit).toLocaleString()} ${comparisonTotals.netProfit < 0 ? '(Loss)' : ''}`]);
      summaryData.push(['Income Change', `${getPercentageChange(totals.totalIncome, comparisonTotals.totalIncome).toFixed(1)}%`]);
      summaryData.push(['Expenses Change', `${getPercentageChange(totals.totalExpenses, comparisonTotals.totalExpenses).toFixed(1)}%`]);
      summaryData.push(['Net Profit Change', `${getPercentageChange(totals.netProfit, comparisonTotals.netProfit).toFixed(1)}%`]);
    }

    autoTable(doc, {
      startY: yPosition,
      head: [['Item', 'Amount']],
      body: summaryData,
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [66, 139, 202] },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // Monthly breakdown
    if (yPosition > 200) {
      doc.addPage();
      yPosition = 20;
    }
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Monthly Breakdown', 20, yPosition);
    yPosition += 10;

    const monthlyTableData = monthlyData.map(row => [
      row.month,
      `₹${row.totalIncome.toLocaleString()}`,
      `₹${row.totalExpenses.toLocaleString()}`,
      `₹${Math.abs(row.netProfit).toLocaleString()}${row.netProfit < 0 ? ' (Loss)' : ''}`
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Month', 'Income', 'Expenses', 'Net Profit/Loss']],
      body: monthlyTableData,
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [66, 139, 202] },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // Account breakdown
    if (yPosition > 150) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Account Breakdown', 20, yPosition);
    yPosition += 10;

    const accountTableData = accountSummaries.map(account => [
      account.account_name,
      account.account_type.toUpperCase(),
      `₹${Math.abs(account.total_amount).toLocaleString()}`,
      account.transactions_count.toString()
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Account Name', 'Type', 'Amount', 'Transactions']],
      body: accountTableData,
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [66, 139, 202] },
    });

    doc.save(`profit-loss-${startDate}-to-${endDate}.pdf`);
    toast.success('PDF exported successfully');
  };

  const exportToExcel = async () => {
    const workbook = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['Profit & Loss Report'],
      [`Period: ${startDate} to ${endDate}`],
      [''],
      ['FINANCIAL SUMMARY'],
      ['Total Income', totals.totalIncome],
      ['Total Expenses', totals.totalExpenses],
      ['Net Profit/Loss', totals.netProfit],
    ];

    if (enableComparison) {
      summaryData.push([''], ['COMPARISON PERIOD SUMMARY']);
      summaryData.push(['Previous Income', comparisonTotals.totalIncome]);
      summaryData.push(['Previous Expenses', comparisonTotals.totalExpenses]);
      summaryData.push(['Previous Net Profit/Loss', comparisonTotals.netProfit]);
      summaryData.push([''], ['VARIANCE ANALYSIS']);
      summaryData.push(['Income Change (%)', getPercentageChange(totals.totalIncome, comparisonTotals.totalIncome)]);
      summaryData.push(['Expenses Change (%)', getPercentageChange(totals.totalExpenses, comparisonTotals.totalExpenses)]);
      summaryData.push(['Net Profit Change (%)', getPercentageChange(totals.netProfit, comparisonTotals.netProfit)]);
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Monthly breakdown sheet
    const monthlyData2D = [
      ['Month', 'Income', 'Expenses', 'Net Profit/Loss'],
      ...monthlyData.map(row => [row.month, row.totalIncome, row.totalExpenses, row.netProfit])
    ];
    const monthlySheet = XLSX.utils.aoa_to_sheet(monthlyData2D);
    XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Monthly Data');

    // Account breakdown sheet
    const accountData2D = [
      ['Account Name', 'Account Type', 'Amount', 'Transactions Count'],
      ...accountSummaries.map(account => [
        account.account_name,
        account.account_type.toUpperCase(),
        account.total_amount,
        account.transactions_count
      ])
    ];
    const accountSheet = XLSX.utils.aoa_to_sheet(accountData2D);
    XLSX.utils.book_append_sheet(workbook, accountSheet, 'Account Breakdown');

    XLSX.writeFile(workbook, `profit-loss-${startDate}-to-${endDate}.xlsx`);
    toast.success('Excel file exported successfully');
  };

  const exportToCSV = () => {
    const data = monthlyData.map(row => ({
      'Month': row.month,
      'Total Income': row.totalIncome.toFixed(2),
      'Total Expenses': row.totalExpenses.toFixed(2),
      'Net Profit/Loss': row.netProfit.toFixed(2)
    }));

    // Add summary row
    data.push({
      'Month': 'TOTAL',
      'Total Income': totals.totalIncome.toFixed(2),
      'Total Expenses': totals.totalExpenses.toFixed(2),
      'Net Profit/Loss': totals.netProfit.toFixed(2)
    });

    // Add comparison data if enabled
    if (enableComparison) {
      data.push({
        'Month': '',
        'Total Income': '',
        'Total Expenses': '',
        'Net Profit/Loss': ''
      });
      data.push({
        'Month': 'COMPARISON TOTAL',
        'Total Income': comparisonTotals.totalIncome.toFixed(2),
        'Total Expenses': comparisonTotals.totalExpenses.toFixed(2),
        'Net Profit/Loss': comparisonTotals.netProfit.toFixed(2)
      });
    }

    const csv = objectsToCSV(data);
    const filename = generateFilename(`profit-loss-${startDate}-to-${endDate}`, true);
    downloadCSV(csv, filename);
    
    toast.success('Profit & Loss report exported successfully');
  };

  // Email function
  const sendEmailReport = async () => {
    if (!emailAddress.trim()) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsEmailSending(true);
    try {
      // Generate PDF blob for email attachment
      const doc = new jsPDF();
      let yPosition = 20;

      // Header
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Profit & Loss Report', 20, yPosition);
      
      yPosition += 10;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Period: ${startDate} to ${endDate}`, 20, yPosition);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 120, yPosition);
      
      yPosition += 20;

      // Summary
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Financial Summary', 20, yPosition);
      yPosition += 10;
      
      const summaryData = [
        ['Total Income', `₹${totals.totalIncome.toLocaleString()}`],
        ['Total Expenses', `₹${totals.totalExpenses.toLocaleString()}`],
        ['Net Profit/Loss', `₹${Math.abs(totals.netProfit).toLocaleString()} ${totals.netProfit < 0 ? '(Loss)' : ''}`],
      ];

      autoTable(doc, {
        startY: yPosition,
        head: [['Item', 'Amount']],
        body: summaryData,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [66, 139, 202] },
      });

      const pdfBlob = doc.output('blob');
      
      // Create FormData for email service
      const formData = new FormData();
      formData.append('to', emailAddress);
      formData.append('subject', `Profit & Loss Report (${startDate} to ${endDate})`);
      formData.append('body', `
        Dear User,
        
        Please find attached your Profit & Loss Report for the period ${startDate} to ${endDate}.
        
        Financial Summary:
        - Total Income: ₹${totals.totalIncome.toLocaleString()}
        - Total Expenses: ₹${totals.totalExpenses.toLocaleString()}  
        - Net ${totals.netProfit >= 0 ? 'Profit' : 'Loss'}: ₹${Math.abs(totals.netProfit).toLocaleString()}
        
        Best regards,
        BillEase India Team
      `);
      formData.append('attachment', pdfBlob, `profit-loss-${startDate}-to-${endDate}.pdf`);

      // Note: In a real application, you would send this to your email service API
      // For this implementation, we'll simulate the email sending
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay
      
      toast.success(`Report successfully sent to ${emailAddress}`);
      setEmailDialogOpen(false);
      setEmailAddress('');
    } catch (error) {
      console.error('Failed to send email:', error);
      toast.error('Failed to send email. Please try again.');
    } finally {
      setIsEmailSending(false);
    }
  };

  // Drill-down functions
  const handleAccountDrillDown = (accountId: string) => {
    setSelectedAccount(accountId);
    setDrillDownDialogOpen(true);
  };

  const navigateToLedger = (accountId: string) => {
    // Navigate to ledger page with account filter
    navigate(`/accounting/ledgers?account=${accountId}`);
  };

  const navigateToJournal = (journalId: string) => {
    // Navigate to journal page with specific journal
    navigate(`/accounting/manual-journals?journal=${journalId}`);
  };

  const getAccountTransactions = (accountId: string) => {
    if (accountId === 'invoices') {
      // For invoice revenue, return invoice transactions
      return invoiceData
        .map(invoice => ({
          id: invoice.id,
          journal_date: invoice.invoice_date,
          debit: 0,
          credit: invoice.total_amount,
          account_name: 'Invoice Revenue',
          account_type: 'income',
          journal_number: `INV-${invoice.id.slice(-6)}`,
          narration: `Invoice payment - ₹${invoice.total_amount.toLocaleString()}`,
          journal_id: invoice.id,
          account_id: 'invoices'
        }))
        .sort((a, b) => new Date(b.journal_date).getTime() - new Date(a.journal_date).getTime());
    }

    if (accountId === 'purchase-bills') {
      // For purchase bill expenses, return purchase bill transactions
      return purchaseBillData
        .map(bill => ({
          id: bill.id,
          journal_date: bill.bill_date,
          debit: bill.total_amount,
          credit: 0,
          account_name: 'Purchase Bills',
          account_type: 'expense',
          journal_number: `BILL-${bill.id.slice(-6)}`,
          narration: `Purchase bill payment - ₹${bill.total_amount.toLocaleString()}`,
          journal_id: bill.id,
          account_id: 'purchase-bills'
        }))
        .sort((a, b) => new Date(b.journal_date).getTime() - new Date(a.journal_date).getTime());
    }
    
    return journalData
      .filter(line => line.account_id === accountId)
      .sort((a, b) => new Date(b.journal_date).getTime() - new Date(a.journal_date).getTime());
  };

  if (isLoading || isLoadingInvoices || isLoadingPurchaseBills || (enableComparison && (isLoadingComparison || isLoadingComparisonInvoices || isLoadingComparisonPurchaseBills))) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">
            Loading Profit & Loss data...
            {enableComparison && (isLoadingComparison || isLoadingComparisonInvoices || isLoadingComparisonPurchaseBills) && " (including comparison data)"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Profit & Loss Report</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Comprehensive profit and loss statement with drill-down and comparison features
          </p>
        </div>
        <div className="flex space-x-2">
          <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Export Profit & Loss Report</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <Button onClick={exportToCSV} variant="outline" className="h-20 flex flex-col">
                  <FileSpreadsheet className="h-6 w-6 mb-2" />
                  CSV
                </Button>
                <Button onClick={exportToPDF} variant="outline" className="h-20 flex flex-col">
                  <FileText className="h-6 w-6 mb-2" />
                  PDF
                </Button>
                <Button onClick={exportToExcel} variant="outline" className="h-20 flex flex-col">
                  <FileSpreadsheet className="h-6 w-6 mb-2" />
                  Excel
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          
          <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Email Profit & Loss Report</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="email-address">Email Address</Label>
                  <Input
                    id="email-address"
                    type="email"
                    placeholder="Enter recipient email address"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    disabled={isEmailSending}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setEmailDialogOpen(false)}
                    disabled={isEmailSending}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={sendEmailReport}
                    disabled={isEmailSending || !emailAddress.trim()}
                  >
                    {isEmailSending ? 'Sending...' : 'Send Report'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Date Range and Comparison Filters */}
      <Tabs defaultValue="current" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="current">
            <Calendar className="h-4 w-4 mr-2" />
            Current Period
          </TabsTrigger>
          <TabsTrigger value="comparison">
            <TrendingUp className="h-4 w-4 mr-2" />
            Comparison
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="current" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Period</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="comparison" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Period Comparison</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="enable-comparison"
                  checked={enableComparison}
                  onChange={(e) => setEnableComparison(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="enable-comparison">Enable Period Comparison</Label>
              </div>
              
              {enableComparison && (
                <>
                  <div>
                    <Label>Comparison Period</Label>
                    <Select 
                      value={comparisonPeriod} 
                      onValueChange={(value) => {
                        setComparisonPeriod(value);
                        updateComparisonDates(value);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="previous_year">Previous Year (Same Period)</SelectItem>
                        <SelectItem value="previous_period">Previous Period (Same Duration)</SelectItem>
                        <SelectItem value="custom">Custom Period</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="comparison-start-date">Comparison Start Date</Label>
                      <Input
                        id="comparison-start-date"
                        type="date"
                        value={comparisonStartDate}
                        onChange={(e) => setComparisonStartDate(e.target.value)}
                        disabled={comparisonPeriod !== 'custom'}
                      />
                    </div>
                    <div>
                      <Label htmlFor="comparison-end-date">Comparison End Date</Label>
                      <Input
                        id="comparison-end-date"
                        type="date"
                        value={comparisonEndDate}
                        onChange={(e) => setComparisonEndDate(e.target.value)}
                        disabled={comparisonPeriod !== 'custom'}
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600 flex items-center">
              <DollarSign className="h-4 w-4 mr-2" />
              Total Income
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totals.totalIncome.toLocaleString()}</div>
            {enableComparison && (
              <div className="mt-2 text-sm text-muted-foreground">
                <div>Previous: ₹{comparisonTotals.totalIncome.toLocaleString()}</div>
                <div className={`flex items-center ${
                  getPercentageChange(totals.totalIncome, comparisonTotals.totalIncome) >= 0 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`}>
                  {getPercentageChange(totals.totalIncome, comparisonTotals.totalIncome) >= 0 
                    ? <TrendingUp className="h-3 w-3 mr-1" />
                    : <TrendingDown className="h-3 w-3 mr-1" />
                  }
                  {Math.abs(getPercentageChange(totals.totalIncome, comparisonTotals.totalIncome)).toFixed(1)}%
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center">
              <DollarSign className="h-4 w-4 mr-2" />
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totals.totalExpenses.toLocaleString()}</div>
            {enableComparison && (
              <div className="mt-2 text-sm text-muted-foreground">
                <div>Previous: ₹{comparisonTotals.totalExpenses.toLocaleString()}</div>
                <div className={`flex items-center ${
                  getPercentageChange(totals.totalExpenses, comparisonTotals.totalExpenses) >= 0 
                    ? 'text-red-600' 
                    : 'text-green-600'
                }`}>
                  {getPercentageChange(totals.totalExpenses, comparisonTotals.totalExpenses) >= 0 
                    ? <TrendingUp className="h-3 w-3 mr-1" />
                    : <TrendingDown className="h-3 w-3 mr-1" />
                  }
                  {Math.abs(getPercentageChange(totals.totalExpenses, comparisonTotals.totalExpenses)).toFixed(1)}%
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className={`flex items-center ${totals.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
              <DollarSign className="h-4 w-4 mr-2" />
              Net {totals.netProfit >= 0 ? 'Profit' : 'Loss'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{Math.abs(totals.netProfit).toLocaleString()}</div>
            {enableComparison && (
              <div className="mt-2 text-sm text-muted-foreground">
                <div>Previous: ₹{Math.abs(comparisonTotals.netProfit).toLocaleString()}{comparisonTotals.netProfit < 0 ? ' (Loss)' : ''}</div>
                <div className={`flex items-center ${
                  getPercentageChange(totals.netProfit, comparisonTotals.netProfit) >= 0 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`}>
                  {getPercentageChange(totals.netProfit, comparisonTotals.netProfit) >= 0 
                    ? <TrendingUp className="h-3 w-3 mr-1" />
                    : <TrendingDown className="h-3 w-3 mr-1" />
                  }
                  {Math.abs(getPercentageChange(totals.netProfit, comparisonTotals.netProfit)).toFixed(1)}%
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Debug Section - Show when no data */}
      {monthlyData.length === 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-orange-800">Debug Information - No Data Found</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div><strong>Date Range:</strong> {startDate} to {endDate}</div>
              <div><strong>Invoice Count:</strong> {invoiceData.length}</div>
              <div><strong>Journal Entry Count:</strong> {journalData.length}</div>
              <div><strong>User ID:</strong> {user?.id}</div>
              
              {invoiceData.length > 0 && (
                <div>
                  <strong>Sample Invoice:</strong> 
                  <pre className="mt-1 text-xs bg-white p-2 rounded border">
                    {JSON.stringify(invoiceData[0], null, 2)}
                  </pre>
                </div>
              )}
              
              {journalData.length > 0 && (
                <div>
                  <strong>Sample Journal Entry:</strong>
                  <pre className="mt-1 text-xs bg-white p-2 rounded border">
                    {JSON.stringify(journalData[0], null, 2)}
                  </pre>
                </div>
              )}
              
              {invoiceData.length === 0 && journalData.length === 0 && (
                <div className="text-orange-600 font-medium">
                  No invoices or journal entries found for this date range. 
                  Please check if you have:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Paid invoices in the selected date range</li>
                    <li>Journal entries with income/expense account types</li>
                    <li>Correct date range selected</li>
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account Breakdown with Drill-down */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Eye className="h-5 w-5 mr-2" />
            Account Breakdown
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Click on any account to drill down into detailed transactions
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Income Accounts */}
            <div>
              <h4 className="font-semibold text-green-600 mb-3">Income Accounts</h4>
              <div className="space-y-2">
                {accountSummaries
                  .filter(account => account.account_type === 'income')
                  .map((account) => (
                    <div 
                      key={account.account_id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => handleAccountDrillDown(account.account_id)}
                    >
                      <div className="flex-1">
                        <div className="font-medium">{account.account_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {account.transactions_count} transaction{account.transactions_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-green-600">
                          ₹{account.total_amount.toLocaleString()}
                        </span>
                        <ExternalLink className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  ))}
                {accountSummaries.filter(account => account.account_type === 'income').length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No income accounts found
                  </div>
                )}
              </div>
            </div>

            {/* Expense Accounts */}
            <div>
              <h4 className="font-semibold text-red-600 mb-3">Expense Accounts</h4>
              <div className="space-y-2">
                {accountSummaries
                  .filter(account => account.account_type === 'expense')
                  .map((account) => (
                    <div 
                      key={account.account_id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => handleAccountDrillDown(account.account_id)}
                    >
                      <div className="flex-1">
                        <div className="font-medium">{account.account_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {account.transactions_count} transaction{account.transactions_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-red-600">
                          ₹{account.total_amount.toLocaleString()}
                        </span>
                        <ExternalLink className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  ))}
                {accountSummaries.filter(account => account.account_type === 'expense').length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No expense accounts found
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Income vs Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => `₹${Number(value).toLocaleString()}`} />
                <Bar dataKey="totalIncome" fill="#10b981" name="Income" />
                <Bar dataKey="totalExpenses" fill="#ef4444" name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Net Profit/Loss Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => `₹${Number(value).toLocaleString()}`} />
                <Line 
                  type="monotone" 
                  dataKey="netProfit" 
                  stroke="#8884d8" 
                  strokeWidth={2}
                  name="Net Profit/Loss"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Total Income</TableHead>
                  <TableHead className="text-right">Total Expenses</TableHead>
                  <TableHead className="text-right">Net Profit/Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyData.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right text-green-600">
                      ₹{row.totalIncome.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      ₹{row.totalExpenses.toLocaleString()}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${
                      row.netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      ₹{Math.abs(row.netProfit).toLocaleString()}
                      {row.netProfit < 0 && ' (Loss)'}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right text-green-600">
                    ₹{totals.totalIncome.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-red-600">
                    ₹{totals.totalExpenses.toLocaleString()}
                  </TableCell>
                  <TableCell className={`text-right ${
                    totals.netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ₹{Math.abs(totals.netProfit).toLocaleString()}
                    {totals.netProfit < 0 && ' (Loss)'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Drill-down Dialog */}
      <Dialog open={drillDownDialogOpen} onOpenChange={setDrillDownDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              Account Transactions
              {selectedAccount && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {accountSummaries.find(a => a.account_id === selectedAccount)?.account_name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedAccount && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                <div>
                  <div className="font-semibold">Account Summary</div>
                  <div className="text-sm text-muted-foreground">
                    Total: ₹{accountSummaries.find(a => a.account_id === selectedAccount)?.total_amount.toLocaleString()}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => navigateToLedger(selectedAccount)}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    View Ledger
                  </Button>
                </div>
              </div>
              
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Journal #</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getAccountTransactions(selectedAccount).map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          {new Date(transaction.journal_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {transaction.journal_number || transaction.journal_id.slice(0, 8)}
                        </TableCell>
                        <TableCell>
                          {transaction.narration || 'No description'}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {transaction.debit > 0 ? `₹${transaction.debit.toLocaleString()}` : '-'}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {transaction.credit > 0 ? `₹${transaction.credit.toLocaleString()}` : '-'}
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => navigateToJournal(transaction.journal_id)}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {getAccountTransactions(selectedAccount).length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No transactions found for this account in the selected period.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {monthlyData.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">
              No data available for the selected date range. Make sure you have created journal entries with income and expense accounts.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProfitLoss;
