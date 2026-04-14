import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Textarea } from '@/components/ui/textarea';
import { Search, Plus, Download, Eye, FileText, Trash2, Send, Upload, IndianRupee, Edit, MapPin, X, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useInvoices, useDeleteInvoice, useRecordInvoicePayment, Invoice } from '@/hooks/useInvoices';
import InvoiceViewer from '@/components/InvoiceViewer';
import SendDocumentDialog from '@/components/SendDocumentDialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import ImportDialog from '@/components/ImportDialog';
import { normalizeUserId } from '@/lib/userUtils';

const Invoices = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [invoiceToSend, setInvoiceToSend] = useState<Invoice | null>(null);
  // Partial payment state
  const [paymentDialogInvoice, setPaymentDialogInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const { data: invoices = [], isLoading } = useInvoices();
  const deleteInvoice = useDeleteInvoice();
  const recordPayment = useRecordInvoicePayment();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [editForm, setEditForm] = useState({
    client_name: '',
    client_email: '',
    client_address: '',
    due_date: '',
    notes: '',
  });
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editGstRate, setEditGstRate] = useState(18);
  const [isSaving, setIsSaving] = useState(false);

  const handleSendInvoice = (invoice: Invoice) => {
    setInvoiceToSend(invoice);
    setIsSendDialogOpen(true);
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
      case 'partial':
        return <Badge className="bg-blue-100 text-blue-800">Partial</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'overdue':
        return <Badge className="bg-red-100 text-red-800">Overdue</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const openPaymentDialog = (invoice: Invoice) => {
    setPaymentDialogInvoice(invoice);
    const balance = Number(invoice.total_amount) - Number(invoice.paid_amount || 0);
    setPaymentAmount(balance.toFixed(2));
  };

  const handleRecordPayment = async () => {
    if (!paymentDialogInvoice) return;
    const amt = Number(paymentAmount);
    const balance = Number(paymentDialogInvoice.total_amount) - Number(paymentDialogInvoice.paid_amount || 0);
    if (!amt || amt <= 0 || amt > balance) {
      toast({ title: 'Invalid amount', description: `Enter a value between ₹1 and ₹${balance.toLocaleString()}`, variant: 'destructive' });
      return;
    }
    await recordPayment.mutateAsync({
      invoiceId: paymentDialogInvoice.id,
      paymentAmount: amt,
      totalAmount: Number(paymentDialogInvoice.total_amount),
    });
    toast({ title: amt >= balance ? 'Invoice marked as Paid' : 'Payment recorded', description: `₹${amt.toLocaleString()} recorded for ${paymentDialogInvoice.invoice_number}` });
    setPaymentDialogInvoice(null);
    setPaymentAmount('');
  };

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsViewerOpen(true);
  };

  const handleDownloadInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsViewerOpen(true);
    // The download will be handled inside the viewer component
  };

  const handleDeleteInvoice = async (invoice: Invoice) => {
    if (window.confirm(`Are you sure you want to delete invoice ${invoice.invoice_number}?`)) {
      try {
        await deleteInvoice.mutateAsync(invoice.id);
        toast({
          title: "Invoice deleted",
          description: `Invoice ${invoice.invoice_number} has been deleted successfully.`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete invoice. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

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

  const updateEditItem = (index: number, field: string, value: string | number) => {
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
    if (editItems.length > 1) setEditItems(editItems.filter((_: any, i: number) => i !== index));
  };

  const editSubtotal = editItems.reduce((s: number, it: any) => s + Number(it.amount || 0), 0);
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
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setEditInvoice(null);
    } catch (err: any) {
      console.error('Error updating invoice:', err);
      toast({ title: 'Error', description: err.message || 'Failed to update invoice', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportInvoices = async (validRows: any[]) => {
    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const uid = normalizeUserId(user.id);

      const invoicesToInsert = validRows.map((row) => {
        const quantity = parseFloat(row.quantity || 1);
        const rate = parseFloat(row.rate || 0);
        const gstRate = parseFloat(row.gst_rate || 18);
        const amount = quantity * rate;
        const gstAmount = amount * (gstRate / 100);
        const totalAmount = amount + gstAmount;
        
        // Calculate due date if not provided (30 days from invoice date)
        const invoiceDate = row.invoice_date;
        const dueDate = row.due_date || new Date(new Date(invoiceDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        return {
          user_id: uid,
          invoice_number: row.invoice_number,
          invoice_date: invoiceDate,
          due_date: dueDate,
          client_name: row.client_name,
          client_gst_number: row.client_gst_number || null,
          amount: amount,
          gst_amount: gstAmount,
          gst_rate: gstRate,
          total_amount: totalAmount,
          status: 'pending',
          notes: row.notes || null,
          items: [
            {
              description: row.item_description || '',
              hsn_sac: row.hsn_sac || '',
              quantity: quantity,
              rate: rate,
              amount: amount,
            }
          ],
        };
      });

      const { error } = await supabase.from('invoices').insert(invoicesToInsert);
      if (error) throw error;

      // Refetch invoices data - use both patterns to ensure cache is invalidated
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });

      setIsImportDialogOpen(false);
      toast({
        title: 'Import Successful',
        description: `${validRows.length} invoices imported successfully.`,
      });
    } catch (err) {
      console.error('Import error:', err);
      toast({
        title: 'Import Failed',
        description: 'Failed to import invoices. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Invoices</h1>
            <p className="text-muted-foreground">Loading your invoices...</p>
          </div>
        </div>
        <div className="animate-pulse space-y-4">
          <Card><CardContent className="h-20"></CardContent></Card>
          <Card><CardContent className="h-96"></CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Invoices</h1>
            <p className="text-muted-foreground">Manage your invoices and track payments</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button asChild variant="orange">
            <Link to="/create-invoice">
              <Plus className="h-4 w-4 mr-2" />
              Create Invoice
            </Link>
          </Button>
        </div>
      </div>

      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        moduleKey="invoices"
        onConfirmImport={handleImportInvoices}
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {['all','paid','partial','pending','overdue'].map(s => (
                <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s)}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Invoice Table */}
      {filteredInvoices.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <div className="text-muted-foreground">
              {searchTerm || statusFilter !== 'all' 
                ? 'No invoices found matching your criteria.' 
                : 'No invoices created yet.'}
            </div>
            {!searchTerm && statusFilter === 'all' && (
              <Button asChild className="mt-4" variant="orange">
                <Link to="/create-invoice">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Invoice
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop Table */}
          <Card className="hidden sm:block">
            <CardContent className="p-0">
              <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice ID</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>GST</TableHead>
                      <TableHead>Total / Paid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell>{invoice.client_name}</TableCell>
                        <TableCell>₹{Number(invoice.amount).toLocaleString()}</TableCell>
                        <TableCell>₹{Number(invoice.gst_amount).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="font-medium">₹{Number(invoice.total_amount).toLocaleString()}</div>
                          {invoice.paid_amount != null && Number(invoice.paid_amount) > 0 && (
                            <div className="mt-1 space-y-0.5">
                              <Progress value={(Number(invoice.paid_amount) / Number(invoice.total_amount)) * 100} className="h-1.5 w-24" />
                              <div className="text-xs text-muted-foreground">
                                Paid ₹{Number(invoice.paid_amount).toLocaleString()}
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                        <TableCell>{new Date(invoice.invoice_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-1.5 flex-wrap">
                            {invoice.status !== 'paid' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openPaymentDialog(invoice)}
                                className="transition-all hover:scale-105 border-green-400 text-green-700 hover:bg-green-50"
                                title="Record Payment"
                              >
                                <IndianRupee className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewInvoice(invoice)}
                              className="transition-all hover:scale-105"
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditDialog(invoice)}
                              className="transition-all hover:scale-105"
                              title="Edit Invoice"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadInvoice(invoice)}
                              className="transition-all hover:scale-105"
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleSendInvoice(invoice)}
                              className="transition-all hover:scale-105 bg-primary"
                            >
                              <Send className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteInvoice(invoice)}
                              disabled={deleteInvoice.isPending}
                              className="transition-all hover:scale-105"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
            </CardContent>
          </Card>

          {/* Mobile Cards for smaller screens */}
          <div className="sm:hidden space-y-4">
            {filteredInvoices.map((invoice) => (
              <Card key={invoice.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium">{invoice.invoice_number}</p>
                      <p className="text-sm text-muted-foreground">{invoice.client_name}</p>
                    </div>
                    {getStatusBadge(invoice.status)}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Amount:</span>
                      <span>₹{Number(invoice.amount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST:</span>
                      <span>₹{Number(invoice.gst_amount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Total:</span>
                      <span>₹{Number(invoice.total_amount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span>{new Date(invoice.invoice_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {invoice.paid_amount != null && Number(invoice.paid_amount) > 0 && (
                    <div className="mt-2 space-y-0.5">
                      <Progress value={(Number(invoice.paid_amount) / Number(invoice.total_amount)) * 100} className="h-1.5" />
                      <div className="text-xs text-muted-foreground">
                        Paid ₹{Number(invoice.paid_amount).toLocaleString('en-IN')} of ₹{Number(invoice.total_amount).toLocaleString('en-IN')}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-4">
                    {invoice.status !== 'paid' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 transition-all hover:scale-[1.02] border-green-400 text-green-700 hover:bg-green-50"
                        onClick={() => openPaymentDialog(invoice)}
                      >
                        <IndianRupee className="h-3 w-3 mr-1" />
                        Pay
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 transition-all hover:scale-[1.02]"
                      onClick={() => handleViewInvoice(invoice)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 transition-all hover:scale-[1.02]"
                      onClick={() => openEditDialog(invoice)}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 transition-all hover:scale-[1.02]"
                      onClick={() => handleDownloadInvoice(invoice)}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1 transition-all hover:scale-[1.02]"
                      onClick={() => handleSendInvoice(invoice)}
                    >
                      <Send className="h-3 w-3 mr-1" />
                      Send
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteInvoice(invoice)}
                      disabled={deleteInvoice.isPending}
                      className="transition-all hover:scale-[1.02]"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <InvoiceViewer
        invoice={selectedInvoice}
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false);
          setSelectedInvoice(null);
        }}
      />

      <Dialog open={!!editInvoice} onOpenChange={(open) => { if (!open) setEditInvoice(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Invoice {editInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {editInvoice && (
            <div className="space-y-5">
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

              <div>
                <Label className="mb-2 block">Line Items</Label>
                <div className="space-y-2">
                  {editItems.map((item: any, idx: number) => (
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
                        â‚¹{Number(item.amount || 0).toLocaleString('en-IN')}
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

              <div className="flex justify-end">
                <Card className="w-64">
                  <CardContent className="p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span>Subtotal</span><span>â‚¹{editSubtotal.toLocaleString('en-IN')}</span></div>
                    <div className="flex justify-between"><span>GST ({editGstRate}%)</span><span>â‚¹{editGstAmount.toLocaleString('en-IN')}</span></div>
                    <div className="flex justify-between font-bold border-t pt-2"><span>Total</span><span>â‚¹{editTotal.toLocaleString('en-IN')}</span></div>
                  </CardContent>
                </Card>
              </div>

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

      {invoiceToSend && (
        <SendDocumentDialog
          isOpen={isSendDialogOpen}
          onClose={() => {
            setIsSendDialogOpen(false);
            setInvoiceToSend(null);
          }}
          documentType="invoice"
          documentNumber={invoiceToSend.invoice_number}
          recipientName={invoiceToSend.client_name}
          recipientEmail={invoiceToSend.client_email || ''}
          amount={invoiceToSend.total_amount}
          dueDate={invoiceToSend.due_date}
        />
      )}

      {/* ── Partial / Full Payment Dialog ── */}
      <Dialog open={!!paymentDialogInvoice} onOpenChange={(open) => { if (!open) { setPaymentDialogInvoice(null); setPaymentAmount(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {paymentDialogInvoice && (() => {
            const total   = Number(paymentDialogInvoice.total_amount);
            const paid    = Number(paymentDialogInvoice.paid_amount || 0);
            const balance = total - paid;
            const pct     = Math.min((paid / total) * 100, 100);
            return (
              <div className="space-y-4 py-2">
                <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Invoice</span>
                    <span className="font-medium">{paymentDialogInvoice.invoice_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Client</span>
                    <span>{paymentDialogInvoice.client_name}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-muted-foreground">Invoice Total</span>
                    <span>₹{total.toLocaleString('en-IN')}</span>
                  </div>
                  {paid > 0 && (
                    <>
                      <div className="flex justify-between text-green-700">
                        <span>Already Paid</span>
                        <span>₹{paid.toLocaleString('en-IN')}</span>
                      </div>
                      <Progress value={pct} className="h-2 mt-1" />
                    </>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                    <span>Balance Due</span>
                    <span className="text-orange-600">₹{balance.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payAmt">Payment Amount (₹)</Label>
                  <Input
                    id="payAmt"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={balance}
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    placeholder={`Max ₹${balance.toLocaleString('en-IN')}`}
                  />
                  <div className="flex gap-2 pt-1">
                    <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => setPaymentAmount((balance / 2).toFixed(2))}>50%</Button>
                    <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => setPaymentAmount(balance.toFixed(2))}>Full</Button>
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPaymentDialogInvoice(null); setPaymentAmount(''); }}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={recordPayment.isPending}>
              {recordPayment.isPending ? 'Saving...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Invoices;
