import React, { useMemo, useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useInventory } from '@/hooks/useInventory';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { postCashMemoJournal } from '@/utils/autoJournalEntry';
import { Plus, Minus, Printer, ShoppingCart } from 'lucide-react';
import { processSalesInventory } from '@/services/inventoryAutomationService';

type CashMemoItem = {
  id: string;
  product_id: string;
  description: string;
  quantity: number;
  rate: number;
  gst_rate: number;
  amount: number;
  uom: string;
};

const makeId = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const emptyItem = (): CashMemoItem => ({
  id: makeId(),
  product_id: '',
  description: '',
  quantity: 1,
  rate: 0,
  gst_rate: 18,
  amount: 0,
  uom: 'pcs',
});

const CashMemo = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const { data: inventoryItems = [], refetch: refetchInventory } = useInventory();

  const initialMemoNumber = `CM-${Date.now().toString().slice(-6)}`;
  const [memoNumber, setMemoNumber] = useState(initialMemoNumber);
  const [memoDate, setMemoDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'card'>('cash');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<CashMemoItem[]>([emptyItem()]);
  const [isSaving, setIsSaving] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any | null>(null);

  const totals = useMemo(() => {
    const taxable = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const gst = items.reduce((sum, item) => sum + ((Number(item.amount || 0) * Number(item.gst_rate || 0)) / 100), 0);
    return {
      taxable,
      gst,
      total: taxable + gst,
    };
  }, [items]);

  const generateMemoNumber = () => {
    const stamp = Date.now().toString().slice(-6);
    setMemoNumber(`CM-${stamp}`);
  };

  const updateItem = (id: string, updates: Partial<CashMemoItem>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const next = { ...item, ...updates };
      next.amount = Number(next.quantity || 0) * Number(next.rate || 0);
      return next;
    }));
  };

  const selectInventoryItem = (id: string, productId: string) => {
    const selected = inventoryItems.find(item => item.id === productId);
    if (!selected) return;
    updateItem(id, {
      product_id: selected.id,
      description: selected.product_name,
      rate: Number(selected.selling_price || 0),
      uom: (selected as any).uom || 'pcs',
      gst_rate: 18,
    });
  };

  const printReceipt = (receipt: any) => {
    const receiptWindow = window.open('', '_blank', 'width=420,height=700');
    if (!receiptWindow) return;

    receiptWindow.document.write(`
      <html>
        <head><title>Cash Memo ${receipt.memoNumber}</title></head>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>Cash Memo</h2>
          <p><strong>Memo#:</strong> ${receipt.memoNumber}</p>
          <p><strong>Date:</strong> ${receipt.memoDate}</p>
          <p><strong>Customer:</strong> ${receipt.customerName}</p>
          <p><strong>Payment Mode:</strong> ${receipt.paymentMode.toUpperCase()}</p>
          <hr />
          ${receipt.items.map((item: any) => `
            <div style="margin-bottom: 12px;">
              <div><strong>${item.description}</strong></div>
              <div>${item.quantity} x ₹${item.rate.toFixed(2)} = ₹${item.amount.toFixed(2)}</div>
            </div>
          `).join('')}
          <hr />
          <p><strong>Taxable:</strong> ₹${receipt.taxable.toFixed(2)}</p>
          <p><strong>GST:</strong> ₹${receipt.gst.toFixed(2)}</p>
          <p><strong>Total:</strong> ₹${receipt.total.toFixed(2)}</p>
          <script>window.print();</script>
        </body>
      </html>
    `);
    receiptWindow.document.close();
  };

  const saveCashMemo = async () => {
    if (!user?.id) return;
    if (!memoNumber.trim()) {
      toast({ title: 'Validation', description: 'Cash memo number is required.', variant: 'destructive' });
      return;
    }

    for (const item of items) {
      if (!item.description || !item.product_id) {
        toast({ title: 'Validation', description: 'Each row must have an inventory item.', variant: 'destructive' });
        return;
      }
      const stockItem = inventoryItems.find(inv => inv.id === item.product_id);
      if (stockItem?.type === 'goods' && Number(stockItem.stock_quantity || 0) < Number(item.quantity || 0)) {
        toast({ title: 'Insufficient Stock', description: `${stockItem.product_name} does not have enough stock.`, variant: 'destructive' });
        return;
      }
    }

    setIsSaving(true);
    try {
      const invoicePayload = {
        user_id: user.id,
        invoice_number: memoNumber,
        client_name: customerName || 'Walk-in Customer',
        client_email: null,
        client_gst_number: null,
        client_address: null,
        amount: totals.taxable,
        gst_amount: totals.gst,
        total_amount: totals.total,
        advance: totals.total,
        discount: 0,
        roundoff: 0,
        gst_rate: 18,
        from_email: user.primaryEmailAddress?.emailAddress || '',
        status: 'paid',
        invoice_date: memoDate,
        due_date: memoDate,
        items: items.map(({ description, quantity, rate, amount, uom, gst_rate }) => ({ description, quantity, rate, amount, uom, gst_rate })),
        items_with_product_id: items,
        notes: `Cash Memo | Payment: ${paymentMode}${notes ? ` | ${notes}` : ''}`,
      };

      const { data: invoice, error: invoiceError } = await supabase.from('invoices').insert([invoicePayload]).select().single();
      if (invoiceError) throw invoiceError;

      await processSalesInventory(user.id, {
        id: invoice.id,
        document_number: memoNumber,
        date: memoDate,
        party_name: customerName || 'Walk-in Customer',
        items,
        source_type: 'cash_memo',
      });

      await postCashMemoJournal(user.id, {
        memo_number: memoNumber,
        date: memoDate,
        customer_name: customerName || 'Walk-in Customer',
        amount: totals.taxable,
        gst_amount: totals.gst,
        total_amount: totals.total,
        payment_mode: paymentMode,
      });

      const receipt = {
        memoNumber,
        memoDate,
        customerName,
        paymentMode,
        items,
        taxable: totals.taxable,
        gst: totals.gst,
        total: totals.total,
      };

      setLastReceipt(receipt);
      refetchInventory();
      toast({ title: 'Success', description: 'Cash memo created, stock updated, and journal posted.' });

      setMemoNumber(`CM-${Date.now().toString().slice(-6)}`);
      setCustomerName('Walk-in Customer');
      setPaymentMode('cash');
      setNotes('');
      setItems([emptyItem()]);
    } catch (error: any) {
      console.error('Error saving cash memo:', error);
      toast({ title: 'Error', description: error.message || 'Failed to save cash memo.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Cash Memo</h1>
            <p className="text-muted-foreground">Instant sale with immediate payment, GST, stock update, and receipt</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateMemoNumber}>Generate Memo#</Button>
          {lastReceipt && (
            <Button variant="outline" onClick={() => printReceipt(lastReceipt)}>
              <Printer className="mr-2 h-4 w-4" />
              Print Last Receipt
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              POS Items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="grid grid-cols-1 gap-3 rounded-lg border p-4 md:grid-cols-6">
                <div className="md:col-span-2">
                  <Label>Inventory Item</Label>
                  <Select value={item.product_id || undefined} onValueChange={(value) => selectInventoryItem(item.id, value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryItems.map(inv => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {inv.product_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Qty</Label>
                  <Input type="number" value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value || 0) })} />
                </div>
                <div>
                  <Label>Rate</Label>
                  <Input type="number" value={item.rate} onChange={(e) => updateItem(item.id, { rate: Number(e.target.value || 0) })} />
                </div>
                <div>
                  <Label>GST %</Label>
                  <Input type="number" value={item.gst_rate} onChange={(e) => updateItem(item.id, { gst_rate: Number(e.target.value || 0) })} />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1 text-sm font-medium">₹{item.amount.toFixed(2)}</div>
                  <Button type="button" variant="outline" size="icon" disabled={items.length === 1} onClick={() => setItems(prev => prev.filter(current => current.id !== item.id))}>
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" onClick={() => setItems(prev => [...prev, emptyItem()])}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sale Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Memo Number</Label>
              <Input value={memoNumber} onChange={(e) => setMemoNumber(e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={memoDate} onChange={(e) => setMemoDate(e.target.value)} />
            </div>
            <div>
              <Label>Customer Name</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <Label>Payment Mode</Label>
              <Select value={paymentMode} onValueChange={(value: 'cash' | 'upi' | 'card') => setPaymentMode(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm"><span>Taxable</span><span>₹{totals.taxable.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span>GST</span><span>₹{totals.gst.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold text-lg"><span>Total</span><span>₹{totals.total.toFixed(2)}</span></div>
            </div>

            <Button className="w-full" onClick={saveCashMemo} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Create Cash Memo'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CashMemo;
