import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calculator, FileText, GitMerge, Save, Plus, Building2, Sparkles } from 'lucide-react';
import {
  fetchTcsDashboard, fetchTcsCompanyConfig, upsertTcsCompanyConfig,
  computeTcsForAmount, listTcsChallans, createTcsChallan,
} from '@/services/taxComplianceService';
import { toast } from '@/hooks/use-toast';

const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const TCS_SECTIONS = [
  { code: '206C(1)',  label: '206C(1) — Alcohol / Forest Produce (1%)' },
  { code: '206C(1F)', label: '206C(1F) — Motor Vehicle > 10L (1%)' },
  { code: '206C(1G)', label: '206C(1G) — Foreign Remit / Tour (5%)' },
  { code: '206C(1H)', label: '206C(1H) — Sale of Goods > 50L (0.10%)' },
  { code: '206CCA',   label: '206CCA — Non-filer Higher (5%)' },
  { code: '206C(C)',  label: '206C(C) — Tendu Leaves (5%)' },
  { code: '206C(F)',  label: '206C(F) — Timber (2.5%)' },
  { code: '206C(I)',  label: '206C(I) — Minerals (1%)' },
  { code: '206C(C1)', label: '206C(C1) — Scrap (1%)' },
  { code: '206C(E)',  label: '206C(E) — Parking / Toll (2%)' },
];

interface Props { fy: string; }

const TcsEnginePanel: React.FC<Props> = ({ fy }) => {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="dashboard">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="dashboard" className="gap-1.5"><FileText className="h-3.5 w-3.5"/>Dashboard</TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5"><Building2 className="h-3.5 w-3.5"/>Config</TabsTrigger>
          <TabsTrigger value="calculator" className="gap-1.5"><Calculator className="h-3.5 w-3.5"/>Calculator</TabsTrigger>
          <TabsTrigger value="challans" className="gap-1.5"><GitMerge className="h-3.5 w-3.5"/>Challans</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4"><TcsDashboard fy={fy}/></TabsContent>
        <TabsContent value="config" className="mt-4"><TcsConfigForm/></TabsContent>
        <TabsContent value="calculator" className="mt-4"><TcsCalculator/></TabsContent>
        <TabsContent value="challans" className="mt-4"><TcsChallansTable fy={fy}/></TabsContent>
      </Tabs>
    </div>
  );
};

