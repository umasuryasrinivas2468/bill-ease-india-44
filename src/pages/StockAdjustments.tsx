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
  useStockAdjustments,
  useApproveStockAdjustment,
  useCancelStockAdjustment,
  useStockAdjustmentDetail,
} from '@/hooks/useStockAdjustments';
import { Plus, Search, Settings, CheckCircle2, XCircle, Eye } from 'lucide-react';
import CreateStockAdjustmentDialog from '@/components/inventory-ops/CreateStockAdjustmentDialog';

const statusBadge = (s: string) => {
  switch (s) {
    case 'draft':  return <Badge className="bg-yellow-100 text-yellow-800">Draft</Badge>;
    case 'posted': return <Badge className="bg-green-100 text-green-800">Posted</Badge>;
    case 'void':   return <Badge variant="secondary">Void</Badge>;
    default:       return <Badge variant="outline">{s}</Badge>;
  }
};

const StockAdjustments: React.FC = () => {
  const { toast } = useToast();
  const { data: adjustments = [], isLoading } = useStockAdjustments();
  const approveAdj = useApproveStockAdjustment();
  const cancelAdj = useCancelStockAdjustment();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'posted' | 'void'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detail } = useStockAdjustmentDetail(detailId);

  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return adjustments.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!lower) return true;
      return a.adjustment_number.toLowerCase().includes(lower) || (a.reason || '').toLowerCase().includes(lower);
    });
  }, [adjustments, search, statusFilter]);

  const summary = useMemo(() => {
    const posted = adjustments.filter((a) => a.status === 'posted');
    return {
      count: adjustments.length,
      posted: posted.length,
      drafts: adjustments.filter((a) => a.status === 'draft').length,
      netDelta: posted.reduce((s, a) => s + Number(a.total_value_delta || 0), 0),
    };
  }, [adjustments]);

  const handleApprove = async (id: string) => {
    try { await approveAdj.mutateAsync(id); toast({ title: 'Adjustment posted' }); }
    catch (e: any) { toast({ title: 'Approve failed', description: e?.message, variant: 'destructive' }); }
  };
  const handleCancel = async (id: string) => {
    if (!window.confirm('Cancel this draft adjustment?')) return;
    try { await cancelAdj.mutateAsync(id); toast({ title: 'Adjustment cancelled' }); }
    catch (e: any) { toast({ title: 'Cancel failed', description: e?.message, variant: 'destructive' }); }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Stock Adjustments</h1>
            <p className="text-muted-foreground">Damaged, expired, write-offs, recounts — with auto journal posting.</p>
          </div>
        </div>
        <Button variant="orange" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />New Adjustment
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Adjustments</div><div className="text-2xl font-semibold">{summary.count}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Posted</div><div className="text-2xl font-semibold text-green-700">{summary.posted}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Drafts</div><div className="text-2xl font-semibold text-yellow-700">{summary.drafts}</div></CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Net Value Impact</div>
          <div className={`text-2xl font-semibold ${summary.netDelta < 0 ? 'text-red-600' : summary.netDelta > 0 ? 'text-green-700' : ''}`}>
            ₹{summary.netDelta.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'draft', 'posted', 'void'] as const).map((s) => (
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
              <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <div className="text-muted-foreground mb-4">No adjustments yet.</div>
              <Button variant="orange" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" /> New Adjustment</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adjustment #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Value Delta</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.adjustment_number}</TableCell>
                    <TableCell>{new Date(a.adjustment_date).toLocaleDateString()}</TableCell>
                    <TableCell className="max-w-xs truncate">{a.reason}</TableCell>
                    <TableCell className={`text-right ${Number(a.total_value_delta) < 0 ? 'text-red-600' : Number(a.total_value_delta) > 0 ? 'text-green-700' : ''}`}>
                      ₹{Number(a.total_value_delta || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{statusBadge(a.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setDetailId(a.id)}><Eye className="h-3 w-3" /></Button>
                        {a.status === 'draft' && (
                          <>
                            <Button size="sm" variant="outline" className="border-green-400 text-green-700 hover:bg-green-50"
                              disabled={approveAdj.isPending} onClick={() => handleApprove(a.id)} title="Post"><CheckCircle2 className="h-3 w-3" /></Button>
                            <Button size="sm" variant="outline" className="border-red-400 text-red-700 hover:bg-red-50"
                              disabled={cancelAdj.isPending} onClick={() => handleCancel(a.id)} title="Cancel"><XCircle className="h-3 w-3" /></Button>
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

      <CreateStockAdjustmentDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{detail?.header?.adjustment_number || 'Adjustment'}</DialogTitle></DialogHeader>
          {detail?.header && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><div className="text-muted-foreground">Date</div><div>{new Date(detail.header.adjustment_date).toLocaleDateString()}</div></div>
                <div><div className="text-muted-foreground">Status</div>{statusBadge(detail.header.status)}</div>
                <div><div className="text-muted-foreground">Reason</div><div className="font-medium">{detail.header.reason}</div></div>
                <div><div className="text-muted-foreground">Journal</div><div className="font-mono text-xs truncate">{detail.header.journal_id || '—'}</div></div>
              </div>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty Delta</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Value Delta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detail.items || []).map((it: any) => (
                      <TableRow key={it.id}>
                        <TableCell>{it.product_name}</TableCell>
                        <TableCell className="capitalize">{String(it.adjustment_type).replace('_', ' ')}</TableCell>
                        <TableCell className={`text-right ${Number(it.quantity_delta) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {Number(it.quantity_delta) > 0 ? '+' : ''}{it.quantity_delta}
                        </TableCell>
                        <TableCell className="text-right">₹{Number(it.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className={`text-right ${Number(it.value_delta) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          ₹{Number(it.value_delta).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
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

export default StockAdjustments;
