import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CalendarRange, Plus } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useInvoices } from '@/hooks/useInvoices';
import { normalizeUserId } from '@/lib/userUtils';
import { formatINR } from '@/lib/gst';

interface Schedule {
  id: string;
  invoice_id: string;
  contract_value: number;
  start_date: string;
  end_date: string;
  recognition_frequency: 'monthly' | 'quarterly' | 'milestone';
  notes?: string;
}

// #5 Revenue Recognition Layer — for service firms with milestones or
// retainers. ₹6L annual contract → recognize ₹50k monthly. Schedule rows
// are split into period buckets and rolled up to "recognized this month".
const RevenueRecognitionPanel: React.FC = () => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  const { data: invoices = [] } = useInvoices();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [invoiceId, setInvoiceId] = useState('');
  const [contractValue, setContractValue] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [freq, setFreq] = useState<'monthly' | 'quarterly' | 'milestone'>('monthly');
  const [notes, setNotes] = useState('');

  const { data: schedules = [] } = useQuery({
    queryKey: ['rev-rec-schedules', uid],
    queryFn: async () => {
      if (!uid) return [];
      const { data, error } = await supabase
        .from('revenue_recognition_schedules')
        .select('*')
        .eq('user_id', uid)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data || []) as Schedule[];
    },
    enabled: !!uid,
  });

  const monthsBetween = (s: string, e: string) => {
    const a = new Date(s); const b = new Date(e);
    return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error('Not signed in');
      const value = Number(contractValue);
      if (!invoiceId || !value || !start || !end) throw new Error('Fill all required fields');
      const { data: schedule, error: e1 } = await supabase
        .from('revenue_recognition_schedules')
        .insert({
          user_id: uid,
          invoice_id: invoiceId,
          contract_value: value,
          start_date: start,
          end_date: end,
          recognition_frequency: freq,
          notes,
        })
        .select()
        .single();
      if (e1) throw e1;
      // Spawn periods
      if (freq !== 'milestone') {
        const periods = freq === 'monthly' ? monthsBetween(start, end) : Math.max(1, Math.ceil(monthsBetween(start, end) / 3));
        const perAmount = Math.round((value / periods) * 100) / 100;
        const rows = [];
        for (let p = 0; p < periods; p++) {
          const ps = new Date(start);
          ps.setMonth(ps.getMonth() + (freq === 'monthly' ? p : p * 3));
          const pe = new Date(ps);
          pe.setMonth(pe.getMonth() + (freq === 'monthly' ? 1 : 3));
          pe.setDate(pe.getDate() - 1);
          rows.push({
            schedule_id: schedule.id,
            user_id: uid,
            period_start: ps.toISOString().slice(0, 10),
            period_end: pe.toISOString().slice(0, 10),
            amount: perAmount,
          });
        }
        const { error: e2 } = await supabase.from('revenue_recognition_periods').insert(rows);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast({ title: 'Schedule created' });
      qc.invalidateQueries({ queryKey: ['rev-rec-schedules', uid] });
      setInvoiceId(''); setContractValue(''); setStart(''); setEnd(''); setNotes('');
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const totals = useMemo(() => {
    const today = new Date();
    let recognizedToDate = 0;
    let totalContract = 0;
    schedules.forEach((s: Schedule) => {
      totalContract += Number(s.contract_value);
      const sd = new Date(s.start_date), ed = new Date(s.end_date);
      const months = monthsBetween(s.start_date, s.end_date);
      const elapsed = Math.max(0, Math.min(months, monthsBetween(s.start_date, today.toISOString().slice(0, 10))));
      recognizedToDate += (Number(s.contract_value) / months) * elapsed;
    });
    return { recognizedToDate, totalContract, deferred: totalContract - recognizedToDate };
  }, [schedules]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5" /> Revenue Recognition Layer
        </CardTitle>
        <CardDescription>
          Spread retainers and annual contracts across months — example: ₹6L annual = ₹50k / month.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total contracts</div>
            <div className="text-lg font-semibold">{formatINR(totals.totalContract)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Recognized to date</div>
            <div className="text-lg font-semibold text-green-600">{formatINR(totals.recognizedToDate)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Deferred</div>
            <div className="text-lg font-semibold text-blue-600">{formatINR(totals.deferred)}</div>
          </CardContent></Card>
        </div>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-sm">New schedule</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs">Invoice</Label>
                <Select value={invoiceId} onValueChange={setInvoiceId}>
                  <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
                  <SelectContent>
                    {invoices.map((i: any) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.invoice_number} — {i.client_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Contract value</Label>
                <Input type="number" value={contractValue} onChange={(e) => setContractValue(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Frequency</Label>
                <Select value={freq} onValueChange={(v) => setFreq(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="milestone">Milestone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <Input
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="max-w-md"
              />
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                <Plus className="h-4 w-4 mr-2" /> Create schedule
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead className="text-right">Per period</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No schedules yet.</TableCell></TableRow>
              )}
              {schedules.map((s: Schedule) => {
                const months = monthsBetween(s.start_date, s.end_date);
                const periods = s.recognition_frequency === 'monthly' ? months
                              : s.recognition_frequency === 'quarterly' ? Math.max(1, Math.ceil(months / 3)) : 1;
                const per = Number(s.contract_value) / periods;
                const inv = invoices.find((i: any) => i.id === s.invoice_id);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">
                      {inv?.invoice_number || s.invoice_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{formatINR(s.contract_value)}</TableCell>
                    <TableCell className="text-xs">{s.start_date} → {s.end_date}</TableCell>
                    <TableCell><Badge variant="outline">{s.recognition_frequency}</Badge></TableCell>
                    <TableCell className="text-right">{formatINR(per)}</TableCell>
                    <TableCell className="text-xs">{s.notes || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default RevenueRecognitionPanel;
