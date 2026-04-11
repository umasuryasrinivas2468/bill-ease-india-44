import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePurchaseBills } from '@/hooks/usePurchaseBills';
import { useInvoices } from '@/hooks/useInvoices';
import { useExpenses } from '@/hooks/useExpenses';
import { Download, FileSpreadsheet } from 'lucide-react';
import { DateRangePicker } from '@/components/DateRangePicker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const ITCReport: React.FC = () => {
  const { data: bills = [] } = usePurchaseBills();
  const { data: expenses = [] } = useExpenses();
  const [startDate, setStartDate] = React.useState<Date | undefined>();
  const [endDate, setEndDate] = React.useState<Date | undefined>();

  const inRange = (d: string) => {
    const dt = new Date(d);
    if (startDate && dt < startDate) return false;
    if (endDate && dt > endDate) return false;
    return true;
  };

  const eligibleBills = bills.filter(b => inRange(b.bill_date) && (b as any).itc_eligible !== false);
  const ineligibleBills = bills.filter(b => inRange(b.bill_date) && (b as any).itc_eligible === false);
  const rcmBills = bills.filter(b => inRange(b.bill_date) && (b as any).is_rcm === true && (b as any).itc_eligible !== false);

  const totalITC = eligibleBills.reduce((s, b) => s + Number(b.gst_amount), 0);
  const rcmITC = rcmBills.reduce((s, b) => s + Number(b.gst_amount), 0);
  const ineligibleGST = ineligibleBills.reduce((s, b) => s + Number(b.gst_amount), 0);

  const downloadCSV = () => {
    const rows = [
      ['Bill No', 'Vendor', 'Date', 'Taxable', 'GST', 'ITC Eligible', 'RCM'],
      ...bills.filter(b => inRange(b.bill_date)).map(b => [
        b.bill_number, b.vendor_name, b.bill_date,
        b.amount, b.gst_amount,
        (b as any).itc_eligible !== false ? 'Yes' : 'No',
        (b as any).is_rcm ? 'Yes' : 'No'
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `itc_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <CardTitle>Input Tax Credit (ITC) Report</CardTitle>
          <CardDescription>Track eligible and ineligible ITC from purchase bills</CardDescription>
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
            <div className="text-sm text-muted-foreground">Total ITC Available</div>
            <div className="text-2xl font-bold text-green-600">₹{totalITC.toLocaleString()}</div>
          </div>
          <div className="rounded border p-4">
            <div className="text-sm text-muted-foreground">ITC from RCM</div>
            <div className="text-2xl font-bold text-blue-600">₹{rcmITC.toLocaleString()}</div>
          </div>
          <div className="rounded border p-4">
            <div className="text-sm text-muted-foreground">Ineligible (Added to Cost)</div>
            <div className="text-2xl font-bold text-red-600">₹{ineligibleGST.toLocaleString()}</div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill No</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              <TableHead className="text-right">GST</TableHead>
              <TableHead>ITC</TableHead>
              <TableHead>RCM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.filter(b => inRange(b.bill_date)).map(b => (
              <TableRow key={b.id}>
                <TableCell>{b.bill_number}</TableCell>
                <TableCell>{b.vendor_name}</TableCell>
                <TableCell>{new Date(b.bill_date).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">₹{Number(b.amount).toLocaleString()}</TableCell>
                <TableCell className="text-right">₹{Number(b.gst_amount).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={(b as any).itc_eligible !== false ? 'default' : 'destructive'}>
                    {(b as any).itc_eligible !== false ? 'Eligible' : 'Ineligible'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {(b as any).is_rcm && <Badge variant="outline">RCM</Badge>}
                </TableCell>
              </TableRow>
            ))}
            {bills.filter(b => inRange(b.bill_date)).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No purchase bills found</TableCell>
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

export default ITCReport;
