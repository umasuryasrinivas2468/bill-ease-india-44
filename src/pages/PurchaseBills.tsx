import React, { useEffect, useMemo, useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Upload, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { useVendors } from '@/hooks/useVendors';
import { Badge } from '@/components/ui/badge';
import { postPurchaseBillJournal, postVendorPaymentJournal } from '@/utils/autoJournalEntry';

type BillItem = {
  id: string;
  item_details: string;
  account: string;
  quantity: number;
  rate: number;
  tax: number;
  customer_details: string;
  amount: number;
};

type PurchaseBillRecord = {
  id: string;
  vendor_id?: string | null;
  vendor_name: string;
  bill_number: string;
  order_number?: string | null;
  bill_date: string;
  due_date: string;
  payment_terms?: string | null;
  subject?: string | null;
  items: BillItem[];
  amount: number;
  gst_amount: number;
  total_amount: number;
  tcs_amount?: number | null;
  tds_amount?: number | null;
  notes?: string | null;
  bill_attachment_name?: string | null;
  bill_attachment_url?: string | null;
  status?: string | null;
};

type BillMeta = {
  order_number?: string;
  payment_terms?: string;
  subject?: string;
  tcs_amount?: number;
  tds_amount?: number;
  bill_attachment_name?: string;
  bill_attachment_url?: string;
  notes?: string;
};

const META_PREFIX = '__BILL_META__:';
const makeId = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const serializeBillMeta = (meta: BillMeta) => `${META_PREFIX}${JSON.stringify(meta)}`;

const parseBillMeta = (notes?: string | null): BillMeta => {
  if (!notes || !notes.startsWith(META_PREFIX)) {
    return { notes: notes || '' };
  }
  try {
    return JSON.parse(notes.slice(META_PREFIX.length));
  } catch {
    return { notes: '' };
  }
};

const emptyItem = (): BillItem => ({
  id: makeId(),
  item_details: '',
  account: '',
  quantity: 1,
  rate: 0,
  tax: 0,
  customer_details: '',
  amount: 0,
});

const PurchaseBills = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const { data: vendors = [] } = useVendors();
  const [bills, setBills] = useState<PurchaseBillRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    vendor_id: '',
    vendor_name: '',
    bill_number: '',
    order_number: '',
    bill_date: new Date().toISOString().split('T')[0],
    due_date: new Date().toISOString().split('T')[0],
    payment_terms: '',
    subject: '',
    tcs_amount: '',
    tds_amount: '',
    notes: '',
    bill_attachment_name: '',
    bill_attachment_url: '',
  });
  const [items, setItems] = useState<BillItem[]>([emptyItem()]);

  useEffect(() => {
    if (user?.id) {
      fetchBills();
    }
  }, [user]);

  const fetchBills = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_bills' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const hydrated = (data || []).map((bill: any) => {
        const meta = parseBillMeta(bill.notes);
        return {
          ...bill,
          order_number: bill.order_number || meta.order_number || null,
          payment_terms: bill.payment_terms || meta.payment_terms || null,
          subject: bill.subject || meta.subject || null,
          tcs_amount: bill.tcs_amount ?? meta.tcs_amount ?? 0,
          tds_amount: bill.tds_amount ?? meta.tds_amount ?? 0,
          bill_attachment_name: bill.bill_attachment_name || meta.bill_attachment_name || null,
          bill_attachment_url: bill.bill_attachment_url || meta.bill_attachment_url || null,
          notes: meta.notes || '',
        };
      });
      setBills(hydrated as PurchaseBillRecord[]);
    } catch (error) {
      console.error('Error fetching purchase bills:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch bills.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const billTotals = useMemo(() => {
    const amount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const gstAmount = items.reduce((sum, item) => {
      const base = Number(item.quantity || 0) * Number(item.rate || 0);
      return sum + ((base * Number(item.tax || 0)) / 100);
    }, 0);
    const tcsAmount = Number(formData.tcs_amount || 0);
    const tdsAmount = Number(formData.tds_amount || 0);
    return {
      amount,
      gstAmount,
      total: amount + gstAmount + tcsAmount - tdsAmount,
    };
  }, [items, formData.tcs_amount, formData.tds_amount]);

  const resetForm = () => {
    setFormData({
      vendor_id: '',
      vendor_name: '',
      bill_number: '',
      order_number: '',
      bill_date: new Date().toISOString().split('T')[0],
      due_date: new Date().toISOString().split('T')[0],
      payment_terms: '',
      subject: '',
      tcs_amount: '',
      tds_amount: '',
      notes: '',
      bill_attachment_name: '',
      bill_attachment_url: '',
    });
    setItems([emptyItem()]);
    setAttachmentFile(null);
  };

  const handleVendorChange = (vendorId: string) => {
    const vendor = vendors.find(v => v.id === vendorId);
    setFormData(prev => ({
      ...prev,
      vendor_id: vendorId,
      vendor_name: vendor?.name || '',
      payment_terms: String((vendor as any)?.payment_terms || ''),
    }));
  };

  const updateItem = (id: string, field: keyof BillItem, value: string | number) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        const qty = Number(updated.quantity || 0);
        const rate = Number(updated.rate || 0);
        updated.amount = qty * rate;
        return updated;
      })
    );
  };

  const saveBill = async () => {
    if (!user?.id) return;
    if (!formData.vendor_name || !formData.bill_number) {
      toast({ title: 'Validation', description: 'Vendor name and Bill# are required.' });
      return;
    }

    try {
      const meta = serializeBillMeta({
        order_number: formData.order_number || '',
        payment_terms: formData.payment_terms || '',
        subject: formData.subject || '',
        tcs_amount: Number(formData.tcs_amount || 0),
        tds_amount: Number(formData.tds_amount || 0),
        bill_attachment_name: attachmentFile?.name || formData.bill_attachment_name || '',
        bill_attachment_url: formData.bill_attachment_url || '',
        notes: formData.notes || '',
      });

      const payload = {
        user_id: user.id,
        vendor_id: formData.vendor_id || null,
        vendor_name: formData.vendor_name,
        bill_number: formData.bill_number,
        bill_date: formData.bill_date,
        due_date: formData.due_date,
        items,
        amount: billTotals.amount,
        gst_amount: billTotals.gstAmount,
        total_amount: billTotals.total,
        notes: meta,
        status: 'pending',
      };

      const { error } = await supabase.from('purchase_bills' as any).insert([payload]);
      if (error) throw error;

      await postPurchaseBillJournal(user.id, {
        bill_number: formData.bill_number,
        bill_date: formData.bill_date,
        vendor_name: formData.vendor_name,
        amount: billTotals.amount,
        gst_amount: billTotals.gstAmount,
        total_amount: billTotals.total,
      });

      toast({
        title: 'Success',
        description: 'Bill created successfully.',
      });
      setIsDialogOpen(false);
      resetForm();
      fetchBills();
    } catch (error) {
      console.error('Error saving purchase bill:', error);
      toast({
        title: 'Error',
        description: 'Failed to save bill.',
        variant: 'destructive',
      });
    }
  };

  const markAsPaid = async (bill: PurchaseBillRecord) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('purchase_bills' as any)
        .update({
          status: 'paid',
          paid_amount: bill.total_amount,
        })
        .eq('id', bill.id);

      if (error) throw error;

      await postVendorPaymentJournal(user.id, {
        bill_number: bill.bill_number,
        date: new Date().toISOString().split('T')[0],
        vendor_name: bill.vendor_name,
        amount: bill.total_amount,
        payment_mode: 'bank',
      });

      toast({ title: 'Success', description: 'Bill marked as paid.' });
      fetchBills();
    } catch (error) {
      console.error('Error marking bill as paid:', error);
      toast({ title: 'Error', description: 'Failed to mark bill as paid.', variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Bills</h1>
            <p className="text-muted-foreground">Manage vendor bills under purchases</p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              New Bill
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Purchase Bill</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <Label>Vendor Name</Label>
                <Select value={formData.vendor_id || undefined} onValueChange={handleVendorChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(vendor => (
                      <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input className="mt-2" value={formData.vendor_name} onChange={(e) => setFormData(prev => ({ ...prev, vendor_name: e.target.value }))} />
              </div>
              <div>
                <Label>Bill#</Label>
                <Input value={formData.bill_number} onChange={(e) => setFormData(prev => ({ ...prev, bill_number: e.target.value }))} />
              </div>
              <div>
                <Label>Order Number</Label>
                <Input value={formData.order_number} onChange={(e) => setFormData(prev => ({ ...prev, order_number: e.target.value }))} />
              </div>
              <div>
                <Label>Bill Date</Label>
                <Input type="date" value={formData.bill_date} onChange={(e) => setFormData(prev => ({ ...prev, bill_date: e.target.value }))} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={formData.due_date} onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))} />
              </div>
              <div>
                <Label>Payment Terms</Label>
                <Input value={formData.payment_terms} onChange={(e) => setFormData(prev => ({ ...prev, payment_terms: e.target.value }))} placeholder="e.g. Net 15" />
              </div>
              <div className="md:col-span-3">
                <Label>Subject</Label>
                <Input value={formData.subject} onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Item Table</Label>
                <Button type="button" variant="outline" onClick={() => setItems(prev => [...prev, emptyItem()])}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Details</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Tax %</TableHead>
                      <TableHead>Customer Details</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(item => (
                      <TableRow key={item.id}>
                        <TableCell><Input value={item.item_details} onChange={(e) => updateItem(item.id, 'item_details', e.target.value)} /></TableCell>
                        <TableCell><Input value={item.account} onChange={(e) => updateItem(item.id, 'account', e.target.value)} /></TableCell>
                        <TableCell><Input type="number" value={item.quantity} onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value || 0))} /></TableCell>
                        <TableCell><Input type="number" value={item.rate} onChange={(e) => updateItem(item.id, 'rate', Number(e.target.value || 0))} /></TableCell>
                        <TableCell><Input type="number" value={item.tax} onChange={(e) => updateItem(item.id, 'tax', Number(e.target.value || 0))} /></TableCell>
                        <TableCell><Input value={item.customer_details} onChange={(e) => updateItem(item.id, 'customer_details', e.target.value)} /></TableCell>
                        <TableCell className="font-medium">₹{item.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="icon" disabled={items.length === 1} onClick={() => setItems(prev => prev.filter(current => current.id !== item.id))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <Label>TCS</Label>
                <Input type="number" value={formData.tcs_amount} onChange={(e) => setFormData(prev => ({ ...prev, tcs_amount: e.target.value }))} />
              </div>
              <div>
                <Label>TDS</Label>
                <Input type="number" value={formData.tds_amount} onChange={(e) => setFormData(prev => ({ ...prev, tds_amount: e.target.value }))} />
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex justify-between text-sm"><span>Amount</span><span>₹{billTotals.amount.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm"><span>Tax</span><span>₹{billTotals.gstAmount.toFixed(2)}</span></div>
                <div className="mt-2 flex justify-between font-semibold"><span>Total</span><span>₹{billTotals.total.toFixed(2)}</span></div>
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))} rows={3} />
            </div>

            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Bill Attachment Section</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                  />
                </div>
                {attachmentFile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span>{attachmentFile.name}</span>
                  </div>
                )}
                <div>
                  <Label>Attachment URL</Label>
                  <Input
                    value={formData.bill_attachment_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, bill_attachment_url: e.target.value }))}
                    placeholder="Optional file URL"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveBill}>Create Bill</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bills</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading bills...</p>
          ) : bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills created yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Bill#</TableHead>
                    <TableHead>Order Number</TableHead>
                  <TableHead>Bill Date</TableHead>
                  <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map(bill => (
                    <TableRow key={bill.id}>
                      <TableCell>{bill.vendor_name}</TableCell>
                      <TableCell>{bill.bill_number}</TableCell>
                      <TableCell>{bill.order_number || '-'}</TableCell>
                      <TableCell>{bill.bill_date}</TableCell>
                      <TableCell>{bill.due_date}</TableCell>
                      <TableCell>
                        <Badge variant={bill.status === 'paid' ? 'default' : 'secondary'}>
                          {bill.status || 'pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>₹{Number(bill.total_amount || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        {bill.status !== 'paid' ? (
                          <Button size="sm" variant="outline" onClick={() => markAsPaid(bill)}>
                            Mark Paid
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">Completed</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PurchaseBills;
