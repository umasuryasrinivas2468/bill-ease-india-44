import React, { useMemo, useState } from 'react';
import { useInvoices, Invoice } from '@/hooks/useInvoices';
import InvoiceViewer from '@/components/InvoiceViewer';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

const WorkingCapital: React.FC = () => {
  const { data: invoices, isLoading } = useInvoices();
  const pendingInvoices = useMemo(() => (invoices || []).filter(i => i.status === 'pending' || i.status === 'overdue'), [invoices]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [appliedMap, setAppliedMap] = useState<Record<string, boolean>>({});
  const { user } = useUser();
  const { toast } = useToast();

  const applyMutation = useMutation({
    mutationFn: async (invoice: Invoice) => {
      if (!user) throw new Error('Not authenticated');
      const payload = {
        invoice_id: invoice.id,
        user_id: user.id,
        amount: invoice.total_amount,
        status: 'applied',
        created_at: new Date().toISOString(),
      } as any;

      const { data, error } = await supabase
        .from('trade_invoice_applications')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error('Apply for trade error:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (_data, invoice) => {
      // `invoice` is the variables passed to mutate
      setAppliedMap(prev => ({ ...prev, [invoice.id]: true }));
      toast({ title: 'Application submitted', description: `Applied for invoice ${invoice.invoice_number}` });
    },
    onError: (err: any) => {
      toast({ title: 'Apply failed', description: String(err.message || err), variant: 'destructive' });
    }
  });

  const handleApply = (invoice: Invoice) => {
    if (appliedMap[invoice.id]) return;
    applyMutation.mutate(invoice);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Working Capital</h1>
        <p className="text-sm text-muted-foreground">Apply for trade invoice financing on pending invoices</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-8">
          <div className="bg-card p-4 rounded-md">
            <h2 className="font-medium mb-4">Pending Invoices</h2>
            {isLoading ? (
              <p>Loading...</p>
            ) : pendingInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invoices found.</p>
            ) : (
              <table className="w-full table-auto border-collapse">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="py-2">Invoice #</th>
                    <th>Client</th>
                    <th>Due</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvoices.map(inv => (
                    <tr key={inv.id} className="border-t">
                      <td className="py-3">{inv.invoice_number}</td>
                      <td>{inv.client_name}</td>
                      <td>{new Date(inv.due_date).toLocaleDateString()}</td>
                      <td className="text-right">₹{Number(inv.total_amount).toFixed(2)}</td>
                      <td className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedInvoice(inv)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="col-span-4">
          <div className="bg-card p-4 rounded-md sticky top-6">
            <h3 className="font-medium mb-2">Selected Invoice</h3>
            {!selectedInvoice ? (
              <p className="text-sm text-muted-foreground">Click an invoice to view details and apply.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">Invoice</div>
                  <div className="font-semibold">{selectedInvoice.invoice_number}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Client</div>
                  <div className="font-semibold">{selectedInvoice.client_name}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Amount</div>
                  <div className="font-semibold">₹{Number(selectedInvoice.total_amount).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="font-semibold">{selectedInvoice.status}</div>
                </div>

                <div className="pt-2">
                  {appliedMap[selectedInvoice.id] ? (
                    <div className="text-sm text-green-600 font-medium">Applied — awaiting verification</div>
                  ) : (
                    <Button onClick={() => handleApply(selectedInvoice)} disabled={applyMutation.isPending}>
                      {applyMutation.isPending ? 'Applying...' : 'Apply for Trade Invoice'}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <InvoiceViewer invoice={selectedInvoice} isOpen={!!selectedInvoice} onClose={() => setSelectedInvoice(null)} />
    </div>
  );
};

export default WorkingCapital;
