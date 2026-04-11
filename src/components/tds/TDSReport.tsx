import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, FileSpreadsheet, Calendar, IndianRupee, Percent, TrendingDown, FileText, Award } from 'lucide-react';
import { DateRangePicker } from '@/components/DateRangePicker';
import { useTDSTransactions, useTDSSummary } from '@/hooks/useTDSTransactions';
import type { TDSReportFilters } from '@/types/tds';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from '@/hooks/use-toast';
import { downloadTDSReportPDF } from '@/utils/tdsPDF';
import { downloadForm16APDF } from '@/utils/form16aPDF';
import { useEnhancedBusinessData } from '@/hooks/useEnhancedBusinessData';

const TDSReport = () => {
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'quarterly' | 'yearly' | 'custom'>('monthly');

  // Format dates for API
  const filters = {
    startDate: dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
    endDate: dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
    period: selectedPeriod === 'custom' ? undefined : selectedPeriod,
  };

  const { data: transactions = [], isLoading } = useTDSTransactions(filters);
  const { data: summary } = useTDSSummary(filters);
  const { getBusinessInfo } = useEnhancedBusinessData();
  const businessInfo = getBusinessInfo();

  const stats = [
    {
      title: "Total Transactions",
      value: summary?.transactionCount || 0,
      description: `${selectedPeriod} period`,
      icon: Calendar,
      color: "text-blue-600",
    },
    {
      title: "Total Transaction Amount",
      value: `₹${(summary?.totalTransactionAmount || 0).toLocaleString()}`,
      description: `${selectedPeriod} period`,
      icon: IndianRupee,
      color: "text-green-600",
    },
    {
      title: "TDS Deducted",
      value: `₹${(summary?.totalTDSDeducted || 0).toLocaleString()}`,
      description: `${selectedPeriod} period`,
      icon: TrendingDown,
      color: "text-red-600",
    },
    {
      title: "Net Payable",
      value: `₹${(summary?.totalNetPayable || 0).toLocaleString()}`,
      description: `${selectedPeriod} period`,
      icon: Percent,
      color: "text-purple-600",
    },
  ];

  // Prepare chart data
  const categoryChartData = summary?.categoryBreakdown?.map((category: any) => ({
    name: category.category,
    tdsAmount: category.totalTDS,
    transactionAmount: category.totalAmount,
    count: category.transactionCount,
  })) || [];

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0'];

  const generateCSVData = () => {
    const headers = ['Date', 'Vendor/Customer', 'Transaction Amount', 'TDS Rate (%)', 'TDS Deducted', 'Net Paid', 'Category', 'Certificate No'];
    const csvData = [
      headers.join(','),
      ...transactions.map(t => [
        format(new Date(t.transaction_date), 'dd/MM/yyyy'),
        t.vendor_name,
        t.transaction_amount,
        t.tds_rate,
        t.tds_amount,
        t.net_payable,
        t.tds_rules?.category || 'Other',
        t.certificate_number || ''
      ].join(','))
    ].join('\n');
    return csvData;
  };

  const downloadCSV = (data: string, filename: string) => {
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCSV = () => {
    const csvData = generateCSVData();
    downloadCSV(csvData, `tds_report_${new Date().toISOString().split('T')[0]}.csv`);
    toast({
      title: "Export Successful",
      description: "TDS report has been downloaded as CSV file.",
    });
  };

  const handleExportExcel = () => {
    const csvData = generateCSVData();
    downloadCSV(csvData, `tds_report_${new Date().toISOString().split('T')[0]}.csv`);
    toast({
      title: "Export Successful", 
      description: "TDS report has been downloaded for Excel.",
    });
  };

  const handleExportPDF = () => {
    if (!summary) {
      toast({
        title: "No Data",
        description: "No TDS data available to export.",
        variant: "destructive",
      });
      return;
    }

    const periodLabel = selectedPeriod === 'custom' 
      ? `${dateRange.from ? format(dateRange.from, 'dd MMM yyyy') : ''} - ${dateRange.to ? format(dateRange.to, 'dd MMM yyyy') : ''}`
      : selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1);
    
    downloadTDSReportPDF(transactions, summary, periodLabel, businessInfo);
    
    toast({
      title: "PDF Generated",
      description: "TDS report has been downloaded as PDF.",
    });
  };

  const handleGenerateCertificate = (transaction: any) => {
    const deductorInfo = {
      businessName: businessInfo?.businessName,
      ownerName: businessInfo?.ownerName,
      address: businessInfo?.address,
      pan: businessInfo?.gstNumber?.substring(2, 12) || '', // Extract PAN from GST
      tan: '', // TAN to be added in settings
      city: businessInfo?.city,
      state: businessInfo?.state,
      pincode: businessInfo?.pincode,
    };

    downloadForm16APDF(transaction, deductorInfo);
    
    toast({
      title: "Certificate Generated",
      description: `Form 16A certificate for ${transaction.vendor_name} has been downloaded.`,
    });
  };

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period as any);
    if (period !== 'custom') {
      // Reset date range for predefined periods
      const now = new Date();
      switch (period) {
        case 'monthly':
          setDateRange({
            from: new Date(now.getFullYear(), now.getMonth(), 1),
            to: now,
          });
          break;
        case 'quarterly':
          const currentQuarter = Math.floor(now.getMonth() / 3);
          setDateRange({
            from: new Date(now.getFullYear(), currentQuarter * 3, 1),
            to: now,
          });
          break;
        case 'yearly':
          setDateRange({
            from: new Date(now.getFullYear(), 0, 1),
            to: now,
          });
          break;
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>TDS Report</CardTitle>
              <CardDescription>View TDS deductions and compliance summary</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              {selectedPeriod === 'custom' && (
          <DateRangePicker
            startDate={dateRange.from}
            endDate={dateRange.to}
            onChange={(range) => setDateRange({ from: range.startDate || new Date(), to: range.endDate || new Date() })}
          />
              )}

              <Button variant="default" onClick={handleExportPDF} className="transition-all hover:scale-105">
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" onClick={handleExportExcel} className="transition-all hover:scale-105">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" onClick={handleExportCSV} className="transition-all hover:scale-105">
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card 
            key={stat.title} 
            className="transition-all duration-300 hover:scale-[1.02] hover:shadow-lg animate-fade-in"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color} transition-transform duration-200 hover:scale-110`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      {summary?.categoryBreakdown && summary.categoryBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>TDS by Category</CardTitle>
              <CardDescription>TDS deduction breakdown by categories</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categoryChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis />
                  <Tooltip formatter={(value: any, name: any) => [
                    `₹${Number(value).toLocaleString()}`,
                    name === 'tdsAmount' ? 'TDS Amount' : 'Transaction Amount'
                  ]} />
                  <Bar dataKey="tdsAmount" fill="#ff7c7c" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>TDS Distribution</CardTitle>
              <CardDescription>Percentage distribution by categories</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="tdsAmount"
                  >
                    {categoryChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => `₹${Number(value).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TDS Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>TDS Transactions</CardTitle>
          <CardDescription>Detailed list of all TDS deductions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading TDS transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No TDS transactions found for the selected period.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor/Customer</TableHead>
                    <TableHead>Transaction Amount</TableHead>
                    <TableHead>TDS Rate</TableHead>
                    <TableHead>TDS Deducted</TableHead>
                    <TableHead>Net Paid</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Certificate No</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id} className="transition-all hover:bg-muted/50">
                      <TableCell>
                        {format(new Date(transaction.transaction_date), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {transaction.vendor_name}
                      </TableCell>
                      <TableCell>₹{transaction.transaction_amount.toLocaleString()}</TableCell>
                      <TableCell>{transaction.tds_rate}%</TableCell>
                      <TableCell className="text-red-600">
                        ₹{transaction.tds_amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-green-600">
                        ₹{transaction.net_payable.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {transaction.tds_rules?.category || 'Other'}
                        </Badge>
                      </TableCell>
                      <TableCell>{transaction.certificate_number || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateCertificate(transaction)}
                          className="transition-all hover:scale-105 hover:bg-primary hover:text-primary-foreground"
                        >
                          <Award className="h-4 w-4 mr-1" />
                          Form 16A
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance Summary */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Compliance Summary</CardTitle>
            <CardDescription>TDS deduction summary for government filing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-3xl font-bold text-blue-600">
                  ₹{summary.totalTDSDeducted.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Total TDS Deducted</div>
                <div className="text-xs text-blue-600 mt-1">Ready for filing</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-3xl font-bold text-green-600">
                  {summary.transactionCount}
                </div>
                <div className="text-sm text-muted-foreground">Total Transactions</div>
                <div className="text-xs text-green-600 mt-1">Processed</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-3xl font-bold text-purple-600">
                  ₹{summary.totalTransactionAmount.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Total Transaction Value</div>
                <div className="text-xs text-purple-600 mt-1">Gross amount</div>
              </div>
            </div>

            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-medium text-yellow-900 mb-2">Filing Reminder</h4>
              <p className="text-sm text-yellow-800">
                TDS returns should be filed by the 7th of the following month. 
                Ensure all TDS certificates are issued to vendors within the prescribed time limits.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TDSReport;