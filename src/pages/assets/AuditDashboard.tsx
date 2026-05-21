import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { ClipboardCheck, Plus, AlertTriangle } from 'lucide-react';
import CostCenterSelect from '@/components/CostCenterSelect';
import {
  useAuditSessions,
  useStartAuditSession,
} from '@/hooks/useAssetAudit';
import type { CreateAuditSessionInput } from '@/types/assetAudit';

interface ClerkBranch { id: string; name: string; code: string }

const today = () => new Date().toISOString().slice(0, 10);

const AuditDashboard: React.FC = () => {
  const { data: sessions = [] } = useAuditSessions();
  const start = useStartAuditSession();
  const { organization } = useOrganization();
  const branches: ClerkBranch[] = useMemo(() => {
    const md = (organization?.publicMetadata || {}) as any;
    return (md.branches as ClerkBranch[]) || [];
  }, [organization]);
  const branchName = (id?: string | null) => (id ? branches.find((b) => b.id === id)?.name || id : '—');

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CreateAuditSessionInput>({
    title: '',
    scheduled_on: today(),
  });

  const inProgress = sessions.filter((s) => s.status === 'in_progress').length;
  const totalMismatch = sessions.reduce((acc, s) => acc + (s.assets_missing + s.assets_mismatched), 0);

  const submit = () => {
    if (!draft.title.trim()) return;
    start.mutate(draft, {
      onSuccess: () => {
        setOpen(false);
        setDraft({ title: '', scheduled_on: today() });
      },
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Verification & Audit</h1>
          <p className="text-sm text-muted-foreground">
            Physical-verification campaigns and mismatch reports.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Start audit session
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Sessions (lifetime)</div>
            <div className="text-2xl font-bold">{sessions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <ClipboardCheck className="h-3.5 w-3.5" /> In progress
            </div>
            <div className="text-2xl font-bold text-amber-600">{inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Mismatches found
            </div>
            <div className="text-2xl font-bold text-red-600">{totalMismatch}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Closed</div>
            <div className="text-2xl font-bold">{sessions.filter((s) => s.status === 'closed').length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit sessions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="text-right">Progress</TableHead>
                <TableHead className="text-right">Issues</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => {
                const progress =
                  s.assets_in_scope > 0
                    ? Math.round(((s.assets_verified + s.assets_missing + s.assets_mismatched) / s.assets_in_scope) * 100)
                    : 0;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">
                      <Link to={`/assets/audit/${s.id}`} className="text-primary hover:underline">
                        {s.session_code}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{s.title}</div>
                      {s.auditor_name && <div className="text-xs text-muted-foreground">by {s.auditor_name}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{s.scheduled_on}</TableCell>
                    <TableCell className="text-xs">
                      {[
                        s.scope_branch_id ? `Branch: ${branchName(s.scope_branch_id)}` : null,
                        s.scope_department ? `Dept: ${s.scope_department}` : null,
                        s.scope_cost_center_id ? 'Cost-centre scoped' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'All assets'}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {s.assets_verified + s.assets_missing + s.assets_mismatched}/{s.assets_in_scope}
                      <div className="text-xs text-muted-foreground">{progress}%</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={s.assets_missing > 0 || s.assets_mismatched > 0 ? 'text-red-600' : ''}>
                        {s.assets_missing + s.assets_mismatched}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.status === 'closed' ? 'secondary' :
                          s.status === 'cancelled' ? 'destructive' :
                          'default'
                        }
                        className="text-[10px] capitalize"
                      >
                        {s.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">
                    No audit sessions yet. Start one with the button above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Start session dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Start audit session</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Q2 2026 physical verification"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Scheduled on</Label>
                <Input
                  type="date"
                  value={draft.scheduled_on}
                  onChange={(e) => setDraft({ ...draft, scheduled_on: e.target.value })}
                />
              </div>
              <div>
                <Label>Next audit due</Label>
                <Input
                  type="date"
                  value={draft.next_audit_due || ''}
                  onChange={(e) => setDraft({ ...draft, next_audit_due: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Auditor</Label>
              <Input
                value={draft.auditor_name || ''}
                onChange={(e) => setDraft({ ...draft, auditor_name: e.target.value })}
              />
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="text-xs font-semibold text-muted-foreground">Scope (leave blank for all assets)</div>
              {branches.length > 0 && (
                <div>
                  <Label>Branch</Label>
                  <Select
                    value={draft.scope_branch_id || ''}
                    onValueChange={(v) => setDraft({ ...draft, scope_branch_id: v || undefined })}
                  >
                    <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Department</Label>
                <Input
                  value={draft.scope_department || ''}
                  onChange={(e) => setDraft({ ...draft, scope_department: e.target.value || undefined })}
                  placeholder="e.g. Finance"
                />
              </div>
              <div>
                <Label>Cost centre</Label>
                <CostCenterSelect
                  value={draft.scope_cost_center_id || null}
                  onChange={(id) => setDraft({ ...draft, scope_cost_center_id: id || undefined })}
                />
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={draft.notes || ''}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={start.isPending}>
              {start.isPending ? 'Starting…' : 'Start session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditDashboard;
