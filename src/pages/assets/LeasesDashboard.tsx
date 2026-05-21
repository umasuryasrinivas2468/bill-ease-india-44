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
import { Building2, Plus, AlertTriangle, CalendarClock } from 'lucide-react';
import {
  useLeases,
  useCreateLease,
  useDueLeasePayments,
} from '@/hooks/useLease';
import type { CreateLeaseInput, LeasePaymentFrequency, LeaseType } from '@/types/lease';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const today = () => new Date().toISOString().slice(0, 10);

const LeasesDashboard: React.FC = () => {
  const { data: leases = [] } = useLeases();
  const { data: due = [] } = useDueLeasePayments(14);
  const create = useCreateLease();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CreateLeaseInput>({
    lease_type: 'operating',
    name: '',
    lessor_name: '',
    start_date: today(),
    end_date: today(),
    payment_frequency: 'monthly',
    payment_amount: 0,
    gst_amount_per_period: 0,
    itc_eligible: true,
    payments_in_advance: false,
    security_deposit: 0,
  });

  const totalOutstanding = leases
    .filter((l) => l.lease_type === 'finance' && l.status === 'active')
    .reduce((s, l) => s + Number(l.outstanding_liability || 0), 0);
  const activeCount = leases.filter((l) => l.status === 'active').length;
  const overdueCount = due.filter((d) => d.is_overdue).length;

  const submit = () => {
    if (!draft.name.trim() || !draft.lessor_name.trim()) return;
    create.mutate(draft, {
      onSuccess: () => {
        setOpen(false);
        setDraft({
          lease_type: 'operating',
          name: '',
          lessor_name: '',
          start_date: today(),
          end_date: today(),
          payment_frequency: 'monthly',
          payment_amount: 0,
          gst_amount_per_period: 0,
          itc_eligible: true,
          payments_in_advance: false,
          security_deposit: 0,
        });
      },
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leased Assets</h1>
          <p className="text-sm text-muted-foreground">
            Operating, finance and rental leases. Ind AS 116 amortisation for finance leases.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New lease
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" /> Active leases
            </div>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Outstanding liability (finance)</div>
            <div className="text-xl font-bold">{inr(totalOutstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" /> Due in 14 days
            </div>
            <div className="text-2xl font-bold text-amber-600">{due.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Overdue
            </div>
            <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Due alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming & overdue lease payments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lease</TableHead>
                <TableHead>Lessor</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {due.map((d) => (
                <TableRow key={d.next_payment.id}>
                  <TableCell>
                    <Link to={`/leases/${d.lease.id}`} className="text-primary hover:underline">
                      <div className="font-medium">{d.lease.name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{d.lease.lease_code}</div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{d.lease.lessor_name}</TableCell>
                  <TableCell className="text-xs">#{d.next_payment.period_index}</TableCell>
                  <TableCell className="text-xs">{d.next_payment.due_date}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(d.next_payment.total_payment + d.next_payment.gst_amount)}</TableCell>
                  <TableCell className="text-right">
                    {d.is_overdue ? (
                      <Badge variant="destructive" className="text-[10px]">{Math.abs(d.days_until_due)}d overdue</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">in {d.days_until_due}d</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {due.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                    No lease payments due in the next 14 days.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All leases</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Lease</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Lessor</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Per-period</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leases.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">
                    <Link to={`/leases/${l.id}`} className="text-primary hover:underline">{l.lease_code}</Link>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{l.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">{l.lease_type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{l.lessor_name}</TableCell>
                  <TableCell className="text-xs">{l.start_date} → {l.end_date}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(l.payment_amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.lease_type === 'finance' ? inr(l.outstanding_liability) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        l.status === 'active' ? 'default' :
                        l.status === 'terminated' || l.status === 'cancelled' ? 'destructive' :
                        'secondary'
                      }
                      className="text-[10px] capitalize"
                    >
                      {l.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {leases.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                    No leases yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New lease dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New lease contract</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={draft.lease_type} onValueChange={(v) => setDraft({ ...draft, lease_type: v as LeaseType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operating">Operating</SelectItem>
                    <SelectItem value="finance">Finance (Ind AS 116)</SelectItem>
                    <SelectItem value="rental">Rental</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Office space — 5th floor" />
              </div>
            </div>

            <div>
              <Label>Lessor</Label>
              <Input value={draft.lessor_name} onChange={(e) => setDraft({ ...draft, lessor_name: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start</Label>
                <Input type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
              </div>
              <div>
                <Label>End</Label>
                <Input type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequency</Label>
                <Select value={draft.payment_frequency || 'monthly'} onValueChange={(v) => setDraft({ ...draft, payment_frequency: v as LeasePaymentFrequency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="semi_annual">Semi-annual</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment / period</Label>
                <Input type="number" min={0} step="0.01" value={draft.payment_amount || ''} onChange={(e) => setDraft({ ...draft, payment_amount: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>GST / period</Label>
                <Input type="number" min={0} step="0.01" value={draft.gst_amount_per_period || ''} onChange={(e) => setDraft({ ...draft, gst_amount_per_period: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Security deposit</Label>
                <Input type="number" min={0} step="0.01" value={draft.security_deposit || ''} onChange={(e) => setDraft({ ...draft, security_deposit: Number(e.target.value) })} />
              </div>
            </div>

            {draft.lease_type === 'finance' && (
              <div>
                <Label>Discount rate (annual %)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.discount_rate_annual || ''}
                  onChange={(e) => setDraft({ ...draft, discount_rate_annual: Number(e.target.value) })}
                  placeholder="e.g. 9.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used to compute present value of payments and split each payment into principal + interest.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="adv"
                  checked={draft.payments_in_advance || false}
                  onChange={(e) => setDraft({ ...draft, payments_in_advance: e.target.checked })}
                />
                <Label htmlFor="adv" className="font-normal">Payments in advance</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="itc"
                  checked={draft.itc_eligible ?? true}
                  onChange={(e) => setDraft({ ...draft, itc_eligible: e.target.checked })}
                />
                <Label htmlFor="itc" className="font-normal">GST is ITC eligible</Label>
              </div>
            </div>

            <div>
              <Label>Document URL</Label>
              <Input value={draft.document_url || ''} onChange={(e) => setDraft({ ...draft, document_url: e.target.value })} placeholder="https://..." />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </div>

            <div className="rounded-md bg-muted p-3 text-xs">
              Saved as <strong>draft</strong>. Activate from the detail page to generate the schedule
              {draft.lease_type === 'finance' && <> and post the recognition journal (Dr ROU Asset / Cr Lease Liability)</>}.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save lease'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeasesDashboard;
