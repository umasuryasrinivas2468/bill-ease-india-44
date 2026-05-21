import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, AlertTriangle, Plus, CheckCircle2, XCircle } from 'lucide-react';
import {
  useCovenants,
  useCovenantAlerts,
  useCreateCovenant,
  useRecordCovenantCheck,
} from '@/hooks/useLiabilityExtensions';
import { useLiabilities } from '@/hooks/useLiabilities';
import type {
  CovenantCheckStatus,
  CovenantFrequency,
  CovenantType,
  CreateCovenantInput,
  RecordCovenantCheckInput,
} from '@/types/liabilityExtensions';

const today = () => new Date().toISOString().slice(0, 10);

const CovenantsList: React.FC = () => {
  const { data: covenants = [] } = useCovenants();
  const { data: alerts = [] } = useCovenantAlerts(30);
  const { data: liabilities = [] } = useLiabilities();
  const create = useCreateCovenant();
  const record = useRecordCovenantCheck();

  const [createOpen, setCreateOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<CreateCovenantInput>({
    liability_id: '',
    covenant_type: 'financial_ratio',
    title: '',
    check_frequency: 'quarterly',
    reminder_days_before: 14,
  });
  const [checkDraft, setCheckDraft] = useState<Omit<RecordCovenantCheckInput, 'covenant_id'>>({
    check_date: today(),
    status: 'met',
  });

  const overdueCount = alerts.filter((a) => a.is_overdue).length;
  const breachedCount = covenants.filter((c) => c.latest_status === 'breached').length;

  const submitCreate = () => {
    if (!draft.liability_id || !draft.title.trim()) return;
    create.mutate(draft, {
      onSuccess: () => {
        setCreateOpen(false);
        setDraft({
          liability_id: '',
          covenant_type: 'financial_ratio',
          title: '',
          check_frequency: 'quarterly',
          reminder_days_before: 14,
        });
      },
    });
  };

  const submitCheck = (covenantId: string) => {
    record.mutate({ ...checkDraft, covenant_id: covenantId }, {
      onSuccess: () => {
        setCheckOpen(null);
        setCheckDraft({ check_date: today(), status: 'met' });
      },
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Covenants & Compliance</h1>
          <p className="text-sm text-muted-foreground">
            Loan conditions, financial-ratio thresholds, and submission deadlines.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={liabilities.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> New covenant
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Active</div><div className="text-2xl font-bold">{covenants.filter(c => c.is_active).length}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Breached</div><div className="text-2xl font-bold text-red-600">{breachedCount}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Due in 30d</div><div className="text-2xl font-bold text-amber-600">{alerts.length - overdueCount}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Overdue checks</div><div className="text-2xl font-bold text-red-600">{overdueCount}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">All covenants</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Liability</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Cadence</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead>Latest</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {covenants.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.title}</div>
                    {c.description && <div className="text-xs text-muted-foreground max-w-[280px] truncate">{c.description}</div>}
                  </TableCell>
                  <TableCell>
                    <Link to={`/liabilities/${c.liability_id}`} className="text-primary hover:underline text-sm">
                      <div>{c.liability_name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{c.liability_code}</div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {c.covenant_type.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.metric && c.threshold_operator && c.threshold_value != null
                      ? `${c.metric} ${c.threshold_operator} ${c.threshold_value}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-xs capitalize">{c.check_frequency.replace('_', ' ')}</TableCell>
                  <TableCell className="text-xs">{c.next_check_due || '—'}</TableCell>
                  <TableCell>
                    {c.latest_status ? (
                      <Badge
                        variant={
                          c.latest_status === 'breached' ? 'destructive' :
                          c.latest_status === 'met' ? 'default' :
                          'secondary'
                        }
                        className="text-[10px] capitalize"
                      >
                        {c.latest_status}
                      </Badge>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setCheckOpen(c.id); setCheckDraft({ check_date: today(), status: 'met' }); }}
                    >
                      Record check
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {covenants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                    No covenants recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New covenant */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New covenant</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Liability</Label>
              <Select value={draft.liability_id} onValueChange={(v) => setDraft({ ...draft, liability_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select liability" /></SelectTrigger>
                <SelectContent>
                  {liabilities.filter(l => l.status === 'active').map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name} ({l.liability_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Covenant type</Label>
              <Select value={draft.covenant_type} onValueChange={(v) => setDraft({ ...draft, covenant_type: v as CovenantType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="financial_ratio">Financial ratio</SelectItem>
                  <SelectItem value="document_submission">Document submission</SelectItem>
                  <SelectItem value="payment_obligation">Payment obligation</SelectItem>
                  <SelectItem value="reporting_deadline">Reporting deadline</SelectItem>
                  <SelectItem value="operational">Operational</SelectItem>
                  <SelectItem value="negative_pledge">Negative pledge</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Debt-to-equity below 2.5x" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={2} value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            {draft.covenant_type === 'financial_ratio' && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Metric</Label>
                    <Input value={draft.metric || ''} onChange={(e) => setDraft({ ...draft, metric: e.target.value })} placeholder="debt_to_equity" />
                  </div>
                  <div>
                    <Label>Operator</Label>
                    <Select value={draft.threshold_operator || ''} onValueChange={(v) => setDraft({ ...draft, threshold_operator: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="<">&lt;</SelectItem>
                        <SelectItem value="<=">&le;</SelectItem>
                        <SelectItem value=">">&gt;</SelectItem>
                        <SelectItem value=">=">&ge;</SelectItem>
                        <SelectItem value="=">=</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Threshold</Label>
                    <Input type="number" step="0.01" value={draft.threshold_value || ''} onChange={(e) => setDraft({ ...draft, threshold_value: Number(e.target.value) })} />
                  </div>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cadence</Label>
                <Select value={draft.check_frequency || 'quarterly'} onValueChange={(v) => setDraft({ ...draft, check_frequency: v as CovenantFrequency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="semi_annual">Semi-annual</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="one_time">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Next check due</Label>
                <Input type="date" value={draft.next_check_due || ''} onChange={(e) => setDraft({ ...draft, next_check_due: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Document URL</Label>
              <Input value={draft.document_url || ''} onChange={(e) => setDraft({ ...draft, document_url: e.target.value })} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record check */}
      <Dialog open={!!checkOpen} onOpenChange={(o) => !o && setCheckOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record compliance check</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Check date</Label>
                <Input type="date" value={checkDraft.check_date} onChange={(e) => setCheckDraft({ ...checkDraft, check_date: e.target.value })} />
              </div>
              <div>
                <Label>Period label</Label>
                <Input value={checkDraft.period_label || ''} onChange={(e) => setCheckDraft({ ...checkDraft, period_label: e.target.value })} placeholder="Q2 FY26" />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={checkDraft.status} onValueChange={(v) => setCheckDraft({ ...checkDraft, status: v as CovenantCheckStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="met"><CheckCircle2 className="inline h-3.5 w-3.5 mr-1 text-emerald-600" />Met</SelectItem>
                  <SelectItem value="breached"><XCircle className="inline h-3.5 w-3.5 mr-1 text-red-600" />Breached</SelectItem>
                  <SelectItem value="waived">Waived</SelectItem>
                  <SelectItem value="not_applicable">Not applicable</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observed value (for ratio covenants)</Label>
              <Input
                type="number"
                step="0.0001"
                value={checkDraft.observed_value || ''}
                onChange={(e) => setCheckDraft({ ...checkDraft, observed_value: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                If you mark 'Met' but this value violates the threshold, it will be auto-promoted to 'Breached'.
              </p>
            </div>
            <div>
              <Label>Evidence URL</Label>
              <Input value={checkDraft.evidence_url || ''} onChange={(e) => setCheckDraft({ ...checkDraft, evidence_url: e.target.value })} />
            </div>
            <div>
              <Label>Remarks</Label>
              <Textarea rows={2} value={checkDraft.remarks || ''} onChange={(e) => setCheckDraft({ ...checkDraft, remarks: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckOpen(null)}>Cancel</Button>
            <Button onClick={() => checkOpen && submitCheck(checkOpen)} disabled={record.isPending}>
              {record.isPending ? 'Saving…' : 'Record check'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CovenantsList;