const TcsDashboard: React.FC<{fy: string}> = ({fy}) => {
  const { user } = useUser();
  const { data, isLoading } = useQuery({
    queryKey: ['tcs-dashboard', user?.id, fy],
    queryFn: () => user?.id ? fetchTcsDashboard(user.id, fy) : Promise.resolve(null),
    enabled: !!user?.id,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Total Collected</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmtINR(data?.total_collected)}</div></CardContent>
        </Card>
        <Card><CardHeader className="pb-2"><CardDescription>Total Paid (Challans)</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmtINR(data?.total_paid)}</div></CardContent>
        </Card>
        <Card><CardHeader className="pb-2"><CardDescription>Payable</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-700">{fmtINR(data?.payable)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Section-wise Collection</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Section</TableHead><TableHead>Gross</TableHead>
              <TableHead>TCS</TableHead><TableHead>Count</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data?.section_breakup ?? []).map((s: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{s.section}</TableCell>
                  <TableCell>{fmtINR(s.gross_amount)}</TableCell>
                  <TableCell className="font-semibold">{fmtINR(s.tcs_amount)}</TableCell>
                  <TableCell>{s.count}</TableCell>
                </TableRow>
              ))}
              {(data?.section_breakup ?? []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No TCS collections in {fy}.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

const TcsConfigForm: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['tcs-config', userId],
    queryFn: () => userId ? fetchTcsCompanyConfig(userId) : Promise.resolve(null),
    enabled: !!userId,
  });
  const [form, setForm] = useState<any>({});
  React.useEffect(() => { if (data) setForm(data); }, [data]);

  const save = useMutation({
    mutationFn: async () => userId ? upsertTcsCompanyConfig(userId, form) : null,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tcs-config'] });
      toast({ title: 'Saved', description: 'TCS collector config updated.' });
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">TCS Collector Configuration</CardTitle>
        <CardDescription>TAN, PAN, collector type. Required before filing Form 27EQ.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>TAN</Label>
            <Input value={form.tan ?? ''} onChange={e => setForm({...form, tan: e.target.value})} maxLength={10}/></div>
          <div className="space-y-1.5"><Label>PAN</Label>
            <Input value={form.pan ?? ''} onChange={e => setForm({...form, pan: e.target.value})} maxLength={10}/></div>
          <div className="space-y-1.5"><Label>Collector Type</Label>
            <Select value={form.collector_type ?? ''} onValueChange={v => setForm({...form, collector_type: v})}>
              <SelectTrigger><SelectValue placeholder="Choose"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="firm">Firm</SelectItem>
                <SelectItem value="llp">LLP</SelectItem>
                <SelectItem value="huf">HUF</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="government">Government</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Applicability</Label>
            <Select value={form.applicability ?? ''} onValueChange={v => setForm({...form, applicability: v})}>
              <SelectTrigger><SelectValue placeholder="Choose"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="turnover_above_10cr">Turnover &gt; ₹10 Cr (206C(1H))</SelectItem>
                <SelectItem value="government">Government Body</SelectItem>
                <SelectItem value="non_applicable">Not Applicable</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Responsible Person</Label>
            <Input value={form.responsible_person ?? ''} onChange={e => setForm({...form, responsible_person: e.target.value})}/></div>
          <div className="space-y-1.5"><Label>Responsible PAN</Label>
            <Input value={form.responsible_pan ?? ''} onChange={e => setForm({...form, responsible_pan: e.target.value})} maxLength={10}/></div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
          <Save className="h-4 w-4"/>{save.isPending ? 'Saving…' : 'Save Config'}
        </Button>
      </CardContent>
    </Card>
  );
};

