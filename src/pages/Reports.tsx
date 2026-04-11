
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Download, FileSpreadsheet, Calendar, TrendingUp, IndianRupee, Database, Users, Building, Receipt, FileText as FileTextIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useInvoices } from '@/hooks/useInvoices';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId } from '@/lib/userUtils';
import DayBook from '@/components/reports/DayBook';
import GSTR3BSummary from '@/components/reports/GSTR3BSummary';
import CustomerAging from '@/components/reports/CustomerAging';
import VendorAging from '@/components/reports/VendorAging';
import AccountReceivables from '@/components/reports/AccountReceivables';
import AccountPayables from '@/components/reports/AccountPayables';
import PayablesReport from '@/components/reports/PayablesReport';
import CashFlowAnalysis from '@/components/reports/CashFlowAnalysis';
import GSTMonthCalendar from '@/components/reports/GSTMonthCalendar';

import { createSampleBusinessData } from '@/utils/createSampleBusinessData';
import { usePerformanceData } from '@/hooks/usePerformanceData';
import { generatePerformancePDF } from '@/services/performanceReportService';

const Reports = () => {
  const [selectedMonth, setSelectedMonth] = useState('2024-01');
  const [selectedYear, setSelectedYear] = useState('2024');
  const [isCreatingSample, setIsCreatingSample] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const { data: invoices = [] } = useInvoices();
  const { toast } = useToast();
  const { user } = useUser();
  const performanceData = usePerformanceData();

  // Calculate stats from real data
  const totalInvoices = invoices.length;
  const totalRevenue = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + Number(inv.total_amount), 0);
  const totalGst = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + Number(inv.gst_amount), 0);

  // Generate monthly data from invoices
  const monthlyData = React.useMemo(() => {
    const monthlyStats: Record<string, { month: string; invoices: number; amount: number }> = {};
    invoices.forEach(invoice => {
      const date = new Date(invoice.invoice_date);
      const monthKey = date.toLocaleDateString('en', { month: 'short' });
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = { month: monthKey, invoices: 0, amount: 0 };
      }
      monthlyStats[monthKey].invoices += 1;
      if (invoice.status === 'paid') {
        monthlyStats[monthKey].amount += Number(invoice.total_amount);
      }
    });
    return Object.values(monthlyStats);
  }, [invoices]);

  const gstData = [
    { name: 'CGST (9%)', value: totalGst * 0.5, color: '#8884d8' },
    { name: 'SGST (9%)', value: totalGst * 0.5, color: '#82ca9d' },
    { name: 'IGST (18%)', value: 0, color: '#ffc658' },
  ];

  const stats = [
    {
      title: "Total Invoices",
      value: totalInvoices.toString(),
      description: "All time",
      icon: Calendar,
      color: "text-blue-600",
    },
    {
      title: "Total Revenue",
      value: `₹${totalRevenue.toLocaleString()}`,
      description: "All time",
      icon: IndianRupee,
      color: "text-green-600",
    },
    {
      title: "GST Collected",
      value: `₹${totalGst.toLocaleString()}`,
      description: "All time",
      icon: TrendingUp,
      color: "text-purple-600",
    },
  ];

  const gstSummary = {
    totalSales: totalRevenue,
    cgst: Math.round(totalGst * 0.5),
    sgst: Math.round(totalGst * 0.5),
    igst: 0,
    totalGst: totalGst,
  };

  const generateCSVData = () => {
    const headers = ['Invoice Number', 'Client Name', 'Date', 'Amount', 'GST', 'Total', 'Status'];
    const csvData = [
      headers.join(','),
      ...invoices.map(invoice => [
        invoice.invoice_number,
        invoice.client_name,
        invoice.invoice_date,
        invoice.amount,
        invoice.gst_amount,
        invoice.total_amount,
        invoice.status
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

  const handleExportExcel = () => {
    const csvData = generateCSVData();
    downloadCSV(csvData, `invoice_report_${new Date().toISOString().split('T')[0]}.csv`);
    toast({
      title: "Export Successful",
      description: "Invoice report has been downloaded as CSV file.",
    });
  };

  const handleExportCSV = () => {
    const csvData = generateCSVData();
    downloadCSV(csvData, `invoice_report_${new Date().toISOString().split('T')[0]}.csv`);
    toast({
      title: "Export Successful",
      description: "Invoice report has been downloaded as CSV file.",
    });
  };

  const handleCreateSampleData = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingSample(true);
    try {
      const normalizedUserId = normalizeUserId(user.id);
      await createSampleBusinessData(normalizedUserId);
      toast({
        title: "Sample Data Created",
        description: "Sample business data has been created successfully. Refresh the page to see the reports.",
      });
      // Refresh the page to show new data
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Error creating sample data:', error);
      toast({
        title: "Error",
        description: "Failed to create sample data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingSample(false);
    }
  };

  const handleGeneratePerformancePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const pdf = await generatePerformancePDF(performanceData);
      pdf.save(`performance-report-${new Date().toISOString().split('T')[0]}.pdf`);
      
      toast({
        title: "Performance Report Generated",
        description: "Your performance report has been downloaded successfully.",
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      toast({
        title: "Error",
        description: `Failed to generate performance report. ${errMsg}`,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };



  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Reports & Analysis</h1>
            <p className="text-muted-foreground">View your business analytics and comprehensive reports</p>
          </div>
        </div>
        
        {/* Action Controls */}
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleGeneratePerformancePDF}
            disabled={isGeneratingPDF}
          >
            <FileTextIcon className="h-4 w-4 mr-2" />
            {isGeneratingPDF ? 'Generating...' : 'Performance'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('/reports/gst3-filing', '_blank')}
          >
            <Receipt className="h-4 w-4 mr-2" />
            GST-3 Filing
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateSampleData}
            disabled={isCreatingSample}
          >
            <Database className="h-4 w-4 mr-2" />
            {isCreatingSample ? 'Creating...' : 'Create Sample Data'}
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Monthly Revenue</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Invoice count and revenue by month</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: any, name: any) => [
                    name === 'amount' ? `₹${Number(value).toLocaleString()}` : value,
                    name === 'amount' ? 'Revenue' : 'Invoices'
                  ]} />
                  <Bar dataKey="amount" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
                No data available. Create some invoices to see the chart.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">GST Breakdown</CardTitle>
            <CardDescription className="text-xs sm:text-sm">GST collection by type</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            {totalGst > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={gstData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }: any) => {
                      const shortName = name.split(' ')[0];
                      return `${shortName}: ₹${Number(value).toLocaleString()}`;
                    }}
                    outerRadius={60}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {gstData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => `₹${Number(value).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
                No GST data available. Create some paid invoices to see the breakdown.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* GST Reports */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>GST Summary Report</CardTitle>
              <CardDescription>Business GST filing summary</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024-01">January 2024</SelectItem>
                  <SelectItem value="2024-02">February 2024</SelectItem>
                  <SelectItem value="2024-03">March 2024</SelectItem>
                  <SelectItem value="2024-04">April 2024</SelectItem>
                  <SelectItem value="2024-05">May 2024</SelectItem>
                  <SelectItem value="2024-06">June 2024</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleExportExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
              <div className="text-center p-3 sm:p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <div className="text-lg sm:text-2xl font-bold text-blue-600">
                  ₹{gstSummary.totalSales.toLocaleString()}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">Total Sales</div>
              </div>
              <div className="text-center p-3 sm:p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <div className="text-lg sm:text-2xl font-bold text-green-600">
                  ₹{gstSummary.cgst.toLocaleString()}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">CGST (9%)</div>
              </div>
              <div className="text-center p-3 sm:p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                <div className="text-lg sm:text-2xl font-bold text-purple-600">
                  ₹{gstSummary.sgst.toLocaleString()}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">SGST (9%)</div>
              </div>
              <div className="text-center p-3 sm:p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                <div className="text-lg sm:text-2xl font-bold text-orange-600">
                  ₹{gstSummary.totalGst.toLocaleString()}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">Total GST</div>
              </div>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">B2B vs B2C Breakdown</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="flex justify-between">
                    <span>B2B Sales:</span>
                    <span className="font-medium">₹{Math.round(gstSummary.totalSales * 0.7).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>B2B GST:</span>
                    <span className="font-medium">₹{Math.round(gstSummary.totalGst * 0.7).toLocaleString()}</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between">
                    <span>B2C Sales:</span>
                    <span className="font-medium">₹{Math.round(gstSummary.totalSales * 0.3).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>B2C GST:</span>
                    <span className="font-medium">₹{Math.round(gstSummary.totalGst * 0.3).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Month-wise GST Calendar */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Month-wise GST Calendar
              </h4>
              <GSTMonthCalendar />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Reports Section */}
      <Card className="border-t-4 border-t-blue-500">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">B</div>
            Business Reports & Analysis
          </CardTitle>
          <CardDescription>Comprehensive business reports for decision making and compliance</CardDescription>
        </CardHeader>
      </Card>

      {/* Day Book */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-green-700">📋 Day Book</CardTitle>
          <CardDescription>Daily cash and bank transactions summary</CardDescription>
        </CardHeader>
        <CardContent>
          <DayBook />
        </CardContent>
      </Card>


      {/* Account Receivables */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-blue-700 flex items-center gap-2">
            <Users className="h-5 w-5" />
            Account Receivables
          </CardTitle>
          <CardDescription>Outstanding customer invoices and collection analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountReceivables />
        </CardContent>
      </Card>

      {/* Payables Report */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-orange-700 flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Payables Report
          </CardTitle>
          <CardDescription>Pending vendor payments and bills</CardDescription>
        </CardHeader>
        <CardContent>
          <PayablesReport />
        </CardContent>
      </Card>

      {/* Vendor Aging */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-red-700 flex items-center gap-2">
            <Building className="h-5 w-5" />
            Vendor Aging Analysis
          </CardTitle>
          <CardDescription>Aging analysis of vendor payables by due date</CardDescription>
        </CardHeader>
        <CardContent>
          <VendorAging />
        </CardContent>
      </Card>

      {/* Account Payables */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-orange-700 flex items-center gap-2">
            <Building className="h-5 w-5" />
            Account Payables
          </CardTitle>
          <CardDescription>Outstanding vendor bills and payment analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountPayables />
        </CardContent>
      </Card>

      {/* Customer Aging Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-purple-700 flex items-center gap-2">
            <Users className="h-5 w-5" />
            Customer Aging Analysis
          </CardTitle>
          <CardDescription>Aging analysis of outstanding customer receivables</CardDescription>
        </CardHeader>
        <CardContent>
          <CustomerAging />
        </CardContent>
      </Card>

      {/* Vendor Aging Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-teal-700 flex items-center gap-2">
            <Building className="h-5 w-5" />
            Vendor Aging Analysis
          </CardTitle>
          <CardDescription>Aging analysis of outstanding vendor payables</CardDescription>
        </CardHeader>
        <CardContent>
          <VendorAging />
        </CardContent>
      </Card>

      {/* Cash Flow Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-blue-700 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Cash Flow Analysis & Projections
          </CardTitle>
          <CardDescription>12-week cash flow projections with alerts and recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          <CashFlowAnalysis />
        </CardContent>
      </Card>



      {/* GSTR-3B Filing Support */}
      <GSTR3BSummary />
    </div>
  );
};

export default Reports;
