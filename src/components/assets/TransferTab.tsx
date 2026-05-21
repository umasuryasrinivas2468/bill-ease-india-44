import React, { useMemo, useState } from 'react';
import { useOrganization } from '@clerk/clerk-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Move3d, ArrowRight, Undo2, CheckCircle2, XCircle } from 'lucide-react';
import CostCenterSelect from '@/components/CostCenterSelect';
import {
  useAssetTransfers,
  useCreateAssetTransfer,
  useApproveTransfer,
  useRejectTransfer,
  useRevertTransfer,
} from '@/hooks/useAssetTransfer';
import { useFixedAsset } from '@/hooks/useFixedAssets';
import type { CreateTransferInput, TransferType } from '@/types/assetTransfer';

const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  assetId: string;
  assetName: string;
}

interface ClerkBranch { id: string; name: string; code: string }

const TransferTab: React.FC<Props> = ({ assetId, assetName }) => {
  const { organization } = useOrganization();
  const branches: ClerkBranch[] = useMemo(() => {
    const md = (organization?.publicMetadata || {}) as any;
    return (md.branches as ClerkBranch[]) || [];
  }, [organization]);
  const branchName = (id?: string | null) =>
    id ? branches.find((b) => b.id === id)?.name || id : '—';

  const { data: asset } = useFixedAsset(assetId);
  const { data: transfers = [] } = useAssetTransfers({ assetId });
  const createTransfer = useCreateAssetTransfer();
  const approve = useApproveTransfer();
  const reject = useRejectTransfer();
  const revert = useRevertTransfer();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CreateTransferInput>({
    asset_id: assetId,
    transfer_type: 'branch',
    transfer_date: today(),
    status: 'completed',
    post_journal: false,
  });

  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [revertOpen, setRevertOpen] = useState<string | null>(null);
  const [revertReason, setRevertReason] = useState('');

  const submit = () => {
    createTransfer.mutate({ ...draft, asset_id: assetId }, {
      onSuccess: () => {
        setOpen(false);
        setDraft({
          asset_id: assetId,
          transfer_type: 'branch',
          transfer_date: today(),
          status: 'completed',
          post_journal: false,
        });
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Current placement card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Move3d className="h-4 w-4" /> Current placement
          </CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}>
            <ArrowRight className="h-4 w-4 mr-1" /> New transfer
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Field label="Branch" value={branchName(asset?.branch_id)} />
          <Field label="Location" value={asset?.location || '—'} />
          <Field label="Department" value={(asset as any)?.department || '—'} />
          <Field label="Custodian" value={asset?.custodian || '—'} />
          <Field label="Cost center" value={asset?.cost_center_id || '—'} />
        </CardContent>
      </Card>

      {/* Transfer history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transfer history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t) => {
                const fromLabel =
                  t.transfer_type === 'branch'      ? branchName(t.from_branch_id) :
                  t.transfer_type === 'department'  ? t.from_department || '—' :
                  t.transfer_type === 'employee'    ? t.from_custodian || '—' :
                  t.transfer_type === 'location'    ? t.from_location || '—' :
                  t.from_cost_center_id || '—';
                const toLabel =
                  t.transfer_type === 'branch'      ? branchName(t.to_branch_id) :
                  t.transfer_type === 'department'  ? t.to_department || '—' :
                  t.transfer_type === 'employee'    ? t.to_custodian || '—' :
                  t.transfer_type === 'location'    ? t.to_location || '—' :
                  t.to_cost_center_id || '—';
                return (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{t.transfer_date}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {t.transfer_type.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-muted-foreground">{fromLabel}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{toLabel}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{t.reason || '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          t.status === 'completed' ? 'default' :
                          t.status === 'rejected' || t.status === 'reverted' ? 'destructive' :
                          'secondary'
                        }
                        className="text-[10px] capitalize"
                      >
                        {t.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {(t.status === 'pending_approval' || t.status === 'draft') && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => approve.mutate({ id: t.id })} title="Approve">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setRejectOpen(t.id); setRejectReason(''); }} title="Reject">
                            <XCircle className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      )}
                      {t.status === 'completed' && !t.reverts_transfer_id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setRevertOpen(t.id); setRevertReason(''); }}
                          title="Revert"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {transfers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                    No transfers recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New transfer dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transfer {assetName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Transfer type</Label>
              <Select
                value={draft.transfer_type}
                onValueChange={(v) => setDraft({ ...draft, transfer_type: v as TransferType })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="branch">Branch-to-branch</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="employee">Employee / custodian</SelectItem>
                  <SelectItem value="location">Physical location</SelectItem>
                  <SelectItem value="cost_center">Cost centre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {draft.transfer_type === 'branch' && branches.length > 0 && (
              <div>
                <Label>To branch</Label>
                <Select
                  value={draft.to_branch_id || ''}
                  onValueChange={(v) => setDraft({ ...draft, to_branch_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(draft.transfer_type === 'branch' || branches.length === 0) && (
              <div>
                <Label>To branch (ID / code)</Label>
                <Input
                  value={draft.to_branch_id || ''}
                  onChange={(e) => setDraft({ ...draft, to_branch_id: e.target.value })}
                  placeholder="branch identifier"
                />
              </div>
            )}

            {draft.transfer_type === 'department' && (
              <div>
                <Label>To department</Label>
                <Input
                  value={draft.to_department || ''}
                  onChange={(e) => setDraft({ ...draft, to_department: e.target.value })}
                />
              </div>
            )}

            {draft.transfer_type === 'employee' && (
              <div>
                <Label>To custodian</Label>
                <Input
                  value={draft.to_custodian || ''}
                  onChange={(e) => setDraft({ ...draft, to_custodian: e.target.value })}
                  placeholder="Employee name / id"
                />
              </div>
            )}

            {draft.transfer_type === 'location' && (
              <div>
                <Label>To location</Label>
                <Input
                  value={draft.to_location || ''}
                  onChange={(e) => setDraft({ ...draft, to_location: e.target.value })}
                  placeholder="Building / floor / room"
                />
              </div>
            )}

            {draft.transfer_type === 'cost_center' && (
              <div>
                <Label>To cost centre</Label>
                <CostCenterSelect
                  value={draft.to_cost_center_id || null}
                  onChange={(id) => setDraft({ ...draft, to_cost_center_id: id || undefined })}
                />
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Transfer date</Label>
                <Input
                  type="date"
                  value={draft.transfer_date}
                  onChange={(e) => setDraft({ ...draft, transfer_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Workflow</Label>
                <Select
                  value={draft.status || 'completed'}
                  onValueChange={(v) =>
                    setDraft({ ...draft, status: v as 'completed' | 'pending_approval' | 'draft' })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Complete now</SelectItem>
                    <SelectItem value="pending_approval">Send for approval</SelectItem>
                    <SelectItem value="draft">Save as draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Reason</Label>
              <Input
                value={draft.reason || ''}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                placeholder="why are we moving this asset?"
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={draft.notes || ''}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="postj"
                checked={draft.post_journal || false}
                onChange={(e) => setDraft({ ...draft, post_journal: e.target.checked })}
              />
              <Label htmlFor="postj" className="font-normal">
                Post memorandum journal (retags book value across cost-centre / branch)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={createTransfer.isPending}>
              {createTransfer.isPending ? 'Saving…' : 'Save transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectOpen} onOpenChange={(o) => !o && setRejectOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject transfer</DialogTitle></DialogHeader>
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
              onClick={() => {
                if (rejectOpen) {
                  reject.mutate({ id: rejectOpen, reason: rejectReason }, { onSuccess: () => setRejectOpen(null) });
                }
              }}
              disabled={reject.isPending || !rejectReason.trim()}
            >
              {reject.isPending ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revert dialog */}
      <Dialog open={!!revertOpen} onOpenChange={(o) => !o && setRevertOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Revert transfer</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              This creates a new transfer that swaps the from/to fields and updates the asset back to its prior placement.
            </p>
            <div>
              <Label>Reason</Label>
              <Textarea rows={3} value={revertReason} onChange={(e) => setRevertReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevertOpen(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (revertOpen) {
                  revert.mutate({ id: revertOpen, reason: revertReason }, { onSuccess: () => setRevertOpen(null) });
                }
              }}
              disabled={revert.isPending || !revertReason.trim()}
            >
              {revert.isPending ? 'Reverting…' : 'Revert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-xs uppercase text-muted-foreground">{label}</div>
    <div className="font-medium">{value}</div>
  </div>
);

export default TransferTab;
