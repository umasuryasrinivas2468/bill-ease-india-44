import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, CheckCircle2 } from 'lucide-react';
import {
  useLiability, useEmiSchedule, useGenerateEmiSchedule, usePayEmi,
} from '@/hooks/useLiabilities';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const LiabilityDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: liab, isLoading } = useLiability(id);
  const { data: schedule = [] } = useEmiSchedule(id);
  const regen = useGenerateEmiSchedule();
  const pay = usePayEmi();

  const [payOpen, setPayOpen] = useState<null | string>(null);
  const [payForm, setPayForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    payment_mode: 'bank' as 'bank' | 'cash',
    amount: '',
  });

  const upcoming = useMemo(
    () => schedule.find((r) => r.status === 'planned' || r.status === 'overdue' || r.status === 'partial'),
    [schedule],
  );

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!liab) return <div className="p-6 text-sm text-red-600">Liability not found.</div>;

  const totalEmis = schedule.length;
  const paidEmis = schedule.filter((r) => r.status === 'paid').length;

  const submitPayment = (emiId: string) => {
    pay.mutate({
      emi_id: emiId,
      payment_date: payForm.payment_date,
      payment_mode: payForm.payment_mode,
      amount: payForm.amount ? Number(payForm.amount) : undefined,
    }, {
      onSuccess: () => setPayOpen(null),
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/liabilities/list"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{liab.name}</h1>
              <Badge variant={liab.status === 'active' ? 'default' : 'secondary'} className="capitalize text-[10px]">{liab.status}</Badge>
            </div>
            <div className="text-sm text-muted-foreground font-mono">{liab.liability_code} • {liab.liability_type.replace('_', ' ')}</div>
          </div>
        </div>
        {liab.liability_type === 'loan' && schedule.length === 0 && (
          <Button onClick={() => regen.mutate(liab.id)} disabled={regen.isPending}>Generate EMI schedule</Button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Principal</div><div className="text-xl font-bold">{inr(liab.principal_amount)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Outstanding</div><div className="text-xl font-bold text-amber-600">{inr(liab.outstanding_principal)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Interest paid</div><div className="text-xl font-bold">{inr(liab.total_interest_paid)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">EMIs</div><div className="text-xl font-bold">{paidEmis} / {totalEmis}</div><div className="text-xs text-muted-foreground">{liab.emi_amount ? `₹${inr(liab.emi_amount)}/EMI` : ''}</div></CardContent></Card>
      </div>

      {upcoming && (
        <Card className="border-amber-500/40">
          <CardContent className="pt-4 flex items-center justify-between">
            <div className="text-sm">
              <div>Next EMI: <strong>EMI {upcoming.emi_number}</strong> due <strong>{upcoming.due_date}</strong></div>
              <div className="text-xs text-muted-foreground">Principal {inr(upcoming.principal_component)} • Interest {inr(upcoming.interest_component)} • Total {inr(upcoming.total_emi)}</div>
            </div>
            <Button onClick={() => { setPayOpen(upcoming.id); setPayForm({ payment_date: new Date().toISOString().slice(0,10), payment_mode: 'bank', amount: '' }); }}>Pay EMI</Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">EMI schedule</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="pt-2">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead className="text-right">Total EMI</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{r.emi_number}</TableCell>
                      <TableCell className="text-xs">{r.due_date}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(r.opening_balance)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(r.principal_component)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(r.interest_component)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{inr(r.total_emi)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(r.closing_balance)}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'paid' ? 'default' : r.status === 'planned' ? 'outline' : r.status === 'overdue' ? 'destructive' : 'secondary'} className="capitalize text-[10px]">{r.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.status !== 'paid' && (
                          <Button size="sm" variant="ghost" onClick={() => { setPayOpen(r.id); setPayForm({ payment_date: new Date().toISOString().slice(0,10), payment_mode: 'bank', amount: '' }); }}>Pay</Button>
                        )}
                        {r.status === 'paid' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      </TableCell>
                    </TableRow>
                  ))}
                  {schedule.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">No EMI schedule. Generate one for loans.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="pt-2">
          <Card>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 pt-5 text-sm">
              <Row label="Lender" value={liab.lender_name || '—'} />
              <Row label="Contact" value={liab.lender_contact || '—'} />
              <Row label="Account number" value={liab.account_number || '—'} />
              <Row label="Start date" value={liab.start_date || '—'} />
              <Row label="End date" value={liab.end_date || '—'} />
              <Row label="Interest rate" value={liab.interest_rate ? `${liab.interest_rate}% (${liab.interest_type})` : '—'} />
              <Row label="Tenure" value={liab.tenure_months ? `${liab.tenure_months} months` : '—'} />
              <Row label="EMI day" value={liab.emi_day_of_month ? `Day ${liab.emi_day_of_month}` : '—'} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment dialog */}
      <Dialog open={!!payOpen} onOpenChange={(open) => !open && setPayOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Pay EMI</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Payment date</Label>
              <Input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} />
            </div>
            <div>
              <Label>Mode</Label>
              <Select value={payForm.payment_mode} onValueChange={(v) => setPayForm({ ...payForm, payment_mode: v as 'bank' | 'cash' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (blank = full EMI)</Label>
              <Input type="number" min={0} step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} placeholder="Leave blank for full EMI" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)}>Cancel</Button>
            <Button onClick={() => payOpen && submitPayment(payOpen)} disabled={pay.isPending}>{pay.isPending ? 'Posting…' : 'Pay & post journal'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="flex justify-between border-b border-dashed border-border/50 pb-1.5">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium">{value}</span>
  </div>
);

export default LiabilityDetail;
