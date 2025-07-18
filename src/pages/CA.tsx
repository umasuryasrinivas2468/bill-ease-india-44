import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { FileSpreadsheet, Download, CheckCircle, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useInvoices } from '@/hooks/useInvoices';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BulkInvoiceProcessor from '@/components/BulkInvoiceProcessor';
import VirtualCFO from '@/components/VirtualCFO';
import PDFProcessor from '@/components/PDFProcessor';

const CA = () => {
  const { toast } = useToast();
  const { data: invoices = [] } = useInvoices();
  const [isProcessing, setIsProcessing] = useState(false);

  const generateGSTReport = () => {
    const csvHeaders = [
      'Invoice Number',
      'Client Name',
      'Client GST',
      'Invoice Date',
      'Taxable Amount',
      'CGST (9%)',
      'SGST (9%)',
      'IGST (18%)',
      'Total Tax',
      'Total Amount',
      'Status'
    ];

    const csvData = invoices.map(invoice => {
      const taxableAmount = Number(invoice.amount);
      const totalTax = Number(invoice.gst_amount);
      const cgst = totalTax / 2;
      const sgst = totalTax / 2;
      const igst = 0; // Assuming intra-state for now

      return [
        invoice.invoice_number,
        invoice.client_name,
        invoice.client_gst_number || '',
        invoice.invoice_date,
        taxableAmount.toFixed(2),
        cgst.toFixed(2),
        sgst.toFixed(2),
        igst.toFixed(2),
        totalTax.toFixed(2),
        Number(invoice.total_amount).toFixed(2),
        invoice.status.toUpperCase()
      ];
    });

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return csvContent;
  };

  const downloadGSTReport = () => {
    setIsProcessing(true);
    
    try {
      const csvContent = generateGSTReport();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const currentDate = new Date().toISOString().split('T')[0];
      link.setAttribute('href', url);
      link.setAttribute('download', `GST_Report_${currentDate}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Report Generated",
        description: "GST report has been downloaded successfully.",
      });
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Error",
        description: "Failed to generate report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const generateSalesReport = () => {
    const csvHeaders = [
      'Invoice Number',
      'Client Name',
      'Invoice Date',
      'Due Date',
      'Amount',
      'GST Amount',
      'Total Amount',
      'Status',
      'Payment Status'
    ];

    const csvData = invoices.map(invoice => [
      invoice.invoice_number,
      invoice.client_name,
      invoice.invoice_date,
      invoice.due_date,
      Number(invoice.amount).toFixed(2),
      Number(invoice.gst_amount).toFixed(2),
      Number(invoice.total_amount).toFixed(2),
      invoice.status.toUpperCase(),
      invoice.status === 'paid' ? 'RECEIVED' : 'PENDING'
    ]);

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return csvContent;
  };

  const downloadSalesReport = () => {
    setIsProcessing(true);
    
    try {
      const csvContent = generateSalesReport();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const currentDate = new Date().toISOString().split('T')[0];
      link.setAttribute('href', url);
      link.setAttribute('download', `Sales_Report_${currentDate}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Report Generated",
        description: "Sales report has been downloaded successfully.",
      });
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Error",
        description: "Failed to generate report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">CA Tools</h1>
          <p className="text-muted-foreground">Professional tools for chartered accountants</p>
        </div>
      </div>

      <Tabs defaultValue="reports" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="reports">Reports & Stats</TabsTrigger>
          <TabsTrigger value="bulk-processing">Bulk Processing</TabsTrigger>
          <TabsTrigger value="data-extraction">Data Extraction</TabsTrigger>
          <TabsTrigger value="virtual-cfo">Virtual CFO</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{invoices.length}</div>
                <p className="text-xs text-muted-foreground">Available for processing</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹{invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + Number(inv.total_amount), 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">From paid invoices</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">GST Collected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹{invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + Number(inv.gst_amount), 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Total GST amount</p>
              </CardContent>
            </Card>
          </div>

          {/* Report Generation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>GST Returns</CardTitle>
                <CardDescription>Generate GST return files for filing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>GSTR-1 format compatible</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>All tax slabs included</span>
                </div>
                
                <Button 
                  onClick={downloadGSTReport} 
                  className="w-full"
                  disabled={isProcessing || invoices.length === 0}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  {isProcessing ? "Generating..." : "Download GST Report"}
                </Button>
                
                {invoices.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center">
                    No invoices available. Create some invoices first.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sales Reports</CardTitle>
                <CardDescription>Comprehensive sales and revenue analysis</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Detailed transaction records</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Payment status tracking</span>
                </div>
                
                <Button 
                  onClick={downloadSalesReport} 
                  variant="outline" 
                  className="w-full"
                  disabled={isProcessing || invoices.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isProcessing ? "Generating..." : "Download Sales Report"}
                </Button>
                
                {invoices.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center">
                    No invoices available. Create some invoices first.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bulk-processing">
          <BulkInvoiceProcessor />
        </TabsContent>

        <TabsContent value="data-extraction">
          <PDFProcessor />
        </TabsContent>

        <TabsContent value="virtual-cfo">
          <VirtualCFO />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CA;
