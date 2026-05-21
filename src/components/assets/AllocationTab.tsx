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
import { UserRound, Plus, Undo2, AlertTriangle, FileText } from 'lucide-react';
import {
  useAllocations,
  useAssetAllocationSummary,
  useCreateAllocation,
  useReturnAllocation,
} from '@/hooks/useAssetAllocation';
import type {
  AllocatedToType,
  AllocationCondition,
  CreateAllocationInput,
  ReturnAllocationInput,
} from '@/types/assetAllocation';

const today = () => new Date().toISOString().slice(0, 10);

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const daysFromNow = (iso: string) => {
  const t = new Date(today() + 'T00:00:00Z').getTime();
  const d = new Date(iso + 'T00:00:00Z').getTime();
  return Math.round((d - t) / (1000 * 60 * 60 * 24));
};

interface Props {
  assetId: string;
  assetName: string;
}

const AllocationTab: React.FC<Props> = ({ assetId, assetName }) => {
  const { data: allocations = [] } = useAllocations({ assetId });
  const { data: summary } = useAssetAllocationSummary(assetId);
  const createAlloc = useCreateAllocation();
  const returnAlloc = useReturnAllocation();

  const [issueOpen, setIssueOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState<string | null>(null);

  const [issueDraft, setIssueDraft] = useState<CreateAllocationInput>({
    asset_id: assetId,
    allocated_to_type: 'employee',
    employee_name: '',
    issued_on: today(),
    condition_on_issue: 'good',
  });

  const [returnDraft, setReturnDraft] = useState<Omit<ReturnAllocationInput, 'allocation_id'>>({
    returned_on: today(),
    condition_on_return: 'good',
    damage_value: 0,
  });

  const activeAlloc = allocations.find((a) => a.status === 'active' || a.status === 'overdue');

  const submitIssue = () => {
    if (!issueDraft.employee_name.trim()) return;
    createAlloc.mutate({ ...issueDraft, asset_id: assetId }, {
      onSuccess: () => {
        setIssueOpen(false);
        setIssueDraft({
          asset_id: assetId,
          allocated_to_type: 'employee',
          employee_name: '',
          issued_on: today(),
          condition_on_issue: 'good',
        });
      },
    });
  };

  const submitReturn = (id: string) => {
    returnAlloc.mutate(
      { ...returnDraft, allocation_id: id },
      {
        onSuccess: () => {
          setReturnOpen(null);
          setReturnDraft({ returned_on: today(), condition_on_return: 'good', damage_value: 0 });
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <UserRound className="h-3.5 w-3.5" /> Current holder
            </div>
            <div className="text-sm font-bold">
              {activeAlloc?.employee_name || '— in stores —'}
            </div>
            {activeAlloc?.designation && (
              <div className="text-xs text-muted-foreground">{activeAlloc.designation}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Lifetime allocations</div>
            <div className="text-xl font-bold">{summary?.lifetime_allocations || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Damage events</div>
            <div className="text-xl font-bold text-amber-600">{summary?.damage_events || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Lifetime damage value</div>
            <div className="text-xl font-bold">{inr(summary?.lifetime_damage_value || 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Allocation history */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Allocation history</CardTitle>
          <Button
            size="sm"
            onClick={() => setIssueOpen(true)}
            disabled={!!activeAlloc}
            title={activeAlloc ? 'Return the current allocation first' : ''}
          >
            <Plus className="h-4 w-4 mr-1" /> Issue
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issued on</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead>Dept / Team</TableHead>
                <TableHead>Expected back</TableHead>
                <TableHead>Returned</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((a) => {
                const isLive = a.status === 'active' || a.status === 'overdue';
                const overdueDays = a.expected_return_on && isLive ? -daysFromNow(a.expected_return_on) : 0;
                const isOverdue = isLive && overdueDays > 0;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{a.issued_on}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{a.employee_name}</div>
                      {a.employee_email && (
                        <div className="text-xs text-muted-foreground">{a.employee_email}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {[a.department, a.team_name].filter(Boolean).join(' · ') || '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.expected_return_on || '—'}
                      {isOverdue && (
                        <div className="text-xs text-red-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> {overdueDays}d overdue
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{a.returned_on || '—'}</TableCell>
                    <TableCell className="text-xs">
                      <span className="capitalize">{a.condition_on_issue}</span>
                      {a.condition_on_return && (
                        <span className="text-muted-foreground"> → <span className="capitalize">{a.condition_on_return}</span></span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          a.status === 'lost' || a.status === 'damaged' ? 'destructive' :
                          a.status === 'returned' ? 'secondary' :
                          a.status === 'overdue' ? 'destructive' :
                          'default'
                        }
                        className="text-[10px] capitalize"
                      >
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {a.acknowledgement_url && (
                        <a href={a.acknowledgement_url} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost" title="Handover doc">
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                      {isLive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setReturnOpen(a.id);
                            setReturnDraft({
                              returned_on: today(),
                              condition_on_return: 'good',
                              damage_value: 0,
                            });
                          }}
                        >
                          <Undo2 className="h-3.5 w-3.5 mr-1" /> Return
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {allocations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                    Not yet allocated.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Issue dialog */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Issue {assetName}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Allocated to</Label>
                <Select
                  value={issueDraft.allocated_to_type || 'employee'}
                  onValueChange={(v) => setIssueDraft({ ...issueDraft, allocated_to_type: v as AllocatedToType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="department">Department</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Issued on</Label>
                <Input type="date" value={issueDraft.issued_on} onChange={(e) => setIssueDraft({ ...issueDraft, issued_on: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Holder name</Label>
              <Input
                value={issueDraft.employee_name}
                onChange={(e) => setIssueDraft({ ...issueDraft, employee_name: e.target.value })}
                placeholder="e.g. Priya Sharma"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={issueDraft.employee_email || ''}
                  onChange={(e) => setIssueDraft({ ...issueDraft, employee_email: e.target.value })}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={issueDraft.employee_phone || ''}
                  onChange={(e) => setIssueDraft({ ...issueDraft, employee_phone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Department</Label>
                <Input
                  value={issueDraft.department || ''}
                  onChange={(e) => setIssueDraft({ ...issueDraft, department: e.target.value })}
                />
              </div>
              <div>
                <Label>Team</Label>
                <Input
                  value={issueDraft.team_name || ''}
                  onChange={(e) => setIssueDraft({ ...issueDraft, team_name: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Designation</Label>
              <Input
                value={issueDraft.designation || ''}
                onChange={(e) => setIssueDraft({ ...issueDraft, designation: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Expected return</Label>
                <Input
                  type="date"
                  value={issueDraft.expected_return_on || ''}
                  onChange={(e) => setIssueDraft({ ...issueDraft, expected_return_on: e.target.value })}
                />
              </div>
              <div>
                <Label>Condition on issue</Label>
                <Select
                  value={issueDraft.condition_on_issue || 'good'}
                  onValueChange={(v) => setIssueDraft({ ...issueDraft, condition_on_issue: v as AllocationCondition })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Signed handover URL</Label>
              <Input
                value={issueDraft.acknowledgement_url || ''}
                onChange={(e) => setIssueDraft({ ...issueDraft, acknowledgement_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={issueDraft.notes || ''}
                onChange={(e) => setIssueDraft({ ...issueDraft, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button onClick={submitIssue} disabled={createAlloc.isPending}>
              {createAlloc.isPending ? 'Issuing…' : 'Issue asset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return dialog */}
      <Dialog open={!!returnOpen} onOpenChange={(o) => !o && setReturnOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Return allocation</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Returned on</Label>
              <Input
                type="date"
                value={returnDraft.returned_on}
                onChange={(e) => setReturnDraft({ ...returnDraft, returned_on: e.target.value })}
              />
            </div>
            <div>
              <Label>Condition on return</Label>
              <Select
                value={returnDraft.condition_on_return}
                onValueChange={(v) =>
                  setReturnDraft({ ...returnDraft, condition_on_return: v as AllocationCondition })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="new">Like new</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(returnDraft.condition_on_return === 'damaged' || returnDraft.condition_on_return === 'lost') && (
              <>
                <div>
                  <Label>Damage / replacement value</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={returnDraft.damage_value || ''}
                    onChange={(e) => setReturnDraft({ ...returnDraft, damage_value: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Damage notes</Label>
                  <Textarea
                    rows={2}
                    value={returnDraft.damage_notes || ''}
                    onChange={(e) => setReturnDraft({ ...returnDraft, damage_notes: e.target.value })}
                  />
                </div>
              </>
            )}
            <div>
              <Label>Return document URL</Label>
              <Input
                value={returnDraft.return_document_url || ''}
                onChange={(e) => setReturnDraft({ ...returnDraft, return_document_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(null)}>Cancel</Button>
            <Button
              onClick={() => returnOpen && submitReturn(returnOpen)}
              disabled={returnAlloc.isPending}
            >
              {returnAlloc.isPending ? 'Saving…' : 'Confirm return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AllocationTab;
