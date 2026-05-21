import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, ArrowDownToLine, AlertTriangle } from 'lucide-react';
import {
  useDisposalRequests,
  useApproveDisposal,
  useRejectDisposal,
  useCancelDisposalRequest,
} from '@/hooks/useFixedAssets';
import type { DisposalRequestStatus } from '@/types/assetDisposal';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const DisposalRequests: React.FC = () => {
  const [filter, setFilter] = useState<DisposalRequestStatus | 'all'>('pending');
  const { data: requests = [] } = useDisposalRequests(filter === 'all' ? undefined : filter);
  const approve = useApproveDisposal();
  const reject = useRejectDisposal();
  const cancel = useCancelDisposalRequest();

  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const pendingCount = useMemo(() => {
    if (filter === 'pending') return requests.length;
    return requests.filter((r) => r.status === 'pending').length;
  }, [requests, filter]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Disposal Requests</h1>
          <p className="text-sm text-muted-foreground">
            Pending approvals for asset disposal / write-off / scrap.
          </p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as DisposalRequestStatus | 'all')}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filter === 'pending' && pendingCount > 0 && (
        <Card className="border-amber-500/40">
          <CardContent className="pt-4 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span><strong>{pendingCount}</strong> request{pendingCount > 1 ? 's' : ''} awaiting your approval.</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Requests</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Proposed date</TableHead>
                <TableHead className="text-right">Book value</TableHead>
                <TableHead className="text-right">Proceeds</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => {
                const expectedPL = r.proposed_sale_proceeds - r.asset_book_value;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link to={`/assets/${r.asset_id}`} className="text-primary hover:underline">
                        <div className="font-medium">{r.asset_name}</div>
                        <div className="text-xs font-mono text-muted-foreground">{r.asset_code}</div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {r.disposal_type.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.requested_on}</TableCell>
                    <TableCell className="text-xs">{r.proposed_disposal_date}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(r.asset_book_value)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div>{inr(r.proposed_sale_proceeds)}</div>
                      <div className={`text-xs ${expectedPL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {expectedPL >= 0 ? '+' : ''}{inr(expectedPL)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.proposed_gst_amount ? inr(r.proposed_gst_amount) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === 'pending' ? 'secondary' :
                          r.status === 'rejected' || r.status === 'cancelled' ? 'destructive' :
                          'default'
                        }
                        className="text-[10px] capitalize"
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {r.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => approve.mutate(r.id)}
                            disabled={approve.isPending}
                            title="Approve & post"
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setRejectOpen(r.id); setRejectReason(''); }}
                            title="Reject"
                          >
                            <XCircle className="h-4 w-4 text-red-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => cancel.mutate(r.id)}
                            title="Cancel request"
                          >
                            <ArrowDownToLine className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-6 text-sm text-muted-foreground">
                    No disposal requests in this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!rejectOpen} onOpenChange={(o) => !o && setRejectOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject disposal request</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Reason</Label>
              <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectOpen && reject.mutate({ id: rejectOpen, reason: rejectReason }, { onSuccess: () => setRejectOpen(null) })}
              disabled={reject.isPending || !rejectReason.trim()}
            >
              {reject.isPending ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DisposalRequests;
