import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Lock, Unlock, Plus, Calendar } from 'lucide-react';
import { useAccountingPeriods, useUpsertPeriod, AccountingPeriod } from '@/hooks/useAccountingPeriods';
import { useApAuditLog, useRecordApAudit } from '@/hooks/useApAuditLog';

const blank = {
  id: undefined as string | undefined,
  period_start: '',
  period_end: '',
  label: '',
  status: 'open' as AccountingPeriod['status'],
  notes: '',
};

const statusBadge: Record<AccountingPeriod['status'], { label: string; cls: string }> = {
  open:        { label: 'Open',        cls: 'bg-green-100 text-green-800' },
  soft_closed: { label: 'Soft Closed', cls: 'bg-amber-100 text-amber-800' },
  locked:      { label: 'Locked',      cls: 'bg-red-100 text-red-800' },
};

const AccountingPeriodsPage: React.FC = () => {
  const { data: periods = [], isLoading } = useAccountingPeriods();
  const { data: auditEntries = [] } = useApAuditLog({ entity_type: 'period_lock', limit: 50 });
  const upsert = useUpsertPeriod();
  const audit = useRecordApAudit();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof blank>(blank);

  const onSave = async () => {
    if (!form.period_start || !form.period_end) return;
    const saved = await upsert.mutateAsync(form);
    await audit.mutateAsync({
      entity_type: 'period_lock',
      entity_id: saved.id,
      action: form.status === 'locked' ? 'lock' : 'create',
      reference: saved.label || `${saved.period_start} – ${saved.period_end}`,
      after_json: saved,
    });
    setOpen(false);
    setForm(blank);
  };

  const toggleLock = async (p: AccountingPeriod) => {
    const newStatus: AccountingPeriod['status'] = p.status === 'locked' ? 'open' : 'locked';
    if (newStatus === 'locked' &&
        !confirm(`Lock period "${p.label}" (${p.period_start} – ${p.period_end})? No new bills, payments or expenses can be posted in that range until unlocked.`)) {
      return;
    }
    const saved = await upsert.mutateAsync({ ...p, status: newStatus });
    await audit.mutateAsync({
      entity_type: 'period_lock',
      entity_id: p.id,
      action: newStatus === 'locked' ? 'lock' : 'unlock',
      reference: p.label || `${p.period_start} – ${p.period_end}`,
      before_json: { status: p.status },
      after_json: { status: saved.status },
    });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Accounting Periods</h1>
          <p className="text-muted-foreground">
            Lock fiscal periods to prevent backdated bill / payment / expense posting.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(blank); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm(blank)}><Plus className="mr-2 h-4 w-4" />New Period</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? 'Edit' : 'New'} Period</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Period Start *</Label>
                <Input type="date" value={form.period_start} onChange={(e) => setForm(p => ({ ...p, period_start: e.target.value }))} />
              </div>
              <div>
                <Label>Period End *</Label>
                <Input type="date" value={form.period_end} onChange={(e) => setForm(p => ({ ...p, period_end: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Label</Label>
                <Input value={form.label} onChange={(e) => setForm(p => ({ ...p, label: e.target.value }))} placeholder="FY24-25 Q1" />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onSave} disabled={upsert.isPending}>{upsert.isPending ? 'Saving…' : 'Save'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Periods</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : periods.length === 0 ? <p className="text-sm text-muted-foreground">No periods configured. Add one to enable period locking.</p>
          : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Locked At</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.label || '—'}</TableCell>
                    <TableCell>{p.period_start}</TableCell>
                    <TableCell>{p.period_end}</TableCell>
                    <TableCell><Badge className={statusBadge[p.status].cls}>{statusBadge[p.status].label}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.locked_at ? new Date(p.locked_at).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => toggleLock(p)}>
                        {p.status === 'locked'
                          ? <><Unlock className="mr-1 h-3 w-3" />Unlock</>
                          : <><Lock className="mr-1 h-3 w-3" />Lock</>}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Lock / Unlock History (last 50)</CardTitle></CardHeader>
        <CardContent>
          {auditEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lock changes yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditEntries.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(a.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline">{a.action}</Badge></TableCell>
                    <TableCell>{a.reference}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.actor_email || a.actor_id || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountingPeriodsPage;