const TcsCalculator: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const [form, setForm] = useState({ amount: 6000000, section: '206C(1H)', customerId: '', customerPan: '' });
  const [result, setResult] = useState<any>(null);

  const compute = useMutation({
    mutationFn: async () => userId ? computeTcsForAmount({
      userId, amount: form.amount, section: form.section,
      customerId: form.customerId || null, customerPan: form.customerPan || null,
    }) : null,
    onSuccess: r => setResult(r),
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-600"/>TCS Auto-Calculator</CardTitle>
        <CardDescription>Given gross amount + section + customer, returns TCS rate, amount, and invoice total (incl. TCS).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5"><Label>Gross Amount</Label>
            <Input type="number" value={form.amount} onChange={e => setForm({...form, amount: parseFloat(e.target.value) || 0})}/></div>
          <div className="space-y-1.5"><Label>Section</Label>
            <Select value={form.section} onValueChange={v => setForm({...form, section: v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{TCS_SECTIONS.map(s => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1.5"><Label>Customer ID (optional)</Label>
            <Input value={form.customerId} onChange={e => setForm({...form, customerId: e.target.value})}/></div>
          <div className="space-y-1.5"><Label>Customer PAN</Label>
            <Input value={form.customerPan} onChange={e => setForm({...form, customerPan: e.target.value})} maxLength={10}/></div>
        </div>
        <Button onClick={() => compute.mutate()} disabled={compute.isPending} className="gap-2">
          <Calculator className="h-4 w-4"/>{compute.isPending ? 'Computing…' : 'Compute TCS'}
        </Button>
        {result && (
          <div className="rounded-md border p-4 space-y-2 bg-slate-50">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={result.tcs_applicable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-800'}>
                {result.tcs_applicable ? 'TCS Applicable' : 'No TCS'}
              </Badge>
              {result.rate_source && <Badge variant="outline">Rate source: {result.rate_source}</Badge>}
              {result.reason && <Badge variant="outline">{result.reason}</Badge>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div><div className="text-xs text-muted-foreground">Rate</div><div className="text-lg font-semibold">{result.rate}%</div></div>
              <div><div className="text-xs text-muted-foreground">TCS Amount</div><div className="text-lg font-semibold text-amber-700">{fmtINR(result.tcs_amount)}</div></div>
              <div><div className="text-xs text-muted-foreground">Invoice Total (incl. TCS)</div><div className="text-lg font-semibold text-emerald-700">{fmtINR(result.invoice_total)}</div></div>
              <div><div className="text-xs text-muted-foreground">Threshold</div><div className="text-lg font-semibold">{fmtINR(result.threshold)}</div></div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const TcsChallansTable: React.FC<{fy: string}> = ({fy}) => {
  const { user } = useUser();
  const userId = user?.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    challan_no: '', bsr_code: '', challan_date: new Date().toISOString().slice(0,10),
    challan_amount: 0, section: '206C(1H)', fiscal_year: fy, quarter: 'Q1',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['tcs-challans', userId, fy],
    queryFn: () => userId ? listTcsChallans(userId, fy) : Promise.resolve([]),
    enabled: !!userId,
  });

  const save = useMutation({
    mutationFn: async () => userId ? createTcsChallan(userId, form) : null,
    onSuccess: () => { qc.invalidateQueries({queryKey: ['tcs-challans']}); setOpen(false); toast({title: 'Saved'}); },
    onError: (e: any) => toast({title: 'Failed', description: e.message, variant: 'destructive'}),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <div>
            <CardTitle className="text-base">TCS Challans ({fy})</CardTitle>
            <CardDescription>Government TCS payment records.</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" className="gap-2"><Plus className="h-4 w-4"/>Record Challan</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record TCS Challan</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Challan No (CIN)</Label><Input value={form.challan_no} onChange={e => setForm({...form, challan_no: e.target.value})}/></div>
                <div><Label>BSR Code</Label><Input value={form.bsr_code} onChange={e => setForm({...form, bsr_code: e.target.value})}/></div>
                <div><Label>Date</Label><Input type="date" value={form.challan_date} onChange={e => setForm({...form, challan_date: e.target.value})}/></div>
                <div><Label>Amount</Label><Input type="number" value={form.challan_amount} onChange={e => setForm({...form, challan_amount: parseFloat(e.target.value)||0})}/></div>
                <div><Label>Section</Label>
                  <Select value={form.section} onValueChange={v => setForm({...form, section: v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{TCS_SECTIONS.map(s => <SelectItem key={s.code} value={s.code}>{s.code}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Quarter</Label>
                  <Select value={form.quarter} onValueChange={v => setForm({...form, quarter: v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Q1">Q1</SelectItem><SelectItem value="Q2">Q2</SelectItem>
                      <SelectItem value="Q3">Q3</SelectItem><SelectItem value="Q4">Q4</SelectItem>
                    </SelectContent></Select></div>
              </div>
              <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">{save.isPending ? 'Saving…' : 'Save'}</Button>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>CIN</TableHead><TableHead>BSR</TableHead>
              <TableHead>Section</TableHead><TableHead>Q</TableHead>
              <TableHead>Amount</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell>{c.challan_date}</TableCell>
                  <TableCell className="font-mono text-xs">{c.challan_no}</TableCell>
                  <TableCell className="font-mono text-xs">{c.bsr_code}</TableCell>
                  <TableCell>{c.section}</TableCell>
                  <TableCell>{c.quarter}</TableCell>
                  <TableCell>{fmtINR(c.challan_amount)}</TableCell>
                  <TableCell><Badge>{c.status}</Badge></TableCell>
                </TableRow>
              ))}
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No challans.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default TcsEnginePanel;
