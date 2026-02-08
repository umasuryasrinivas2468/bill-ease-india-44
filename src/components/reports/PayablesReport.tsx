
import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { usePurchaseBills, useMarkBillPaid } from '@/hooks/usePurchaseBills';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const PayablesReport: React.FC = () => {
  const { data: bills = [] } = usePurchaseBills();
  const { mutateAsync: markPaid, isPending } = useMarkBillPaid();
  const { toast } = useToast();

  const pending = bills.filter(b => b.status !== 'paid');

  const onMarkPaid = async (billId: string) => {
    await markPaid({ billId });
    toast({
      title: 'Payment Recorded',
      description: 'Bill has been marked as paid.',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounts Payable</CardTitle>
        <CardDescription>Pending vendor payments</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Bill No</TableHead>
                <TableHead>Bill Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((b, idx) => {
                const amountDue = Number(b.total_amount) - Number(b.paid_amount || 0);
                return (
                  <TableRow key={idx}>
                    <TableCell>{b.vendor_name}</TableCell>
                    <TableCell>{b.bill_number}</TableCell>
                    <TableCell>{b.bill_date}</TableCell>
                    <TableCell>{b.due_date}</TableCell>
                    <TableCell className="text-right">₹{amountDue.toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{b.status}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" disabled={isPending} onClick={() => onMarkPaid(b.id)}>
                        Mark Paid
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pending.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No pending payables</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default PayablesReport;
