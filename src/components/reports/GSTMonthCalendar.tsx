import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Calendar, FileJson } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { useBusinessData } from '@/hooks/useBusinessData';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface MonthData {
  year: number;
  month: number;
  label: string;
  shortLabel: string;
  hasData: boolean;
  invoiceCount: number;
  totalSales: number;
  cgst: number;
  sgst: number;
  totalGst: number;
}

const GSTMonthCalendar = () => {
  const { data: invoices = [] } = useInvoices();
  const { getBusinessInfo } = useBusinessData();
  const { toast } = useToast();
  const businessInfo = getBusinessInfo();

  // Get the first invoice date and generate months from then to current
  const monthsData = useMemo(() => {
    if (invoices.length === 0) return [];

    // Find the earliest invoice date
    const dates = invoices.map(inv => new Date(inv.invoice_date));
    const earliestDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const currentDate = new Date();

    // Generate all months from earliest to current
    const months: MonthData[] = [];
    const startYear = earliestDate.getFullYear();
    const startMonth = earliestDate.getMonth();
    const endYear = currentDate.getFullYear();
    const endMonth = currentDate.getMonth();

    for (let year = startYear; year <= endYear; year++) {
      const monthStart = year === startYear ? startMonth : 0;
      const monthEnd = year === endYear ? endMonth : 11;

      for (let month = monthStart; month <= monthEnd; month++) {
        const monthInvoices = invoices.filter(inv => {
          const invDate = new Date(inv.invoice_date);
          return invDate.getFullYear() === year && invDate.getMonth() === month;
        });

        const totalSales = monthInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
        const totalGst = monthInvoices.reduce((sum, inv) => sum + Number(inv.gst_amount || 0), 0);

        months.push({
          year,
          month,
          label: new Date(year, month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
          shortLabel: new Date(year, month).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
          hasData: monthInvoices.length > 0,
          invoiceCount: monthInvoices.length,
          totalSales,
          cgst: Math.round(totalGst * 0.5),
          sgst: Math.round(totalGst * 0.5),
          totalGst,
        });
      }
    }

    return months;
  }, [invoices]);

  const downloadGSTJson = (monthData: MonthData) => {
    const monthInvoices = invoices.filter(inv => {
      const invDate = new Date(inv.invoice_date);
      return invDate.getFullYear() === monthData.year && invDate.getMonth() === monthData.month;
    });

    const gstJson = {
      gstin: businessInfo?.gstNumber || 'NOT_CONFIGURED',
      business_name: businessInfo?.businessName || 'Business Name',
      filing_period: {
        month: monthData.month + 1,
        year: monthData.year,
        label: monthData.label,
      },
      summary: {
        total_invoices: monthData.invoiceCount,
        total_taxable_value: Math.round(monthData.totalSales - monthData.totalGst),
        cgst: monthData.cgst,
        sgst: monthData.sgst,
        igst: 0,
        total_gst: monthData.totalGst,
        total_invoice_value: Math.round(monthData.totalSales),
      },
      invoices: monthInvoices.map(inv => ({
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
      generated_at: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(gstJson, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `GST_${monthData.year}_${String(monthData.month + 1).padStart(2, '0')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'GST JSON Downloaded',
      description: `GST data for ${monthData.label} has been downloaded.`,
    });
  };

  if (invoices.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No invoices found. Create your first invoice to see the GST calendar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Calendar className="h-4 w-4" />
        <span>
          Showing months from your first invoice ({monthsData[0]?.label}) to current month
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {monthsData.map((monthData) => (
          <div
            key={`${monthData.year}-${monthData.month}`}
            className={cn(
              'relative rounded-lg border p-3 transition-all',
              monthData.hasData
                ? 'bg-card hover:shadow-md border-primary/20 hover:border-primary/40'
                : 'bg-muted/30 opacity-60 cursor-not-allowed'
            )}
          >
            <div className="text-sm font-medium mb-2">{monthData.shortLabel}</div>
            
            {monthData.hasData ? (
              <>
                <div className="space-y-1 text-xs mb-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Invoices:</span>
                    <span className="font-medium">{monthData.invoiceCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GST:</span>
                    <span className="font-medium text-green-600">₹{monthData.totalGst.toLocaleString()}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs h-7"
                  onClick={() => downloadGSTJson(monthData)}
                >
                  <FileJson className="h-3 w-3 mr-1" />
                  JSON
                </Button>
              </>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-3">
                No data
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-4 pt-4 border-t">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-primary/20 border border-primary/40" />
          <span>Active (has invoices)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-muted/30 border" />
          <span>Inactive (no invoices)</span>
        </div>
      </div>
    </div>
  );
};

export default GSTMonthCalendar;
