import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useInvoices } from '@/hooks/useInvoices';
import { Button } from '@/components/ui/button';

const AccountReceivables: React.FC = () => {
  const { data: invoices = [] } = useInvoices();

  const pending = invoices.filter(i => i.status === 'pending' || i.status === 'overdue');

  const sendEmail = (inv: any) => {
    const subject = encodeURIComponent(`Payment Reminder: Invoice ${inv.invoice_number}`);
    const body = encodeURIComponent(`Dear ${inv.client_name},%0D%0A%0D%0AThis is a friendly reminder that Invoice ${inv.invoice_number} dated ${inv.invoice_date} for ₹${Number(inv.total_amount).toLocaleString()} is due on ${inv.due_date}.%0D%0A%0D%0AKindly make the payment at your earliest convenience.%0D%0A%0D%0AThank you.`);
    window.open(`mailto:${inv.client_email || ''}?subject=${subject}&body=${body}`, '_blank');
  };

  const sendWhatsApp = (inv: any) => {
    const text = encodeURIComponent(`Payment Reminder: Invoice ${inv.invoice_number} for ₹${Number(inv.total_amount).toLocaleString()} due on ${inv.due_date}.`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounts Receivable</CardTitle>
        <CardDescription>Pending customer payments</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Invoice No</TableHead>
                <TableHead>Invoice Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((i, idx) => {
                const amountDue = Number(i.total_amount) - Number(i.advance || 0);
                return (
                  <TableRow key={idx}>
                    <TableCell>{i.client_name}</TableCell>
                    <TableCell>{i.invoice_number}</TableCell>
                    <TableCell>{i.invoice_date}</TableCell>
                    <TableCell>{i.due_date}</TableCell>
                    <TableCell className="text-right">₹{amountDue.toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{i.status}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => sendEmail(i)}>Email</Button>
                      <Button size="sm" variant="outline" onClick={() => sendWhatsApp(i)}>WhatsApp</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pending.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No pending receivables</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountReceivables;