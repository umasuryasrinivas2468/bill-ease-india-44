import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Lock, LockOpen, ShieldAlert, Loader2 } from 'lucide-react';
import { fetchPeriodLocks, lockPeriod, unlockPeriod, PeriodLock } from '@/services/financialStatementsService';
import { toast } from 'sonner';

export default function PeriodLockManager() {
  const { user } = useUser();
  const [locks, setLocks] = useState<PeriodLock[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openLockDialog, setOpenLockDialog] = useState(false);
  const [lockThrough, setLockThrough] = useState<string>('');
  const [fiscalYear, setFiscalYear] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    setLocks(await fetchPeriodLocks(user.id));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const handleLock = async () => {
    if (!user?.id || !lockThrough) return;
    setBusy(true);
    try {
      await lockPeriod(user.id, lockThrough, fiscalYear || undefined, reason || undefined);
      toast.success(`Period locked through ${lockThrough}`);
      setOpenLockDialog(false);
      setLockThrough(''); setFiscalYear(''); setReason('');
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to lock period');
    } finally { setBusy(false); }
  };

  const handleUnlock = async (id: string) => {
    if (!user?.id) return;
    const why = window.prompt('Reason for unlocking? (recorded in audit log)');
    if (why === null) return;
    setBusy(true);
    try {
      await unlockPeriod(user.id, id, why || undefined);
      toast.success('Period unlocked');
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to unlock');
    } finally { setBusy(false); }
  };

  const activeLock = locks.find(l => l.is_active);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            Period Lock
          </CardTitle>
          <CardDescription>
            Lock closed periods so journals dated on/before the lock date cannot be modified — required for audit integrity.
          </CardDescription>
        </div>

        <Dialog open={openLockDialog} onOpenChange={setOpenLockDialog}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Lock className="h-4 w-4 mr-1.5" />
              Lock period
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Lock financial period</DialogTitle>
              <DialogDescription>
                Once locked, no journal dated on or before the lock date can be inserted, updated, or deleted.
                You can unlock later — every unlock is logged.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="lock-through">Lock through (inclusive) *</Label>
                <Input id="lock-through" type="date" value={lockThrough} onChange={e => setLockThrough(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fy">Fiscal year (optional)</Label>
                <Input id="fy" placeholder="2025-26" value={fiscalYear} onChange={e => setFiscalYear(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reason">Reason (optional)</Label>
                <Input id="reason" placeholder="FY close · audit sign-off" value={reason} onChange={e => setReason(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenLockDialog(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleLock} disabled={busy || !lockThrough}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Lock className="h-4 w-4 mr-1.5" />}
                Confirm lock
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {activeLock ? (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30 dark:border-amber-800">
            <div className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4 text-amber-600" />
              <span className="font-medium">Books are locked through {new Date(activeLock.lock_through).toLocaleDateString('en-IN')}</span>
              {activeLock.fiscal_year && <Badge variant="outline">{activeLock.fiscal_year}</Badge>}
            </div>
            {activeLock.reason && <div className="ml-6 mt-1 text-xs text-muted-foreground">{activeLock.reason}</div>}
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:bg-emerald-950/30 dark:border-emerald-800">
            <div className="flex items-center gap-2 text-sm">
              <LockOpen className="h-4 w-4 text-emerald-600" />
              <span className="font-medium">No active period lock — all journals are editable.</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading lock history…
          </div>
        ) : locks.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No lock history yet.</div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Locked through</th>
                  <th className="px-3 py-2 text-left font-medium">FY</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                  <th className="px-3 py-2 text-left font-medium">Locked at</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {locks.map(l => (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2">{new Date(l.lock_through).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-2">{l.fiscal_year ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.reason ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(l.locked_at).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">
                      {l.is_active
                        ? <Badge>Active</Badge>
                        : <Badge variant="secondary">Unlocked</Badge>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.is_active && (
                        <Button size="sm" variant="ghost" onClick={() => handleUnlock(l.id)} disabled={busy}>
                          <LockOpen className="h-3.5 w-3.5 mr-1" /> Unlock
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
