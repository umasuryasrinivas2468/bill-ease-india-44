
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

interface JournalLineWithAccount {
  id: string;
  debit: number;
  credit: number;
  journal_date: string;
  account_type: string;
  account_name: string;
}

interface MonthlyData {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
}

const ProfitLoss = () => {
  const { user } = useUser();
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 11);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Fetch journal lines with account information
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
          journals!inner (
            journal_date,
            user_id
          ),
          accounts!inner (
            account_type,
            account_name
          )
        `)
        .eq('journals.user_id', user.id)
        .gte('journals.journal_date', startDate)
        .lte('journals.journal_date', endDate)
        .in('accounts.account_type', ['income', 'expense']);
      
      if (error) throw error;
      
      return data.map(item => ({
        id: item.id,
        debit: Number(item.debit),
        credit: Number(item.credit),
        journal_date: item.journals.journal_date,
        account_type: item.accounts.account_type,
        account_name: item.accounts.account_name
      })) as JournalLineWithAccount[];
    },
    enabled: !!user?.id,
  });

  // Process data for monthly P&L
  const monthlyData = useMemo(() => {
    const monthMap = new Map<string, { income: number; expenses: number }>();
    
    journalData.forEach(line => {
      const date = new Date(line.journal_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en', { month: 'short', year: 'numeric' });
      
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { income: 0, expenses: 0 });
      }
      
      const monthData = monthMap.get(monthKey)!;
      
      if (line.account_type === 'income') {
        // Income accounts: Credit increases income
        monthData.income += line.credit - line.debit;
      } else if (line.account_type === 'expense') {
        // Expense accounts: Debit increases expenses
        monthData.expenses += line.debit - line.credit;
      }
    });
    
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
    
    return result;
  }, [journalData]);

  // Calculate totals
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

  const exportToCSV = () => {
    const headers = ['Month', 'Total Income', 'Total Expenses', 'Net Profit/Loss'];
    const csvData = [
      headers.join(','),
      ...monthlyData.map(row => [
        row.month,
        row.totalIncome.toFixed(2),
        row.totalExpenses.toFixed(2),
        row.netProfit.toFixed(2)
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `profit_loss_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Profit & Loss report exported successfully');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading Profit & Loss data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Profit & Loss Report</h1>
        <Button onClick={exportToCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Date Range</CardTitle>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">Total Income</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totals.totalIncome.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totals.totalExpenses.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className={totals.netProfit >= 0 ? "text-green-600" : "text-red-600"}>
              Net {totals.netProfit >= 0 ? 'Profit' : 'Loss'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{Math.abs(totals.netProfit).toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

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
