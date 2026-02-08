
import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useCreditNotes } from '@/hooks/useCreditNotes';
import { useDebitNotes } from '@/hooks/useDebitNotes';

const CreditDebitNotesSection: React.FC = () => {
  const { data: creditNotes = [] } = useCreditNotes();
  const { data: debitNotes = [] } = useDebitNotes();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Credit Notes</CardTitle>
          <CardDescription>Reductions to receivables linked to original invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CN No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditNotes.map((n, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{n.credit_note_number}</TableCell>
                    <TableCell>{n.credit_note_date}</TableCell>
                    <TableCell>{n.client_name}</TableCell>
                    <TableCell className="truncate max-w-[140px]">{n.original_invoice_id || '-'}</TableCell>
                    <TableCell className="text-right">₹{Number(n.amount).toLocaleString()}</TableCell>
                    <TableCell className="text-right">₹{Number(n.gst_amount).toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{n.status}</TableCell>
                  </TableRow>
                ))}
                {creditNotes.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No credit notes</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Debit Notes</CardTitle>
          <CardDescription>Reductions to payables linked to original bills</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DN No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Bill ID</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {debitNotes.map((n, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{n.debit_note_number}</TableCell>
                    <TableCell>{n.debit_note_date}</TableCell>
                    <TableCell>{n.vendor_name}</TableCell>
                    <TableCell className="truncate max-w-[140px]">{n.original_invoice_id || '-'}</TableCell>
                    <TableCell className="text-right">₹{Number(n.amount).toLocaleString()}</TableCell>
                    <TableCell className="text-right">₹{Number(n.gst_amount).toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{n.status}</TableCell>
                  </TableRow>
                ))}
                {debitNotes.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No debit notes</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditDebitNotesSection;
