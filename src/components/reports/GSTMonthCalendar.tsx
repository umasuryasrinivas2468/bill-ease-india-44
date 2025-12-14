import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, FileJson, Download } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { useBusinessData } from '@/hooks/useBusinessData';
import { useToast } from '@/hooks/use-toast';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const GSTMonthCalendar = () => {
  const { data: invoices = [] } = useInvoices();
  const { getBusinessInfo } = useBusinessData();
  const { toast } = useToast();
  const businessInfo = getBusinessInfo();

  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedGstType, setSelectedGstType] = useState<string>('GSTR1');

  // Get available years and months from invoices
  const { availableYears, availableMonths, firstInvoiceDate } = useMemo(() => {
    if (invoices.length === 0) {
      return { availableYears: [], availableMonths: [], firstInvoiceDate: null };
    }

    const dates = invoices.map(inv => new Date(inv.invoice_date));
    const earliestDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const currentDate = new Date();

    const years: number[] = [];
    for (let y = earliestDate.getFullYear(); y <= currentDate.getFullYear(); y++) {
      years.push(y);
    }

    return {
      availableYears: years,
      availableMonths: MONTH_NAMES,
      firstInvoiceDate: earliestDate,
    };
  }, [invoices]);

  // Set default year/month to first invoice date
  React.useEffect(() => {
    if (firstInvoiceDate && !selectedYear) {
      setSelectedYear(String(firstInvoiceDate.getFullYear()));
      setSelectedMonth(String(firstInvoiceDate.getMonth()));
    }
  }, [firstInvoiceDate, selectedYear]);

  // Get data for selected month
  const selectedMonthData = useMemo(() => {
    if (!selectedYear || selectedMonth === '') return null;

    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth);

    const monthInvoices = invoices.filter(inv => {
      const invDate = new Date(inv.invoice_date);
      return invDate.getFullYear() === year && invDate.getMonth() === month;
    });

    const totalSales = monthInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
    const totalGst = monthInvoices.reduce((sum, inv) => sum + Number(inv.gst_amount || 0), 0);

    return {
      year,
      month,
      label: `${MONTH_NAMES[month]} ${year}`,
      invoiceCount: monthInvoices.length,
      totalSales,
      cgst: Math.round(totalGst * 0.5),
      sgst: Math.round(totalGst * 0.5),
      totalGst,
      invoices: monthInvoices,
    };
  }, [selectedYear, selectedMonth, invoices]);

  const downloadGSTJson = () => {
    if (!selectedMonthData) {
      toast({
        title: 'Select Month',
        description: 'Please select a year and month first.',
        variant: 'destructive',
      });
      return;
    }

    const gstJson = {
      report_type: selectedGstType,
      gstin: businessInfo?.gstNumber || 'NOT_CONFIGURED',
      business_name: businessInfo?.businessName || 'Business Name',
      business_address: businessInfo?.address || '',
      filing_period: {
        month: selectedMonthData.month + 1,
        month_name: MONTH_NAMES[selectedMonthData.month],
        year: selectedMonthData.year,
        financial_year: selectedMonthData.month >= 3 
          ? `${selectedMonthData.year}-${selectedMonthData.year + 1}`
          : `${selectedMonthData.year - 1}-${selectedMonthData.year}`,
      },
      summary: {
        total_invoices: selectedMonthData.invoiceCount,
        total_taxable_value: Math.round(selectedMonthData.totalSales - selectedMonthData.totalGst),
        cgst: selectedMonthData.cgst,
        sgst: selectedMonthData.sgst,
        igst: 0,
        total_gst: selectedMonthData.totalGst,
        total_invoice_value: Math.round(selectedMonthData.totalSales),
      },
      ...(selectedGstType === 'GSTR1' && {
        b2b: selectedMonthData.invoices
          .filter(inv => inv.client_gst_number)
          .map(inv => ({
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            client_name: inv.client_name,
            client_gstin: inv.client_gst_number,
            taxable_value: Number(inv.amount || 0),
            cgst: Math.round(Number(inv.gst_amount || 0) * 0.5),
            sgst: Math.round(Number(inv.gst_amount || 0) * 0.5),
            igst: 0,
            total_value: Number(inv.total_amount || 0),
          })),
        b2c: selectedMonthData.invoices
          .filter(inv => !inv.client_gst_number)
          .map(inv => ({
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            client_name: inv.client_name,
            taxable_value: Number(inv.amount || 0),
            cgst: Math.round(Number(inv.gst_amount || 0) * 0.5),
            sgst: Math.round(Number(inv.gst_amount || 0) * 0.5),
            igst: 0,
            total_value: Number(inv.total_amount || 0),
          })),
      }),
      ...(selectedGstType === 'GSTR9' && {
        annual_summary: {
          total_invoices: selectedMonthData.invoiceCount,
          total_taxable_value: Math.round(selectedMonthData.totalSales - selectedMonthData.totalGst),
          total_tax_paid: selectedMonthData.totalGst,
        },
        invoices: selectedMonthData.invoices.map(inv => ({
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          client_name: inv.client_name,
          client_gstin: inv.client_gst_number || null,
          taxable_value: Number(inv.amount || 0),
          cgst: Math.round(Number(inv.gst_amount || 0) * 0.5),
          sgst: Math.round(Number(inv.gst_amount || 0) * 0.5),
          igst: 0,
          total_value: Number(inv.total_amount || 0),
          status: inv.status,
        })),
      }),
      generated_at: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(gstJson, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedGstType}_${selectedMonthData.year}_${String(selectedMonthData.month + 1).padStart(2, '0')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'GST JSON Downloaded',
      description: `${selectedGstType} data for ${selectedMonthData.label} has been downloaded.`,
    });
  };

  if (invoices.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No invoices found. Create your first invoice to generate GST reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info text */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>
          Data available from {firstInvoiceDate?.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* Dropdowns Row */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Year Dropdown */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Year</label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(year => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Month Dropdown */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Month</label>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((month, index) => (
                <SelectItem key={index} value={String(index)}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* GST Type Dropdown */}
        <div className="space-y-2">
          <label className="text-sm font-medium">GST Type</label>
          <Select value={selectedGstType} onValueChange={setSelectedGstType}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GSTR1">GSTR-1</SelectItem>
              <SelectItem value="GSTR9">GSTR-9</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Download Button */}
        <Button 
          onClick={downloadGSTJson}
          disabled={!selectedYear || selectedMonth === ''}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Download JSON
        </Button>
      </div>

      {/* Selected Month Summary */}
      {selectedMonthData && selectedMonthData.invoiceCount > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h4 className="font-medium mb-3">{selectedMonthData.label} Summary</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Invoices</p>
              <p className="text-lg font-semibold">{selectedMonthData.invoiceCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Sales</p>
              <p className="text-lg font-semibold">₹{selectedMonthData.totalSales.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">CGST + SGST</p>
              <p className="text-lg font-semibold text-green-600">
                ₹{selectedMonthData.cgst.toLocaleString()} + ₹{selectedMonthData.sgst.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total GST</p>
              <p className="text-lg font-semibold text-primary">₹{selectedMonthData.totalGst.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {selectedMonthData && selectedMonthData.invoiceCount === 0 && (
        <div className="rounded-lg border bg-muted/30 p-4 text-center text-muted-foreground">
          <FileJson className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No invoices found for {selectedMonthData.label}</p>
        </div>
      )}
    </div>
  );
};

export default GSTMonthCalendar;
