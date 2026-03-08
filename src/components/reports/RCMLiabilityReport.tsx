import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePurchaseBills } from '@/hooks/usePurchaseBills';
import { Download, FileSpreadsheet } from 'lucide-react';
import { DateRangePicker } from '@/components/DateRangePicker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const RCMLiabilityReport: React.FC = () => {
  const { data: bills = [] } = usePurchaseBills();
  const [startDate, setStartDate] = React.useState<Date | undefined>();
  const [endDate, setEndDate] = React.useState<Date | undefined>();

  const inRange = (d: string) => {
    const dt = new Date(d);
    if (startDate && dt < startDate) return false;
    if (endDate && dt > endDate) return false;
    return true;
  };

  const rcmBills = bills.filter(b => inRange(b.bill_date) && (b as any).is_rcm === true);
  const totalRCMTaxable = rcmBills.reduce((s, b) => s + Number(b.amount), 0);
  const totalRCMGST = rcmBills.reduce((s, b) => s + Number(b.gst_amount), 0);
  const paidBills = rcmBills.filter(b => b.status === 'paid');
  const pendingBills = rcmBills.filter(b => b.status !== 'paid');
  const paidGST = paidBills.reduce((s, b) => s + Number(b.gst_amount), 0);
  const pendingGST = pendingBills.reduce((s, b) => s + Number(b.gst_amount), 0);

  const downloadCSV = () => {
    const rows = [
      ['Bill No', 'Vendor', 'Date', 'Taxable', 'RCM GST', 'Status'],
      ...rcmBills.map(b => [b.bill_number, b.vendor_name, b.bill_date, b.amount, b.gst_amount, b.status])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rcm_liability_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <CardTitle>Reverse Charge (RCM) Liability Report</CardTitle>
          <CardDescription>Track GST liability under Reverse Charge Mechanism</CardDescription>
        </div>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={({ startDate: s, endDate: e }) => { setStartDate(s); setEndDate(e); }}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded border p-4">
            <div className="text-sm text-muted-foreground">Total RCM Liability</div>
            <div className="text-2xl font-bold">₹{totalRCMGST.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">on ₹{totalRCMTaxable.toLocaleString()} taxable</div>
          </div>
          <div className="rounded border p-4">
            <div className="text-sm text-muted-foreground">RCM Paid</div>
            <div className="text-2xl font-bold text-green-600">₹{paidGST.toLocaleString()}</div>
          </div>
          <div className="rounded border p-4">
            <div className="text-sm text-muted-foreground">RCM Pending</div>
            <div className="text-2xl font-bold text-orange-600">₹{pendingGST.toLocaleString()}</div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill No</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Taxable Value</TableHead>
              <TableHead className="text-right">RCM GST</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rcmBills.map(b => (
              <TableRow key={b.id}>
                <TableCell>{b.bill_number}</TableCell>
                <TableCell>{b.vendor_name}</TableCell>
                <TableCell>{new Date(b.bill_date).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">₹{Number(b.amount).toLocaleString()}</TableCell>
                <TableCell className="text-right">₹{Number(b.gst_amount).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={b.status === 'paid' ? 'default' : 'outline'}>
                    {b.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {rcmBills.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No RCM transactions found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Button variant="outline" onClick={downloadCSV}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Download CSV
        </Button>
      </CardContent>
    </Card>
  );
};

export default RCMLiabilityReport;
