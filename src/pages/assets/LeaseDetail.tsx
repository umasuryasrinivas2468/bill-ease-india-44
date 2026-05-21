import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, CheckCircle2, AlertCircle, Play, Square } from 'lucide-react';
import {
  useLease,
  useLeaseSchedule,
  useActivateLease,
  usePostLeasePayment,
  useTerminateLease,
} from '@/hooks/useLease';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const today = () => new Date().toISOString().slice(0, 10);

const LeaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: lease, isLoading } = useLease(id);
  const { data: schedule = [] } = useLeaseSchedule(id);
  const activate = useActivateLease();
  const postPayment = usePostLeasePayment();
  const terminate = useTerminateLease();

  const [termOpen, setTermOpen] = useState(false);
  const [termDraft, setTermDraft] = useState({
    termination_date: today(),
    reason: '',
    write_off_remaining_liability: true,
  });
  const [payMode, setPayMode] = useState<'bank' | 'cash' | 'credit'>('bank');

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!lease) return <div className="p-6 text-sm text-red-600">Lease not found.</div>;

  const isActive = lease.status === 'active';
  const isClosed = lease.status === 'terminated' || lease.status === 'expired' || lease.status === 'cancelled';
  const dueRows = schedule.filter((r) => r.status === 'planned' && new Date(r.due_date) <= new Date());

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link to="/leases"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{lease.name}</h1>
              <Badge
                variant={isActive ? 'default' : isClosed ? 'secondary' : 'outline'}
                className="capitalize text-[10px]"
              >
                {lease.status}
              </Badge>
              <Badge variant="outline" className="text-[10px] capitalize">{lease.lease_type}</Badge>
            </div>
            <div className="text-sm text-muted-foreground font-mono">{lease.lease_code} • {lease.lessor_name}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {lease.status === 'draft' && (
            <Button onClick={() => activate.mutate(lease.id)} disabled={activate.isPending}>
              <Play className="h-4 w-4 mr-1" /> {activate.isPending ? 'Activating…' : 'Activate'}
            </Button>
          )}
          {isActive && (
            <Button variant="outline" onClick={() => setTermOpen(true)}>
              <Square className="h-4 w-4 mr-1" /> Terminate
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Per-period</div>
            <div className="text-xl font-bold">{inr(lease.payment_amount)}</div>
            <div className="text-xs text-muted-foreground capitalize">{lease.payment_frequency.replace('_', ' ')}</div>
          </CardContent>
        </Card>
        {lease.lease_type === 'finance' ? (
          <>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs uppercase text-muted-foreground">ROU asset</div>
                <div className="text-xl font-bold">{inr(lease.rou_asset_value)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs uppercase text-muted-foreground">Outstanding liability</div>
                <div className="text-xl font-bold text-amber-600">{inr(lease.outstanding_liability)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs uppercase text-muted-foreground">Discount rate</div>
                <div className="text-xl font-bold">{lease.discount_rate_annual}%</div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs uppercase text-muted-foreground">Term</div>
                <div className="text-sm">{lease.start_date} → {lease.end_date}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs uppercase text-muted-foreground">Security deposit</div>
                <div className="text-xl font-bold">{inr(lease.security_deposit)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs uppercase text-muted-foreground">GST / period</div>
                <div className="text-xl font-bold">{inr(lease.gst_amount_per_period)}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {dueRows.length > 0 && isActive && (
        <Card className="border-amber-500/40">
          <CardContent className="pt-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <span><strong>{dueRows.length}</strong> payment{dueRows.length > 1 ? 's' : ''} due to be posted.</span>
            </div>
            <div className="flex items-center gap-2">
              <Select value={payMode} onValueChange={(v) => setPayMode(v as 'bank' | 'cash' | 'credit')}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="credit">On credit</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => dueRows.forEach((r) => postPayment.mutate({ schedule_row_id: r.id, payment_mode: payMode }))}
                disabled={postPayment.isPending}
              >
                Post all due
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment schedule</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {lease.lease_type === 'finance' && <>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Closing liab.</TableHead>
                </>}
                <TableHead className="text-right">GST</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedule.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.period_index}</TableCell>
                  <TableCell className="text-xs">{r.due_date}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.total_payment)}</TableCell>
                  {lease.lease_type === 'finance' && <>
                    <TableCell className="text-right tabular-nums">{inr(r.principal_portion)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(r.interest_portion)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(r.closing_liability)}</TableCell>
                  </>}
                  <TableCell className="text-right tabular-nums">{inr(r.gst_amount)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.status === 'paid' ? 'default' : r.status === 'skipped' ? 'destructive' : 'secondary'}
                      className="text-[10px] capitalize"
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === 'planned' && isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => postPayment.mutate({ schedule_row_id: r.id, payment_mode: payMode })}
                        disabled={postPayment.isPending}
                      >
                        Post
                      </Button>
                    )}
                    {r.status === 'paid' && <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" />}
                  </TableCell>
                </TableRow>
              ))}
              {schedule.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-6 text-sm text-muted-foreground">
                    {lease.status === 'draft' ? 'Activate the lease to generate the schedule.' : 'No schedule.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Terminate dialog */}
      <Dialog open={termOpen} onOpenChange={setTermOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Terminate lease</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Termination date</Label>
              <Input
                type="date"
                value={termDraft.termination_date}
                onChange={(e) => setTermDraft({ ...termDraft, termination_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea
                rows={2}
                value={termDraft.reason}
                onChange={(e) => setTermDraft({ ...termDraft, reason: e.target.value })}
              />
            </div>
            {lease.lease_type === 'finance' && lease.outstanding_liability > 0 && (
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="writeoff"
                  className="mt-1"
                  checked={termDraft.write_off_remaining_liability}
                  onChange={(e) => setTermDraft({ ...termDraft, write_off_remaining_liability: e.target.checked })}
                />
                <Label htmlFor="writeoff" className="font-normal">
                  Write off remaining liability of {inr(lease.outstanding_liability)} (posts{' '}
                  <span className="font-mono">Dr Lease Liability / Cr Gain on Lease Termination</span>)
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTermOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                terminate.mutate(
                  {
                    lease_id: lease.id,
                    termination_date: termDraft.termination_date,
                    reason: termDraft.reason,
                    write_off_remaining_liability: termDraft.write_off_remaining_liability,
                  },
                  { onSuccess: () => setTermOpen(false) },
                );
              }}
              disabled={terminate.isPending}
            >
              {terminate.isPending ? 'Terminating…' : 'Terminate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeaseDetail;
