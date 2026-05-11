import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useToast } from '@/hooks/use-toast';
import {
  useWarehouseTransfers,
  useApproveWarehouseTransfer,
  useCancelWarehouseTransfer,
  useWarehouseTransferDetail,
} from '@/hooks/useWarehouseTransfers';
import { Plus, Search, Truck, CheckCircle2, XCircle, Eye, ArrowRight } from 'lucide-react';
import CreateWarehouseTransferDialog from '@/components/inventory-ops/CreateWarehouseTransferDialog';

const statusBadge = (s: string) => {
  switch (s) {
    case 'draft':      return <Badge className="bg-yellow-100 text-yellow-800">Draft</Badge>;
    case 'in_transit': return <Badge className="bg-blue-100 text-blue-800">In Transit</Badge>;
    case 'received':   return <Badge className="bg-green-100 text-green-800">Received</Badge>;
    case 'cancelled':  return <Badge variant="secondary">Cancelled</Badge>;
    default:           return <Badge variant="outline">{s}</Badge>;
  }
};

const WarehouseTransfers: React.FC = () => {
  const { toast } = useToast();
  const { data: transfers = [], isLoading } = useWarehouseTransfers();
  const approveTransfer = useApproveWarehouseTransfer();
  const cancelTransfer = useCancelWarehouseTransfer();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'received' | 'cancelled'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detail } = useWarehouseTransferDetail(detailId);

  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return transfers.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (!lower) return true;
      return (
        t.transfer_number.toLowerCase().includes(lower) ||
        (t.from_warehouse_name || '').toLowerCase().includes(lower) ||
        (t.to_warehouse_name || '').toLowerCase().includes(lower)
      );
    });
  }, [transfers, search, statusFilter]);

  const summary = useMemo(() => {
    const received = transfers.filter((t) => t.status === 'received');
    return {
      count: transfers.length,
      received: received.length,
      drafts: transfers.filter((t) => t.status === 'draft').length,
      value: received.reduce((s, t) => s + Number(t.total_value || 0), 0),
    };
  }, [transfers]);

  const handleApprove = async (id: string) => {
    try { await approveTransfer.mutateAsync(id); toast({ title: 'Transfer received' }); }
    catch (e: any) { toast({ title: 'Approve failed', description: e?.message, variant: 'destructive' }); }
  };
  const handleCancel = async (id: string) => {
    if (!window.confirm('Cancel this draft transfer?')) return;
    try { await cancelTransfer.mutateAsync(id); toast({ title: 'Transfer cancelled' }); }
    catch (e: any) { toast({ title: 'Cancel failed', description: e?.message, variant: 'destructive' }); }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Warehouse Transfers</h1>
            <p className="text-muted-foreground">Move stock between warehouses with no P&L impact.</p>
          </div>
        </div>
        <Button variant="orange" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />New Transfer
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Transfers</div><div className="text-2xl font-semibold">{summary.count}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Received</div><div className="text-2xl font-semibold text-green-700">{summary.received}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Drafts</div><div className="text-2xl font-semibold text-yellow-700">{summary.drafts}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Value Moved</div><div className="text-2xl font-semibold">₹{summary.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'draft', 'received', 'cancelled'] as const).map((s) => (
                <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} onClick={() => setStatusFilter(s)}>
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
              <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <div className="text-muted-foreground mb-4">No transfers yet.</div>
              <Button variant="orange" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" /> New Transfer</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transfer #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>From → To</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.transfer_number}</TableCell>
                    <TableCell>{new Date(t.transfer_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <span>{t.from_warehouse_name || '—'}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span>{t.to_warehouse_name || '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{Number(t.total_quantity || 0)}</TableCell>
                    <TableCell className="text-right">₹{Number(t.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{statusBadge(t.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setDetailId(t.id)}><Eye className="h-3 w-3" /></Button>
                        {t.status === 'draft' && (
                          <>
                            <Button size="sm" variant="outline" className="border-green-400 text-green-700 hover:bg-green-50"
                              disabled={approveTransfer.isPending} onClick={() => handleApprove(t.id)} title="Receive"><CheckCircle2 className="h-3 w-3" /></Button>
                            <Button size="sm" variant="outline" className="border-red-400 text-red-700 hover:bg-red-50"
                              disabled={cancelTransfer.isPending} onClick={() => handleCancel(t.id)} title="Cancel"><XCircle className="h-3 w-3" /></Button>
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

      <CreateWarehouseTransferDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{detail?.header?.transfer_number || 'Transfer'}</DialogTitle></DialogHeader>
          {detail?.header && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><div className="text-muted-foreground">From</div><div className="font-medium">{detail.header.from_warehouse_name}</div></div>
                <div><div className="text-muted-foreground">To</div><div className="font-medium">{detail.header.to_warehouse_name}</div></div>
                <div><div className="text-muted-foreground">Date</div><div>{new Date(detail.header.transfer_date).toLocaleDateString()}</div></div>
                <div><div className="text-muted-foreground">Status</div>{statusBadge(detail.header.status)}</div>
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
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detail.items || []).map((it: any) => (
                      <TableRow key={it.id}>
                        <TableCell>{it.product_name}</TableCell>
                        <TableCell className="text-right">{it.quantity}</TableCell>
                        <TableCell className="text-right">₹{Number(it.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right">₹{Number(it.total_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WarehouseTransfers;
