
import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useInvoices } from '@/hooks/useInvoices';
import { usePurchaseBills } from '@/hooks/usePurchaseBills';

type AgingBucket = '0-30' | '31-60' | '61-90' | '>90';

const bucketize = (days: number): AgingBucket => {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '>90';
};

const AgingReports: React.FC = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: bills = [] } = usePurchaseBills();

  const today = new Date();

  const customerRows = React.useMemo(() => {
    const pending = invoices.filter(i => i.status === 'pending' || i.status === 'overdue');
    return pending.map(i => {
      const dueDays = Math.ceil((today.getTime() - new Date(i.due_date).getTime()) / (1000 * 60 * 60 * 24));
      const amountDue = Number(i.total_amount) - Number(i.advance || 0 || 0);
      return {
        name: i.client_name,
        invoiceNo: i.invoice_number,
        dueDate: i.due_date,
        amount: amountDue,
        bucket: bucketize(Math.max(0, dueDays)),
      };
    });
  }, [invoices, today]);

  const vendorRows = React.useMemo(() => {
    const pending = bills.filter(b => b.status !== 'paid');
    return pending.map(b => {
      const dueDays = Math.ceil((today.getTime() - new Date(b.due_date).getTime()) / (1000 * 60 * 60 * 24));
      const amountDue = Number(b.total_amount) - Number(b.paid_amount || 0);
      return {
        name: b.vendor_name,
        invoiceNo: b.bill_number,
        dueDate: b.due_date,
        amount: amountDue,
        bucket: bucketize(Math.max(0, dueDays)),
      };
    });
  }, [bills, today]);

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Customer Aging</CardTitle>
          <CardDescription>Pending receivables grouped by aging buckets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Aging Bucket</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerRows.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.invoiceNo}</TableCell>
                    <TableCell>{r.dueDate}</TableCell>
                    <TableCell className="text-right">₹{r.amount.toLocaleString()}</TableCell>
                    <TableCell>{r.bucket}</TableCell>
                  </TableRow>
                ))}
                {customerRows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No pending receivables</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendor Aging</CardTitle>
          <CardDescription>Pending payables grouped by aging buckets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Bill No</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Aging Bucket</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendorRows.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.invoiceNo}</TableCell>
                    <TableCell>{r.dueDate}</TableCell>
                    <TableCell className="text-right">₹{r.amount.toLocaleString()}</TableCell>
                    <TableCell>{r.bucket}</TableCell>
                  </TableRow>
                ))}
                {vendorRows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No pending payables</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgingReports;
