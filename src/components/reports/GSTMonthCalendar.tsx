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

  // Format date as DD-MM-YYYY for GSTN
  const formatDateGSTN = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Get financial year in YYYY-YY format
  const getFinancialYear = (year: number, month: number) => {
    if (month >= 3) { // April onwards
      return `${year}-${String(year + 1).slice(-2)}`;
    }
    return `${year - 1}-${String(year).slice(-2)}`;
  };

  const downloadGSTJson = () => {
    if (!selectedMonthData) {
      toast({
        title: 'Select Month',
        description: 'Please select a year and month first.',
        variant: 'destructive',
      });
      return;
    }

    const gstin = businessInfo?.gstNumber || 'NOT_CONFIGURED';
    const retPeriod = `${String(selectedMonthData.month + 1).padStart(2, '0')}${selectedMonthData.year}`;
    const financialYear = getFinancialYear(selectedMonthData.year, selectedMonthData.month);

    let gstJson: any;

    if (selectedGstType === 'GSTR1') {
      // GSTN-compliant GSTR-1 format
      const b2bInvoices = selectedMonthData.invoices.filter(inv => inv.client_gst_number);
      const b2cInvoices = selectedMonthData.invoices.filter(inv => !inv.client_gst_number);

      // Group B2B invoices by GSTIN
      const b2bGrouped = b2bInvoices.reduce((acc: any, inv) => {
        const ctin = inv.client_gst_number!;
        if (!acc[ctin]) {
          acc[ctin] = [];
        }
        acc[ctin].push({
          inum: inv.invoice_number,
          idt: formatDateGSTN(inv.invoice_date),
          val: Number(inv.total_amount || 0),
          pos: gstin.slice(0, 2), // Place of supply from GSTIN
          rchrg: 'N',
          itms: [{
            num: 1,
            itm_det: {
              txval: Number(inv.amount || 0),
              rt: Number(inv.gst_rate || 18),
              camt: Math.round(Number(inv.gst_amount || 0) * 0.5 * 100) / 100,
              samt: Math.round(Number(inv.gst_amount || 0) * 0.5 * 100) / 100,
              iamt: 0,
            }
          }]
        });
        return acc;
      }, {});

      gstJson = {
        gstin: gstin,
        ret_period: retPeriod,
        b2b: Object.entries(b2bGrouped).map(([ctin, invs]) => ({
          ctin: ctin,
          inv: invs,
        })),
        b2cs: b2cInvoices.length > 0 ? [{
          sply_ty: 'INTRA',
          pos: gstin.slice(0, 2),
          txval: b2cInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0),
          camt: b2cInvoices.reduce((sum, inv) => sum + Math.round(Number(inv.gst_amount || 0) * 0.5 * 100) / 100, 0),
          samt: b2cInvoices.reduce((sum, inv) => sum + Math.round(Number(inv.gst_amount || 0) * 0.5 * 100) / 100, 0),
          iamt: 0,
        }] : [],
      };
    } else {
      // GSTR-9 format as per user specification
      const totalTaxableValue = Math.round(selectedMonthData.totalSales - selectedMonthData.totalGst);
      const cgst = selectedMonthData.cgst;
      const sgst = selectedMonthData.sgst;
      const igst = 0;

      gstJson = {
        gstin: gstin,
        fy: financialYear,
        outward_supplies: {
          taxable_value: totalTaxableValue,
          cgst: cgst,
          sgst: sgst,
          igst: igst,
          cess: 0
        },
        tax_paid: {
          cgst: cgst,
          sgst: sgst,
          igst: igst,
          cess: 0,
          total: cgst + sgst + igst
        }
      };
    }

    const blob = new Blob([JSON.stringify(gstJson, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedGstType}_${selectedMonthData.year}_${String(selectedMonthData.month + 1).padStart(2, '0')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'GST JSON Downloaded',
      description: `GSTN-compliant ${selectedGstType} for ${selectedMonthData.label} downloaded.`,
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
