import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useInvoices } from '@/hooks/useInvoices';
import { usePurchaseBills } from '@/hooks/usePurchaseBills';
import { useCreditNotes } from '@/hooks/useCreditNotes';
import { useDebitNotes } from '@/hooks/useDebitNotes';
import { Download, FileSpreadsheet } from 'lucide-react';
import { DateRangePicker } from '@/components/DateRangePicker';

const GSTSummaryReport: React.FC = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: bills = [] } = usePurchaseBills();
  const { data: creditNotes = [] } = useCreditNotes();
  const { data: debitNotes = [] } = useDebitNotes();
  const [startDate, setStartDate] = React.useState<Date | undefined>();
  const [endDate, setEndDate] = React.useState<Date | undefined>();

  const inRange = (d: string) => {
    const dt = new Date(d);
    if (startDate && dt < startDate) return false;
    if (endDate && dt > endDate) return false;
    return true;
  };

  const summary = React.useMemo(() => {
    const inv = invoices.filter(i => inRange(i.invoice_date));
    const cns = creditNotes.filter(cn => inRange(cn.credit_note_date) && cn.status !== 'cancelled');
    const pbs = bills.filter(b => inRange(b.bill_date));
    const dns = debitNotes.filter(dn => inRange(dn.debit_note_date) && dn.status !== 'cancelled');

    const outputGST = Math.max(0,
      inv.reduce((s, i) => s + Number(i.gst_amount), 0) -
      cns.reduce((s, n) => s + Number(n.gst_amount), 0)
    );

    const eligibleBills = pbs.filter(b => (b as any).itc_eligible !== false);
    const ineligibleBills = pbs.filter(b => (b as any).itc_eligible === false);
    const rcmBills = pbs.filter(b => (b as any).is_rcm === true);

    const inputGST = Math.max(0,
      eligibleBills.reduce((s, b) => s + Number(b.gst_amount), 0) -
      dns.reduce((s, n) => s + Number(n.gst_amount), 0)
    );

    const rcmGST = rcmBills.reduce((s, b) => s + Number(b.gst_amount), 0);
    const ineligibleGST = ineligibleBills.reduce((s, b) => s + Number(b.gst_amount), 0);
    const gstPayable = outputGST - inputGST + rcmGST;

    return { outputGST, inputGST, rcmGST, ineligibleGST, gstPayable };
  }, [invoices, bills, creditNotes, debitNotes, startDate, endDate]);

  const downloadCSV = () => {
    const rows = [
      ['Description', 'Amount'],
      ['Output GST (Sales)', summary.outputGST],
      ['Input GST (ITC)', summary.inputGST],
      ['RCM Liability', summary.rcmGST],
      ['Ineligible ITC (added to cost)', summary.ineligibleGST],
      ['Net GST Payable', summary.gstPayable],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gst_summary_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <CardTitle>GST Summary</CardTitle>
          <CardDescription>Output GST – Input GST = Net GST Payable (including RCM)</CardDescription>
        </div>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={({ startDate: s, endDate: e }) => { setStartDate(s); setEndDate(e); }}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded border p-4 space-y-3">
            <div className="font-medium text-lg">Output (Liability)</div>
            <div className="flex justify-between text-sm">
              <span>Output GST (Sales)</span>
              <span className="font-semibold">₹{summary.outputGST.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>RCM Liability</span>
              <span className="font-semibold">₹{summary.rcmGST.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2 font-bold">
              <span>Total Output</span>
              <span>₹{(summary.outputGST + summary.rcmGST).toLocaleString()}</span>
            </div>
          </div>
          <div className="rounded border p-4 space-y-3">
            <div className="font-medium text-lg">Input (Credit)</div>
            <div className="flex justify-between text-sm">
              <span>Input GST (ITC Eligible)</span>
              <span className="font-semibold text-green-600">₹{summary.inputGST.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Ineligible ITC (added to cost)</span>
              <span className="font-semibold text-red-600">₹{summary.ineligibleGST.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2 font-bold">
              <span>Total ITC Claimed</span>
              <span>₹{summary.inputGST.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="rounded border p-6 bg-muted/30">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-lg font-bold">Net GST Payable</div>
              <div className="text-sm text-muted-foreground">Output GST + RCM – Input ITC</div>
            </div>
            <div className={`text-3xl font-bold ${summary.gstPayable >= 0 ? 'text-red-600' : 'text-green-600'}`}>
              ₹{Math.abs(summary.gstPayable).toLocaleString()}
              {summary.gstPayable < 0 && <span className="text-sm ml-1">(Refund)</span>}
            </div>
          </div>
        </div>

        <Button variant="outline" onClick={downloadCSV}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Download CSV
        </Button>
      </CardContent>
    </Card>
  );
};

export default GSTSummaryReport;
