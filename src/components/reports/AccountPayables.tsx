import React from 'react';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { usePayables, useMarkPayablePaid } from '@/hooks/usePayables';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const AccountPayables: React.FC = () => {
  const { data: payables = [] } = usePayables();
  const { mutateAsync: markPaid, isPending } = useMarkPayablePaid();
  const { toast } = useToast();

  const pending = payables.filter(p => p.status !== 'paid');

  const onMarkPaid = async (payableId: string) => {
    await markPaid({ payableId });
    toast({
      title: 'Payment Recorded',
      description: 'Payable has been marked as paid.',
    });
  };

  return (
    <div className="w-full overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendor</TableHead>
            <TableHead>Bill No</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead className="text-right">Amount Due</TableHead>
            <TableHead className="text-right">Amount Paid</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pending.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{p.vendor_name}</TableCell>
              <TableCell>{p.bill_number || p.related_purchase_order_number || '-'}</TableCell>
              <TableCell>{new Date(p.due_date).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">₹{Number(p.amount_due).toLocaleString()}</TableCell>
              <TableCell className="text-right">₹{Number(p.amount_paid).toLocaleString()}</TableCell>
              <TableCell className="text-right">₹{Number(p.amount_remaining).toLocaleString()}</TableCell>
              <TableCell className="capitalize">{p.status}</TableCell>
              <TableCell>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => onMarkPaid(p.id)}>
                  Mark Paid
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {pending.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No pending payables</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default AccountPayables;