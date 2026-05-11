import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  usePurchaseReturns,
  useApprovePurchaseReturn,
  useCancelPurchaseReturn,
  usePurchaseReturnWithItems,
} from '@/hooks/usePurchaseReturns';
import { usePurchaseBills, type PurchaseBill } from '@/hooks/usePurchaseBills';
import { Plus, Search, Undo2, CheckCircle2, XCircle, Eye, FileText } from 'lucide-react';
import CreatePurchaseReturnDialog from '@/components/purchase-returns/CreatePurchaseReturnDialog';

const statusBadge = (status: string) => {
  switch (status) {
    case 'approved': return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
    case 'draft':    return <Badge className="bg-yellow-100 text-yellow-800">Draft</Badge>;
    case 'cancelled':return <Badge variant="secondary">Cancelled</Badge>;
    default:         return <Badge variant="outline">{status}</Badge>;
  }
};

const outcomeBadge = (outcome: string) => {
  const map: Record<string, string> = {
    adjustment: 'bg-blue-100 text-blue-800',
    refund:     'bg-orange-100 text-orange-800',
    replacement:'bg-purple-100 text-purple-800',
  };
  return <Badge className={map[outcome] || ''}>{outcome}</Badge>;
};

const PurchaseReturns: React.FC = () => {
  const { toast } = useToast();
  const { data: returns = [], isLoading } = usePurchaseReturns();
  const { data: bills = [] } = usePurchaseBills();
  const approveReturn = useApprovePurchaseReturn();
  const cancelReturn = useCancelPurchaseReturn();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'approved' | 'cancelled'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [pickBillOpen, setPickBillOpen] = useState(false);
  const [pickedBillId, setPickedBillId] = useState<string>('');
  const [detailReturnId, setDetailReturnId] = useState<string | null>(null);

  const { data: detail } = usePurchaseReturnWithItems(detailReturnId);

  const pickedBill: PurchaseBill | null =
    pickedBillId ? (bills as PurchaseBill[]).find((b) => b.id === pickedBillId) ?? null : null;

  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return returns.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!lower) return true;
      return (
        r.return_number.toLowerCase().includes(lower) ||
        r.bill_number.toLowerCase().includes(lower) ||
        r.vendor_name.toLowerCase().includes(lower)
      );
    });
  }, [returns, search, statusFilter]);

  const summary = useMemo(() => {
    const approved = returns.filter((r) => r.status === 'approved');
    const draft = returns.filter((r) => r.status === 'draft');
    const totalDebit = approved.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    return {
      count: returns.length,
      approved: approved.length,
      draft: draft.length,
      totalDebit,
    };
  }, [returns]);

  const handleApprove = async (id: string) => {
    try {
      await approveReturn.mutateAsync(id);
      toast({ title: 'Return approved', description: 'Debit note issued and journals posted.' });
    } catch (e: any) {
      toast({ title: 'Approval failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    }
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm('Cancel this draft purchase return?')) return;
    try {
      await cancelReturn.mutateAsync(id);
      toast({ title: 'Return cancelled' });
    } catch (e: any) {
      toast({ title: 'Cancel failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    }
  };

  const openCreateForBill = () => {
    setPickedBillId('');
    setPickBillOpen(true);
  };

  const proceedToCreate = () => {
    if (!pickedBillId) {
      toast({ title: 'Select a bill', variant: 'destructive' });
      return;
    }
    setPickBillOpen(false);
    setCreateOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Purchase Returns</h1>
            <p className="text-muted-foreground">
              Return goods to vendors, auto-issue debit notes, reduce inventory & reverse ITC.
            </p>
          </div>
        </div>
        <Button variant="orange" onClick={openCreateForBill}>
          <Plus className="h-4 w-4 mr-2" />
          New Purchase Return
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Total Returns</div>
          <div className="text-2xl font-semibold">{summary.count}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Approved</div>
          <div className="text-2xl font-semibold text-green-700">{summary.approved}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Drafts</div>
          <div className="text-2xl font-semibold text-yellow-700">{summary.draft}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Total Debit Issued</div>
          <div className="text-2xl font-semibold">₹{summary.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by return number, bill, vendor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'draft', 'approved', 'cancelled'] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <Undo2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <div className="text-muted-foreground mb-4">
                {search || statusFilter !== 'all'
                  ? 'No returns match your filters.'
                  : 'No purchase returns yet. Create one from a vendor bill.'}
              </div>
              {!search && statusFilter === 'all' && (
                <Button variant="orange" onClick={openCreateForBill}>
                  <Plus className="h-4 w-4 mr-2" /> New Purchase Return
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Bill</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.return_number}</TableCell>
                    <TableCell>{new Date(r.return_date).toLocaleDateString()}</TableCell>
                    <TableCell>{r.bill_number}</TableCell>
                    <TableCell>{r.vendor_name}</TableCell>
                    <TableCell className="text-right">₹{Number(r.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">₹{Number(r.gst_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right font-medium">₹{Number(r.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{outcomeBadge(r.outcome)}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setDetailReturnId(r.id)} title="View">
                          <Eye className="h-3 w-3" />
                        </Button>
                        {r.status === 'draft' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-green-400 text-green-700 hover:bg-green-50"
                              disabled={approveReturn.isPending}
                              onClick={() => handleApprove(r.id)}
                              title="Approve"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-400 text-red-700 hover:bg-red-50"
                              disabled={cancelReturn.isPending}
                              onClick={() => handleCancel(r.id)}
                              title="Cancel"
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Bill picker */}
      <Dialog open={pickBillOpen} onOpenChange={setPickBillOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Bill to Return</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={pickedBillId} onValueChange={setPickedBillId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a bill" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {bills.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No bills found</div>
                ) : (
                  (bills as PurchaseBill[]).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bill_number} — {b.vendor_name} — ₹{Number(b.total_amount).toLocaleString()}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickBillOpen(false)}>Cancel</Button>
            <Button variant="orange" onClick={proceedToCreate} disabled={!pickedBillId}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreatePurchaseReturnDialog
        bill={pickedBill}
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setPickedBillId('');
        }}
      />

      {/* Detail dialog */}
      <Dialog open={!!detailReturnId} onOpenChange={(o) => !o && setDetailReturnId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.header?.return_number || 'Return Detail'}</DialogTitle>
          </DialogHeader>
          {detail?.header && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><div className="text-muted-foreground">Bill</div><div className="font-medium">{detail.header.bill_number}</div></div>
                <div><div className="text-muted-foreground">Vendor</div><div className="font-medium">{detail.header.vendor_name}</div></div>
                <div><div className="text-muted-foreground">Date</div><div>{new Date(detail.header.return_date).toLocaleDateString()}</div></div>
                <div><div className="text-muted-foreground">Status</div>{statusBadge(detail.header.status)}</div>
                <div><div className="text-muted-foreground">Outcome</div>{outcomeBadge(detail.header.outcome)}</div>
                <div><div className="text-muted-foreground">Type</div><div className="capitalize">{detail.header.return_type}</div></div>
                <div><div className="text-muted-foreground">Inventory Reduced</div><div>₹{Number(detail.header.inventory_reduced || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
                <div><div className="text-muted-foreground">Debit Note</div>
                  <div className="font-medium">{detail.header.debit_note_id ? <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Issued</span> : '—'}</div>
                </div>
              </div>
              {detail.header.reason && (
                <div className="text-sm"><span className="text-muted-foreground">Reason: </span>{detail.header.reason}</div>
              )}
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">GST</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detail.items || []).map((it: any) => (
                      <TableRow key={it.id}>
                        <TableCell>{it.product_name}</TableCell>
                        <TableCell className="text-right">{it.quantity}</TableCell>
                        <TableCell className="text-right">₹{Number(it.rate).toLocaleString()}</TableCell>
                        <TableCell className="capitalize">{String(it.condition).replace('_', ' ')}</TableCell>
                        <TableCell className="text-right">₹{Number(it.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right">₹{Number(it.gst_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end gap-6 pt-2 text-sm">
                <div>Subtotal: <span className="font-semibold">₹{Number(detail.header.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                <div>GST: <span className="font-semibold">₹{Number(detail.header.gst_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                <div className="text-base">Total: <span className="font-bold">₹{Number(detail.header.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseReturns;
