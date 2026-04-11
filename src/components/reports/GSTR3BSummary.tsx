
import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useInvoices } from '@/hooks/useInvoices';
import { usePurchaseBills } from '@/hooks/usePurchaseBills';
import { useCreditNotes } from '@/hooks/useCreditNotes';
import { useDebitNotes } from '@/hooks/useDebitNotes';
import { Download, FileSpreadsheet } from 'lucide-react';
import { DateRangePicker } from '@/components/DateRangePicker';

type GSTRSummary = {
  outwardTaxable: number;
  outwardGST: number;
  inwardTaxable: number;
  inwardGST: number;
  reverseCharge: number;
  exempted: number;
  nilRated: number;
  nonGST: number;
  taxLiability: number;
  itcAvailable: number;
};

const GSTR3BSummary: React.FC = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: bills = [] } = usePurchaseBills();
  const { data: creditNotes = [] } = useCreditNotes();
  const { data: debitNotes = [] } = useDebitNotes();

  const [startDate, setStartDate] = React.useState<Date | undefined>();
  const [endDate, setEndDate] = React.useState<Date | undefined>();

  const summary: GSTRSummary = React.useMemo(() => {
    const inRange = (d: string) => {
      const dt = new Date(d);
      if (startDate && dt < startDate) return false;
      if (endDate && dt > endDate) return false;
      return true;
    };

    const inv = invoices.filter(i => inRange(i.invoice_date));
    const cns = creditNotes.filter(cn => inRange(cn.credit_note_date) && cn.status !== 'cancelled');
    const pbs = bills.filter(b => inRange(b.bill_date));
    const dns = debitNotes.filter(dn => inRange(dn.debit_note_date) && dn.status !== 'cancelled');

    const outwardTaxableRaw = inv.reduce((s, i) => s + Number(i.amount), 0);
    const outwardGSTRaw = inv.reduce((s, i) => s + Number(i.gst_amount), 0);
    const cnTaxable = cns.reduce((s, n) => s + Number(n.amount), 0);
    const cnGST = cns.reduce((s, n) => s + Number(n.gst_amount), 0);

    const inwardTaxableRaw = pbs.reduce((s, b) => s + Number(b.amount), 0);
    const inwardGSTRaw = pbs.reduce((s, b) => s + Number(b.gst_amount), 0);
    const dnTaxable = dns.reduce((s, n) => s + Number(n.amount), 0);
    const dnGST = dns.reduce((s, n) => s + Number(n.gst_amount), 0);

    const outwardTaxable = Math.max(0, outwardTaxableRaw - cnTaxable);
    const outwardGST = Math.max(0, outwardGSTRaw - cnGST);

    const inwardTaxable = Math.max(0, inwardTaxableRaw - dnTaxable);
    const inwardGST = Math.max(0, inwardGSTRaw - dnGST);

    const reverseCharge = 0;
    const exempted = 0;
    const nilRated = 0;
    const nonGST = 0;

    const taxLiability = outwardGST;
    const itcAvailable = inwardGST;

    return { outwardTaxable, outwardGST, inwardTaxable, inwardGST, reverseCharge, exempted, nilRated, nonGST, taxLiability, itcAvailable };
  }, [invoices, bills, creditNotes, debitNotes, startDate, endDate]);

  const downloadJSON = () => {
    const payload = {
      returnType: 'GSTR-3B',
      period: {
        start: startDate ? startDate.toISOString().split('T')[0] : null,
        end: endDate ? endDate.toISOString().split('T')[0] : null,
      },
      sections: {
        outward_supplies: {
          taxable_value: summary.outwardTaxable,
          gst: summary.outwardGST,
        },
        inward_supplies_itc: {
          taxable_value: summary.inwardTaxable,
          gst: summary.inwardGST,
        },
        reverse_charge: summary.reverseCharge,
        exempted: summary.exempted,
        nil_rated: summary.nilRated,
        non_gst: summary.nonGST,
        tax_liability: summary.taxLiability,
        itc_available: summary.itcAvailable,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gstr3b_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const downloadCSV = () => {
    const rows = [
      ['Section', 'Taxable', 'GST'],
      ['Outward Supplies', summary.outwardTaxable, summary.outwardGST],
      ['Inward Supplies (ITC)', summary.inwardTaxable, summary.inwardGST],
      ['Reverse Charge', '', summary.reverseCharge],
      ['Exempted', summary.exempted, ''],
      ['Nil-rated', summary.nilRated, ''],
      ['Non-GST', summary.nonGST, ''],
      ['Tax Liability', '', summary.taxLiability],
      ['ITC Available', '', summary.itcAvailable],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gstr3b_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <CardTitle>GSTR-3B Summary</CardTitle>
          <CardDescription>Auto-generated summary grouped by GST sections</CardDescription>
        </div>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={({ startDate: s, endDate: e }) => {
            setStartDate(s);
            setEndDate(e);
          }}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded border p-4">
            <div className="font-medium mb-2">Outward Supplies (Sales)</div>
            <div className="text-sm flex justify-between"><span>Taxable Value</span><span>₹{summary.outwardTaxable.toLocaleString()}</span></div>
            <div className="text-sm flex justify-between"><span>GST</span><span>₹{summary.outwardGST.toLocaleString()}</span></div>
          </div>
          <div className="rounded border p-4">
            <div className="font-medium mb-2">Inward Supplies (ITC)</div>
            <div className="text-sm flex justify-between"><span>Taxable Value</span><span>₹{summary.inwardTaxable.toLocaleString()}</span></div>
            <div className="text-sm flex justify-between"><span>GST</span><span>₹{summary.inwardGST.toLocaleString()}</span></div>
          </div>
          <div className="rounded border p-4">
            <div className="font-medium mb-2">Other</div>
            <div className="text-sm flex justify-between"><span>Reverse Charge</span><span>₹{summary.reverseCharge.toLocaleString()}</span></div>
            <div className="text-sm flex justify-between"><span>Exempted</span><span>₹{summary.exempted.toLocaleString()}</span></div>
            <div className="text-sm flex justify-between"><span>Nil-rated</span><span>₹{summary.nilRated.toLocaleString()}</span></div>
            <div className="text-sm flex justify-between"><span>Non-GST</span><span>₹{summary.nonGST.toLocaleString()}</span></div>
          </div>
          <div className="rounded border p-4">
            <div className="font-medium mb-2">Summary</div>
            <div className="text-sm flex justify-between"><span>Tax Liability</span><span>₹{summary.taxLiability.toLocaleString()}</span></div>
            <div className="text-sm flex justify-between"><span>ITC Available</span><span>₹{summary.itcAvailable.toLocaleString()}</span></div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadCSV}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" onClick={downloadJSON}>
            <Download className="h-4 w-4 mr-2" />
            JSON
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default GSTR3BSummary;
