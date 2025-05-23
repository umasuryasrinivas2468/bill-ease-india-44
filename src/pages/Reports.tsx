
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Download, FileSpreadsheet, Calendar, TrendingUp, IndianRupee } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useInvoices } from '@/hooks/useInvoices';
import { useToast } from '@/hooks/use-toast';

const Reports = () => {
  const [selectedMonth, setSelectedMonth] = useState('2024-01');
  const [selectedYear, setSelectedYear] = useState('2024');
  const { data: invoices = [] } = useInvoices();
  const { toast } = useToast();

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
    const monthlyStats = {};
    
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

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Reports</h1>
            <p className="text-muted-foreground">View your business analytics and GST reports</p>
          </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Revenue</CardTitle>
            <CardDescription>Invoice count and revenue by month</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value, name) => [
                    name === 'amount' ? `₹${value.toLocaleString()}` : value,
                    name === 'amount' ? 'Revenue' : 'Invoices'
                  ]} />
                  <Bar dataKey="amount" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available. Create some invoices to see the chart.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>GST Breakdown</CardTitle>
            <CardDescription>GST collection by type</CardDescription>
          </CardHeader>
          <CardContent>
            {totalGst > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={gstData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ₹${value.toLocaleString()}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {gstData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  ₹{gstSummary.totalSales.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Total Sales</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  ₹{gstSummary.cgst.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">CGST (9%)</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  ₹{gstSummary.sgst.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">SGST (9%)</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">
                  ₹{gstSummary.totalGst.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Total GST</div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
