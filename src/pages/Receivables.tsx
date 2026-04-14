
import React, { useState, useMemo } from 'react';
import {
  Search, IndianRupee, ArrowUpRight, Clock, CheckCircle2, AlertCircle,
  Edit, Eye, Download, MapPin, FileText, X, Plus, Minus, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@clerk/clerk-react';
import { WaterPod } from '@/components/ui/WaterPod';
import { useInvoices, useRecordInvoicePayment, Invoice } from '@/hooks/useInvoices';
import InvoiceViewer from '@/components/InvoiceViewer';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

const statusConfig: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', icon: Clock },
  overdue: { label: 'Overdue', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', icon: AlertCircle },
  paid: { label: 'Paid', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', icon: CheckCircle2 },
  partial: { label: 'Partial', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300', icon: ArrowUpRight },
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);

interface EditableItem {
  description: string;
  hsn_sac?: string;
  quantity: number;
  rate: number;
  amount: number;
  uom?: string;
}

export default function Receivables() {
  const { data: invoices = [], isLoading } = useInvoices();
  const recordPayment = useRecordInvoicePayment();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('receivable');

  // View invoice
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Payment dialog
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  // Edit dialog
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [editForm, setEditForm] = useState({
    client_name: '',
    client_email: '',
    client_address: '',
    due_date: '',
    notes: '',
  });
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [editGstRate, setEditGstRate] = useState(18);
  const [isSaving, setIsSaving] = useState(false);

  // Filtered invoices — "receivable" = pending + overdue + partial
  const filteredInvoices = useMemo(() => {
    let filtered = invoices;

    if (statusFilter === 'receivable') {
      filtered = filtered.filter(inv => ['pending', 'overdue', 'partial'].includes(inv.status));
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(inv => inv.status === statusFilter);
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(inv =>
        inv.client_name.toLowerCase().includes(q) ||
        inv.invoice_number.toLowerCase().includes(q) ||
        (inv.client_address || '').toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [invoices, searchTerm, statusFilter]);

  // Summary from all invoices (not filtered)
  const summary = useMemo(() => {
    const receivable = invoices.filter(i => ['pending', 'overdue', 'partial'].includes(i.status));
    const outstanding = receivable.reduce((s, i) => s + (Number(i.total_amount) - Number(i.paid_amount || 0)), 0);
    const overdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + (Number(i.total_amount) - Number(i.paid_amount || 0)), 0);
    const pending = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + (Number(i.total_amount) - Number(i.paid_amount || 0)), 0);
    const paid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount), 0);
    const total = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
    return { total, outstanding, overdue, pending, paid };
  }, [invoices]);

  const totalBase = Math.max(summary.total, 1);
  const overduePercent = (summary.overdue / totalBase) * 100;
  const pendingPercent = (summary.pending / totalBase) * 100;
  const paidPercent = (summary.paid / totalBase) * 100;
  const outstandingPercent = (summary.outstanding / totalBase) * 100;

  const getOverdueDays = (dueDate: string) => {
    const diffDays = Math.ceil((Date.now() - new Date(dueDate).getTime()) / 86400000);
    return diffDays > 0 ? diffDays : 0;
  };

  const getBalanceDue = (inv: Invoice) =>
    Number(inv.total_amount) - Number(inv.paid_amount || 0);

  // ── Payment ──
  const openPaymentDialog = (inv: Invoice) => {
    setPaymentInvoice(inv);
    setPaymentAmount(getBalanceDue(inv).toFixed(2));
  };

  const handleRecordPayment = async () => {
    if (!paymentInvoice) return;
    const amt = Number(paymentAmount);
    const balance = getBalanceDue(paymentInvoice);
    if (!amt || amt <= 0 || amt > balance) {
      toast({ title: 'Invalid amount', description: `Enter a value between ₹1 and ₹${balance.toLocaleString()}`, variant: 'destructive' });
      return;
    }
    await recordPayment.mutateAsync({
      invoiceId: paymentInvoice.id,
      paymentAmount: amt,
      totalAmount: Number(paymentInvoice.total_amount),
    });
    toast({ title: amt >= balance ? 'Invoice marked as Paid' : 'Payment recorded', description: `₹${amt.toLocaleString()} recorded for ${paymentInvoice.invoice_number}` });
    setPaymentInvoice(null);
    setPaymentAmount('');
  };

  // ── Edit ──
  const openEditDialog = (inv: Invoice) => {
    setEditInvoice(inv);
    setEditForm({
      client_name: inv.client_name,
      client_email: inv.client_email || '',
      client_address: inv.client_address || '',
      due_date: inv.due_date,
      notes: inv.notes || '',
    });
    const items = Array.isArray(inv.items) ? inv.items : [];
    setEditItems(items.map((it: any) => ({
      description: it.description || it.product_name || it.name || '',
      hsn_sac: it.hsn_sac || '',
      quantity: Number(it.quantity) || 1,
      rate: Number(it.rate || it.price) || 0,
      amount: Number(it.amount) || (Number(it.quantity) || 1) * (Number(it.rate || it.price) || 0),
      uom: it.uom || 'pcs',
    })));
    setEditGstRate(Number(inv.gst_rate) || 18);
  };

  const updateEditItem = (index: number, field: keyof EditableItem, value: string | number) => {
    const updated = [...editItems];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'quantity' || field === 'rate') {
      updated[index].amount = Number(updated[index].quantity) * Number(updated[index].rate);
    }
    setEditItems(updated);
  };

  const addEditItem = () => {
    setEditItems([...editItems, { description: '', hsn_sac: '', quantity: 1, rate: 0, amount: 0, uom: 'pcs' }]);
  };

  const removeEditItem = (index: number) => {
    if (editItems.length > 1) setEditItems(editItems.filter((_, i) => i !== index));
  };

  const editSubtotal = editItems.reduce((s, it) => s + it.amount, 0);
  const editGstAmount = editSubtotal * (editGstRate / 100);
  const editTotal = editSubtotal + editGstAmount;

  const handleSaveEdit = async () => {
    if (!editInvoice || !user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          client_name: editForm.client_name,
          client_email: editForm.client_email || null,
          client_address: editForm.client_address || null,
          due_date: editForm.due_date,
          notes: editForm.notes || null,
          items: editItems,
          amount: editSubtotal,
          gst_amount: editGstAmount,
          gst_rate: editGstRate,
          total_amount: editTotal,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editInvoice.id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({ title: 'Invoice updated', description: `${editInvoice.invoice_number} updated successfully` });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setEditInvoice(null);
    } catch (err: any) {
      console.error('Error updating invoice:', err);
      toast({ title: 'Error', description: err.message || 'Failed to update invoice', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64 text-muted-foreground">Loading receivables...</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receivables</h1>
        <p className="text-sm text-muted-foreground">Track pending and overdue invoices</p>
      </div>

      {/* Water Pod Summary */}
      <Card className="border border-border">
        <CardContent className="py-8">
          <div className="flex flex-wrap items-end justify-center gap-8 md:gap-12">
            <WaterPod
              label="Outstanding"
              value={fmt(summary.outstanding)}
              subtitle="To be received"
              fillPercent={outstandingPercent}
              color="blue"
              size="lg"
              icon={<IndianRupee className="h-4 w-4 text-blue-600" />}
            />
            <WaterPod
              label="Overdue"
              value={fmt(summary.overdue)}
              subtitle="Past due date"
              fillPercent={overduePercent}
              color="red"
              size="md"
              icon={<AlertCircle className="h-4 w-4 text-red-600" />}
            />
            <WaterPod
              label="Pending"
              value={fmt(summary.pending)}
              subtitle="Not yet due"
              fillPercent={pendingPercent}
              color="amber"
              size="md"
              icon={<Clock className="h-4 w-4 text-amber-600" />}
            />
            <WaterPod
              label="Received"
              value={fmt(summary.paid)}
              subtitle="Already collected"
              fillPercent={paidPercent}
              color="green"
              size="md"
              icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
            />
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search customer, invoice, address..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="receivable">Receivable (Due)</SelectItem>
            <SelectItem value="all">All Invoices</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice Table */}
      <Card className="border border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Invoices ({filteredInvoices.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop Table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Shipping Address</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance Due</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      No invoices found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map(inv => {
                    const cfg = statusConfig[inv.status] || statusConfig.pending;
                    const Icon = cfg.icon;
                    const balance = getBalanceDue(inv);
                    const paidAmt = Number(inv.paid_amount || 0);
                    return (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{inv.invoice_number}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(inv.invoice_date).toLocaleDateString('en-IN')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{inv.client_name}</div>
                          {inv.client_email && <div className="text-xs text-muted-foreground">{inv.client_email}</div>}
                        </TableCell>
                        <TableCell>
                          {inv.client_address ? (
                            <div className="flex items-start gap-1 max-w-[200px]">
                              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground truncate" title={inv.client_address}>
                                {inv.client_address}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{fmt(Number(inv.total_amount))}</TableCell>
                        <TableCell className="text-right">
                          <div className="font-medium">{fmt(balance)}</div>
                          {paidAmt > 0 && (
                            <div className="space-y-0.5 mt-1">
                              <Progress value={(paidAmt / Number(inv.total_amount)) * 100} className="h-1.5 w-20 ml-auto" />
                              <div className="text-xs text-green-600">Paid {fmt(paidAmt)}</div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{new Date(inv.due_date).toLocaleDateString('en-IN')}</div>
                          {inv.status === 'overdue' && (
                            <div className="text-xs text-red-500 font-medium">{getOverdueDays(inv.due_date)}d overdue</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={cfg.cls + ' gap-1'}>
                            <Icon className="h-3 w-3" /> {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" title="View" onClick={() => { setViewInvoice(inv); setIsViewerOpen(true); }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Edit Invoice" onClick={() => openEditDialog(inv)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            {inv.status !== 'paid' && (
                              <Button size="sm" variant="outline" onClick={() => openPaymentDialog(inv)} className="gap-1 border-green-400 text-green-700 hover:bg-green-50">
                                <IndianRupee className="h-3.5 w-3.5" /> Pay
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3 p-4">
            {filteredInvoices.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No invoices found
              </div>
            ) : (
              filteredInvoices.map(inv => {
                const cfg = statusConfig[inv.status] || statusConfig.pending;
                const Icon = cfg.icon;
                const balance = getBalanceDue(inv);
                const paidAmt = Number(inv.paid_amount || 0);
                return (
                  <Card key={inv.id} className="border">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{inv.invoice_number}</div>
                          <div className="text-sm">{inv.client_name}</div>
                          {inv.client_email && <div className="text-xs text-muted-foreground">{inv.client_email}</div>}
                        </div>
                        <Badge className={cfg.cls + ' gap-1'}>
                          <Icon className="h-3 w-3" /> {cfg.label}
                        </Badge>
                      </div>
                      {inv.client_address && (
                        <div className="flex items-start gap-1">
                          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{inv.client_address}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Total:</span>
                          <span className="ml-1 font-medium">{fmt(Number(inv.total_amount))}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Due:</span>
                          <span className="ml-1 font-medium">{fmt(balance)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Due Date:</span>
                          <span className="ml-1">{new Date(inv.due_date).toLocaleDateString('en-IN')}</span>
                        </div>
                        {inv.status === 'overdue' && (
                          <div className="text-red-500 font-medium">{getOverdueDays(inv.due_date)}d overdue</div>
                        )}
                      </div>
                      {paidAmt > 0 && (
                        <div className="space-y-0.5">
                          <Progress value={(paidAmt / Number(inv.total_amount)) * 100} className="h-1.5" />
                          <div className="text-xs text-green-600">Paid {fmt(paidAmt)}</div>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => { setViewInvoice(inv); setIsViewerOpen(true); }}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => openEditDialog(inv)}>
                          <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        {inv.status !== 'paid' && (
                          <Button size="sm" variant="outline" className="flex-1 border-green-400 text-green-700 hover:bg-green-50" onClick={() => openPaymentDialog(inv)}>
                            <IndianRupee className="h-3.5 w-3.5 mr-1" /> Pay
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Invoice Viewer ── */}
      <InvoiceViewer
        invoice={viewInvoice}
        isOpen={isViewerOpen}
        onClose={() => { setIsViewerOpen(false); setViewInvoice(null); }}
      />

      {/* ── Payment Dialog ── */}
      <Dialog open={!!paymentInvoice} onOpenChange={open => { if (!open) { setPaymentInvoice(null); setPaymentAmount(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {paymentInvoice && (() => {
            const total = Number(paymentInvoice.total_amount);
            const paid = Number(paymentInvoice.paid_amount || 0);
            const balance = total - paid;
            const pct = Math.min((paid / total) * 100, 100);
            return (
              <div className="space-y-4 py-2">
                <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-medium">{paymentInvoice.invoice_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Client</span><span>{paymentInvoice.client_name}</span></div>
                  <div className="flex justify-between font-medium"><span className="text-muted-foreground">Invoice Total</span><span>{fmt(total)}</span></div>
                  {paid > 0 && (
                    <>
                      <div className="flex justify-between text-green-700"><span>Already Paid</span><span>{fmt(paid)}</span></div>
                      <Progress value={pct} className="h-2 mt-1" />
                    </>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                    <span>Balance Due</span><span className="text-orange-600">{fmt(balance)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payAmt">Payment Amount</Label>
                  <Input id="payAmt" type="number" step="0.01" min="0.01" max={balance} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder={`Max ${fmt(balance)}`} />
                  <div className="flex gap-2 pt-1">
                    <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => setPaymentAmount((balance / 2).toFixed(2))}>50%</Button>
                    <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => setPaymentAmount(balance.toFixed(2))}>Full</Button>
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPaymentInvoice(null); setPaymentAmount(''); }}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={recordPayment.isPending}>
              {recordPayment.isPending ? 'Saving...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Invoice Dialog ── */}
      <Dialog open={!!editInvoice} onOpenChange={open => { if (!open) setEditInvoice(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Invoice {editInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {editInvoice && (
            <div className="space-y-5">
              {/* Client details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Customer Name</Label>
                  <Input value={editForm.client_name} onChange={e => setEditForm({ ...editForm, client_name: e.target.value })} />
                </div>
                <div>
                  <Label>Customer Email</Label>
                  <Input type="email" value={editForm.client_email} onChange={e => setEditForm({ ...editForm, client_email: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> Shipping Address
                  </Label>
                  <Textarea
                    value={editForm.client_address}
                    onChange={e => setEditForm({ ...editForm, client_address: e.target.value })}
                    rows={2}
                    placeholder="Enter shipping / delivery address"
                  />
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input type="date" value={editForm.due_date} onChange={e => setEditForm({ ...editForm, due_date: e.target.value })} />
                </div>
                <div>
                  <Label>GST Rate (%)</Label>
                  <Input type="number" min="0" max="100" value={editGstRate} onChange={e => setEditGstRate(Number(e.target.value) || 0)} />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <Label className="mb-2 block">Line Items</Label>
                <div className="space-y-2">
                  {editItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 border rounded">
                      <div className="col-span-4">
                        <Input placeholder="Description" value={item.description} onChange={e => updateEditItem(idx, 'description', e.target.value)} />
                      </div>
                      <div className="col-span-1">
                        <Input type="number" placeholder="Qty" min="1" value={item.quantity} onChange={e => updateEditItem(idx, 'quantity', parseInt(e.target.value) || 1)} />
                      </div>
                      <div className="col-span-3">
                        <Input type="number" placeholder="Rate" min="0" step="0.01" value={item.rate} onChange={e => updateEditItem(idx, 'rate', parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="col-span-3 text-right font-medium text-sm">
                        {fmt(item.amount)}
                      </div>
                      <div className="col-span-1 text-right">
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeEditItem(idx)} disabled={editItems.length === 1}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-2 gap-1" onClick={addEditItem}>
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </Button>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <Card className="w-64">
                  <CardContent className="p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span>Subtotal</span><span>{fmt(editSubtotal)}</span></div>
                    <div className="flex justify-between"><span>GST ({editGstRate}%)</span><span>{fmt(editGstAmount)}</span></div>
                    <div className="flex justify-between font-bold border-t pt-2"><span>Total</span><span>{fmt(editTotal)}</span></div>
                  </CardContent>
                </Card>
              </div>

              {/* Notes */}
              <div>
                <Label>Notes</Label>
                <Textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditInvoice(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isSaving} className="gap-1">
              <Save className="h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
