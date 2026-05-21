import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, Plus, AlertTriangle, ClipboardCheck } from 'lucide-react';
import {
  useApprovalRequests,
  useCreateApprovalRequest,
  useApproveRequest,
  useRejectRequest,
  useCancelRequest,
} from '@/hooks/useApprovalRequests';
import type {
  ApprovalPriority,
  ApprovalRequestStatus,
  ApprovalRequestType,
  CreateApprovalRequestInput,
} from '@/types/approvalRequest';

const inr = (n: number | null | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
        .format(Number(n) || 0);

const today = () => new Date().toISOString().slice(0, 10);

const Approvals: React.FC = () => {
  const [status, setStatus] = useState<ApprovalRequestStatus | 'all'>('pending');
  const { data: requests = [] } = useApprovalRequests({ status });
  const create = useCreateApprovalRequest();
  const approve = useApproveRequest();
  const reject = useRejectRequest();
  const cancel = useCancelRequest();

  const [createOpen, setCreateOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveOpen, setApproveOpen] = useState<string | null>(null);
  const [approveComment, setApproveComment] = useState('');

  const [draft, setDraft] = useState<CreateApprovalRequestInput>({
    request_type: 'asset_purchase',
    title: '',
    priority: 'normal',
  });

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const highPriorityCount = requests.filter(
    (r) => r.status === 'pending' && (r.priority === 'high' || r.priority === 'urgent'),
  ).length;

  const submitCreate = () => {
    if (!draft.title.trim()) return;
    create.mutate(draft, {
      onSuccess: () => {
        setCreateOpen(false);
        setDraft({ request_type: 'asset_purchase', title: '', priority: 'normal' });
      },
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" /> Approvals
          </h1>
          <p className="text-sm text-muted-foreground">
            Generalised approval queue across all modules — asset purchases, write-offs, liability changes, journal adjustments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as ApprovalRequestStatus | 'all')}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="executed">Executed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> New request</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Pending</div><div className="text-2xl font-bold">{pendingCount}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> High priority</div><div className="text-2xl font-bold text-red-600">{highPriorityCount}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Approved</div><div className="text-2xl font-bold">{requests.filter(r => r.status === 'approved').length}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Executed</div><div className="text-2xl font-bold text-emerald-600">{requests.filter(r => r.status === 'executed').length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Requests</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.title}</div>
                    {r.description && <div className="text-xs text-muted-foreground max-w-[280px] truncate">{r.description}</div>}
                    {r.entity_type && r.entity_id && (
                      <div className="text-xs text-muted-foreground">
                        {r.entity_type.replace('_', ' ')} · {String(r.entity_id).slice(0, 8)}…
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {r.request_type.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={r.priority === 'urgent' ? 'destructive' : r.priority === 'high' ? 'secondary' : 'outline'}
                      className="text-[10px] capitalize"
                    >
                      {r.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.amount)}</TableCell>
                  <TableCell className="text-xs">{r.requested_on}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.status === 'rejected' || r.status === 'expired' ? 'destructive' :
                        r.status === 'executed' ? 'default' :
                        r.status === 'cancelled' ? 'secondary' :
                        r.status === 'approved' ? 'default' :
                        'secondary'
                      }
                      className="text-[10px] capitalize"
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {r.status === 'pending' && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => { setApproveOpen(r.id); setApproveComment(''); }} title="Approve">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setRejectOpen(r.id); setRejectReason(''); }} title="Reject">
                          <XCircle className="h-4 w-4 text-red-600" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id)} title="Cancel">
                          ×
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">
                    No approval requests in this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New request */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New approval request</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Type</Label>
              <Select value={draft.request_type} onValueChange={(v) => setDraft({ ...draft, request_type: v as ApprovalRequestType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset_purchase">Asset purchase</SelectItem>
                  <SelectItem value="asset_disposal">Asset disposal</SelectItem>
                  <SelectItem value="asset_write_off">Asset write-off</SelectItem>
                  <SelectItem value="asset_transfer">Asset transfer</SelectItem>
                  <SelectItem value="asset_revaluation">Asset revaluation</SelectItem>
                  <SelectItem value="asset_impairment">Asset impairment</SelectItem>
                  <SelectItem value="liability_restructuring">Liability restructuring</SelectItem>
                  <SelectItem value="loan_closure">Loan closure</SelectItem>
                  <SelectItem value="loan_disbursement">Loan disbursement</SelectItem>
                  <SelectItem value="lease_termination">Lease termination</SelectItem>
                  <SelectItem value="cwip_capitalization">CWIP capitalization</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="journal_adjustment">Journal adjustment</SelectItem>
                  <SelectItem value="generic">Generic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Restructure ICICI loan to 7-year tenor" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={2} value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount</Label>
                <Input type="number" min={0} step="0.01" value={draft.amount || ''} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={draft.priority || 'normal'} onValueChange={(v) => setDraft({ ...draft, priority: v as ApprovalPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Entity type</Label>
                <Input value={draft.entity_type || ''} onChange={(e) => setDraft({ ...draft, entity_type: e.target.value })} placeholder="fixed_asset / liability / lease..." />
              </div>
              <div>
                <Label>Entity ID</Label>
                <Input value={draft.entity_id || ''} onChange={(e) => setDraft({ ...draft, entity_id: e.target.value })} placeholder="UUID (optional)" />
              </div>
            </div>
            <div>
              <Label>Expires on</Label>
              <Input type="date" value={draft.expires_on || ''} onChange={(e) => setDraft({ ...draft, expires_on: e.target.value })} />
            </div>
            <div>
              <Label>Document URL</Label>
              <Input value={draft.document_url || ''} onChange={(e) => setDraft({ ...draft, document_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={create.isPending}>{create.isPending ? 'Submitting…' : 'Submit'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve dialog */}
      <Dialog open={!!approveOpen} onOpenChange={(o) => !o && setApproveOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Approve request</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Comment (optional)</Label>
              <Textarea rows={3} value={approveComment} onChange={(e) => setApproveComment(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Approving here only changes status. The originating module is responsible for executing the action (posting journals etc.) when it sees the request as approved.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(null)}>Cancel</Button>
            <Button
              onClick={() => approveOpen && approve.mutate({ id: approveOpen, comment: approveComment }, { onSuccess: () => setApproveOpen(null) })}
              disabled={approve.isPending}
            >
              {approve.isPending ? 'Approving…' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectOpen} onOpenChange={(o) => !o && setRejectOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reject request</DialogTitle></DialogHeader>
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

export default Approvals;
