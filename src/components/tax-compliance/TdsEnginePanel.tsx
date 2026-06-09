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
import {
  Building2, Users, Receipt, FileText, Award, GitMerge, Calculator,
  Plus, Save, Sparkles,
} from 'lucide-react';
import {
  fetchTdsCompanyConfig, upsertTdsCompanyConfig,
  fetchTdsVendorConfigs, upsertTdsVendorConfig,
  fetchTdsDashboard, fetchTdsReconciliation,
  listTdsChallans, createTdsChallan,
  listTdsReturns, listTdsCertificates,
  computeTdsForAmount,
  type TdsCompanyConfig, type TdsVendorConfig,
} from '@/services/taxComplianceService';
import { toast } from '@/hooks/use-toast';

const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const SECTIONS = [
  { code: '192',    label: '192 — Salary' },
  { code: '194A',   label: '194A — Interest (non-securities)' },
  { code: '194C',   label: '194C — Contractor (1%)' },
  { code: '194C-2', label: '194C — Contractor (2% non-individual)' },
  { code: '194H',   label: '194H — Commission/Brokerage' },
  { code: '194I-B', label: '194I — Rent (Building)' },
  { code: '194I-P', label: '194I — Rent (Plant/Machinery)' },
  { code: '194J',   label: '194J — Professional/Technical (10%)' },
  { code: '194J-T', label: '194J — Technical (2%)' },
  { code: '194Q',   label: '194Q — Purchase of Goods' },
  { code: '194O',   label: '194O — E-Commerce' },
  { code: '194R',   label: '194R — Benefit/Perquisite' },
  { code: '195',    label: '195 — Foreign Remittance' },
  { code: '194D',   label: '194D — Insurance Commission' },
  { code: '194LA',  label: '194LA — Land Compensation' },
  { code: '194N',   label: '194N — Cash Withdrawal' },
];

interface Props { fy: string; }

const TdsEnginePanel: React.FC<Props> = ({ fy }) => {
  const { user } = useUser();
  const userId = user?.id;
  const qc = useQueryClient();
  const [innerTab, setInnerTab] = useState('dashboard');

  const dashboard = useQuery({
    queryKey: ['tds-dashboard', userId, fy],
    queryFn: () => userId ? fetchTdsDashboard(userId, fy) : Promise.resolve(null),
    enabled: !!userId,
  });

  return (
    <div className="space-y-4">
      <Tabs value={innerTab} onValueChange={setInnerTab}>
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-7">
          <TabsTrigger value="dashboard" className="gap-1.5"><Receipt className="h-3.5 w-3.5" />Dashboard</TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5"><Building2 className="h-3.5 w-3.5" />Config</TabsTrigger>
          <TabsTrigger value="vendors" className="gap-1.5"><Users className="h-3.5 w-3.5" />Vendors</TabsTrigger>
          <TabsTrigger value="calculator" className="gap-1.5"><Calculator className="h-3.5 w-3.5" />Calc</TabsTrigger>
          <TabsTrigger value="challans" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Challans</TabsTrigger>
          <TabsTrigger value="returns" className="gap-1.5"><Award className="h-3.5 w-3.5" />Returns</TabsTrigger>
          <TabsTrigger value="recon" className="gap-1.5"><GitMerge className="h-3.5 w-3.5" />Recon</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          {dashboard.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardHeader className="pb-2"><CardDescription>Total Deducted</CardDescription></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{fmtINR(dashboard.data?.total_deducted)}</div></CardContent>
                </Card>
                <Card><CardHeader className="pb-2"><CardDescription>Total Paid (Challans)</CardDescription></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{fmtINR(dashboard.data?.total_paid)}</div></CardContent>
                </Card>
                <Card><CardHeader className="pb-2"><CardDescription>Payable</CardDescription></CardHeader>
                  <CardContent><div className="text-2xl font-bold text-amber-700">{fmtINR(dashboard.data?.payable)}</div></CardContent>
                </Card>
                <Card><CardHeader className="pb-2"><CardDescription>Challan Count</CardDescription></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{dashboard.data?.challan_count ?? 0}</div></CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Section-wise Deduction</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Section</TableHead><TableHead>Gross Paid</TableHead>
                      <TableHead>TDS Deducted</TableHead><TableHead>Transactions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {(dashboard.data?.section_breakup ?? []).map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{s.section}</TableCell>
                          <TableCell>{fmtINR(s.gross_amount)}</TableCell>
                          <TableCell className="font-semibold">{fmtINR(s.tds_amount)}</TableCell>
                          <TableCell>{s.count}</TableCell>
                        </TableRow>
                      ))}
                      {(dashboard.data?.section_breakup ?? []).length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                          No deductions in {fy} yet.
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Quarter-wise Summary</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(dashboard.data?.quarter_breakup ?? []).map((q) => (
                      <div key={q.quarter} className="rounded-md border p-3">
                        <div className="text-xs text-muted-foreground">{q.quarter}</div>
                        <div className="text-lg font-semibold mt-1">{fmtINR(q.tds_amount)}</div>
                        <div className="text-xs text-muted-foreground">Paid: {fmtINR(q.challan_amount)}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="config" className="mt-4"><TdsConfigForm /></TabsContent>
        <TabsContent value="vendors" className="mt-4"><TdsVendorTable /></TabsContent>
        <TabsContent value="calculator" className="mt-4"><TdsCalculator /></TabsContent>
        <TabsContent value="challans" className="mt-4"><TdsChallansTable fy={fy} /></TabsContent>
        <TabsContent value="returns" className="mt-4"><TdsReturnsTable fy={fy} /></TabsContent>
        <TabsContent value="recon" className="mt-4"><TdsReconciliationView fy={fy} /></TabsContent>
      </Tabs>
    </div>
  );
};

const TdsConfigForm: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['tds-company-config', userId],
    queryFn: () => userId ? fetchTdsCompanyConfig(userId) : Promise.resolve(null),
    enabled: !!userId,
  });
  const [form, setForm] = useState<Partial<TdsCompanyConfig>>({});
  React.useEffect(() => { if (data) setForm(data); }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => userId ? upsertTdsCompanyConfig(userId, form) : null,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tds-company-config'] });
      toast({ title: 'Saved', description: 'TDS company config updated.' });
    },
    onError: (e: any) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">TDS Deductor Configuration</CardTitle>
        <CardDescription>TAN, PAN, deductor type, responsible person — required before TDS filing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>TAN <span className="text-red-500">*</span></Label>
            <Input value={form.tan ?? ''} onChange={e => setForm({...form, tan: e.target.value})} placeholder="ABCD12345E" maxLength={10}/></div>
          <div className="space-y-1.5"><Label>PAN <span className="text-red-500">*</span></Label>
            <Input value={form.pan ?? ''} onChange={e => setForm({...form, pan: e.target.value})} placeholder="ABCDE1234F" maxLength={10}/></div>
          <div className="space-y-1.5"><Label>Deductor Type</Label>
            <Select value={form.deductor_type ?? ''} onValueChange={v => setForm({...form, deductor_type: v})}>
              <SelectTrigger><SelectValue placeholder="Choose"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="firm">Firm</SelectItem>
                <SelectItem value="llp">LLP</SelectItem>
                <SelectItem value="huf">HUF</SelectItem>
                <SelectItem value="aop">AOP</SelectItem>
                <SelectItem value="boi">BOI</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="government">Government</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Filing Frequency</Label>
            <Select value={form.filing_frequency ?? 'quarterly'} onValueChange={v => setForm({...form, filing_frequency: v as any})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
              </SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Responsible Person</Label>
            <Input value={form.responsible_person ?? ''} onChange={e => setForm({...form, responsible_person: e.target.value})}/></div>
          <div className="space-y-1.5"><Label>Responsible PAN</Label>
            <Input value={form.responsible_pan ?? ''} onChange={e => setForm({...form, responsible_pan: e.target.value})} maxLength={10}/></div>
          <div className="space-y-1.5"><Label>Responsible Email</Label>
            <Input value={form.responsible_email ?? ''} onChange={e => setForm({...form, responsible_email: e.target.value})} type="email"/></div>
          <div className="space-y-1.5"><Label>Responsible Mobile</Label>
            <Input value={form.responsible_mobile ?? ''} onChange={e => setForm({...form, responsible_mobile: e.target.value})}/></div>
        </div>
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-2">
          <Save className="h-4 w-4"/>{saveMut.isPending ? 'Saving…' : 'Save Config'}
        </Button>
      </CardContent>
    </Card>
  );
};

const TdsVendorTable: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const qc = useQueryClient();
  const [dlgOpen, setDlgOpen] = useState(false);
  const [edit, setEdit] = useState<Partial<TdsVendorConfig>>({
    pan: '', tds_applicable: true, default_section: '194J', exemption_status: 'none',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['tds-vendor-master', userId],
    queryFn: () => userId ? fetchTdsVendorConfigs(userId) : Promise.resolve([]),
    enabled: !!userId,
  });

  const save = useMutation({
    mutationFn: async () => userId ? upsertTdsVendorConfig(userId, edit) : null,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tds-vendor-master'] });
      setDlgOpen(false);
      toast({ title: 'Saved', description: 'Vendor TDS configuration updated.' });
    },
    onError: (e: any) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base">Vendor TDS Master</CardTitle>
            <CardDescription>Configure section, threshold, rate, LDC and exemption per vendor.</CardDescription>
          </div>
          <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2" onClick={() => setEdit({ pan: '', tds_applicable: true, default_section: '194J', exemption_status: 'none' })}>
                <Plus className="h-4 w-4"/>Add Vendor Config
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Vendor TDS Configuration</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Vendor ID (UUID)</Label>
                  <Input value={edit.vendor_id ?? ''} onChange={e => setEdit({...edit, vendor_id: e.target.value || null})} placeholder="vendor uuid"/></div>
                <div className="space-y-1.5"><Label>PAN</Label>
                  <Input value={edit.pan ?? ''} onChange={e => setEdit({...edit, pan: e.target.value})} maxLength={10}/></div>
                <div className="space-y-1.5"><Label>Default Section</Label>
                  <Select value={edit.default_section ?? ''} onValueChange={v => setEdit({...edit, default_section: v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{SECTIONS.map(s => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Default Rate (%)</Label>
                  <Input type="number" value={edit.default_rate ?? ''} onChange={e => setEdit({...edit, default_rate: parseFloat(e.target.value) || null})}/></div>
                <div className="space-y-1.5"><Label>Annual Threshold (₹)</Label>
                  <Input type="number" value={edit.threshold_amount ?? ''} onChange={e => setEdit({...edit, threshold_amount: parseFloat(e.target.value) || null})}/></div>
                <div className="space-y-1.5"><Label>Exemption</Label>
                  <Select value={edit.exemption_status ?? 'none'} onValueChange={v => setEdit({...edit, exemption_status: v as any})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="full_exempt">Full Exempt</SelectItem>
                      <SelectItem value="15g">15G</SelectItem>
                      <SelectItem value="15h">15H</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="nil_rate">Nil rate</SelectItem>
                    </SelectContent></Select></div>
                <div className="space-y-1.5 col-span-2"><Label>LDC Certificate No.</Label>
                  <Input value={edit.ldc_certificate_no ?? ''} onChange={e => setEdit({...edit, ldc_certificate_no: e.target.value})}/></div>
                <div className="space-y-1.5"><Label>LDC Rate (%)</Label>
                  <Input type="number" value={edit.ldc_rate ?? ''} onChange={e => setEdit({...edit, ldc_rate: parseFloat(e.target.value) || null})}/></div>
                <div className="space-y-1.5"><Label>LDC Valid From</Label>
                  <Input type="date" value={edit.ldc_valid_from ?? ''} onChange={e => setEdit({...edit, ldc_valid_from: e.target.value || null})}/></div>
                <div className="space-y-1.5"><Label>LDC Valid To</Label>
                  <Input type="date" value={edit.ldc_valid_to ?? ''} onChange={e => setEdit({...edit, ldc_valid_to: e.target.value || null})}/></div>
                <div className="space-y-1.5"><Label>Nature of Payment</Label>
                  <Input value={edit.nature_of_payment ?? ''} onChange={e => setEdit({...edit, nature_of_payment: e.target.value})}/></div>
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
              <TableHead>Vendor</TableHead><TableHead>PAN</TableHead>
              <TableHead>Section</TableHead><TableHead>Rate</TableHead>
              <TableHead>Threshold</TableHead><TableHead>LDC</TableHead>
              <TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).map(v => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">{v.vendor_id?.slice(0, 8) ?? '—'}</TableCell>
                  <TableCell>{v.pan ?? '—'}</TableCell>
                  <TableCell>{v.default_section ?? '—'}</TableCell>
                  <TableCell>{v.default_rate ?? '—'}%</TableCell>
                  <TableCell>{fmtINR(v.threshold_amount)}</TableCell>
                  <TableCell>{v.ldc_certificate_no ? <Badge variant="outline" className="bg-blue-50">LDC</Badge> : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={v.tds_applicable ? 'default' : 'secondary'}>
                      {v.exemption_status !== 'none' ? v.exemption_status : (v.tds_applicable ? 'Active' : 'Inactive')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No vendor TDS configs yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

const TdsCalculator: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const [amt, setAmt] = useState<number>(100000);
  const [section, setSection] = useState<string>('194J');
  const [vendor, setVendor] = useState<string>('');
  const [result, setResult] = useState<any>(null);

  const calc = useMutation({
    mutationFn: async () => userId ? computeTdsForAmount(userId, amt, section, vendor || null) : null,
    onSuccess: (r) => setResult(r),
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-600"/>TDS Auto-Detection Calculator</CardTitle>
        <CardDescription>Given amount + section + vendor, the engine resolves rate (LDC / override / no-PAN higher / standard) and computes TDS.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5"><Label>Gross Amount (₹)</Label>
            <Input type="number" value={amt} onChange={e => setAmt(parseFloat(e.target.value) || 0)}/></div>
          <div className="space-y-1.5"><Label>Section</Label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{SECTIONS.map(s => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Vendor ID (optional)</Label>
            <Input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="UUID"/></div>
        </div>
        <Button onClick={() => calc.mutate()} disabled={calc.isPending} className="gap-2">
          <Calculator className="h-4 w-4"/>{calc.isPending ? 'Computing…' : 'Compute TDS'}
        </Button>
        {result && (
          <div className="rounded-md border p-4 space-y-2 bg-slate-50">
            <div className="flex items-center gap-2">
              <Badge className={result.tds_applicable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-800'}>
                {result.tds_applicable ? 'TDS Applicable' : 'No TDS'}
              </Badge>
              <Badge variant="outline">Rate source: {result.rate_source}</Badge>
              {result.reason && <Badge variant="outline">{result.reason}</Badge>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <Kpi label="Rate" value={`${result.rate}%`}/>
              <Kpi label="TDS Amount" value={fmtINR(result.tds_amount)} tone="amber"/>
              <Kpi label="Net Payable" value={fmtINR(result.net_payable)} tone="emerald"/>
              <Kpi label="Threshold" value={fmtINR(result.threshold)}/>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Kpi: React.FC<{label: string; value: string; tone?: 'amber'|'emerald'}> = ({label, value, tone}) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`text-lg font-semibold ${tone === 'amber' ? 'text-amber-700' : tone === 'emerald' ? 'text-emerald-700' : ''}`}>{value}</div>
  </div>
);

const TdsChallansTable: React.FC<{fy: string}> = ({fy}) => {
  const { user } = useUser();
  const userId = user?.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    challan_no: '', bsr_code: '', challan_date: new Date().toISOString().slice(0,10),
    challan_amount: 0, section: '194J', fiscal_year: fy, quarter: 'Q1',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['tds-challans', userId, fy],
    queryFn: () => userId ? listTdsChallans(userId, fy) : Promise.resolve([]),
    enabled: !!userId,
  });

  const save = useMutation({
    mutationFn: async () => userId ? createTdsChallan(userId, form) : null,
    onSuccess: () => { qc.invalidateQueries({queryKey: ['tds-challans']}); setOpen(false); toast({title: 'Saved'}); },
    onError: (e: any) => toast({title: 'Failed', description: e.message, variant: 'destructive'}),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <div>
            <CardTitle className="text-base">TDS Challans</CardTitle>
            <CardDescription>Government TDS payment records (CIN, BSR, date).</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" className="gap-2"><Plus className="h-4 w-4"/>Record Challan</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record TDS Challan</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Challan No (CIN)</Label><Input value={form.challan_no} onChange={e => setForm({...form, challan_no: e.target.value})}/></div>
                <div><Label>BSR Code</Label><Input value={form.bsr_code} onChange={e => setForm({...form, bsr_code: e.target.value})}/></div>
                <div><Label>Date</Label><Input type="date" value={form.challan_date} onChange={e => setForm({...form, challan_date: e.target.value})}/></div>
                <div><Label>Amount</Label><Input type="number" value={form.challan_amount} onChange={e => setForm({...form, challan_amount: parseFloat(e.target.value)||0})}/></div>
                <div><Label>Section</Label>
                  <Select value={form.section} onValueChange={v => setForm({...form, section: v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{SECTIONS.map(s => <SelectItem key={s.code} value={s.code}>{s.code}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Quarter</Label>
                  <Select value={form.quarter} onValueChange={v => setForm({...form, quarter: v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Q1">Q1 (Apr–Jun)</SelectItem>
                      <SelectItem value="Q2">Q2 (Jul–Sep)</SelectItem>
                      <SelectItem value="Q3">Q3 (Oct–Dec)</SelectItem>
                      <SelectItem value="Q4">Q4 (Jan–Mar)</SelectItem>
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
              <TableHead>Section</TableHead><TableHead>Quarter</TableHead>
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
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No challans recorded.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

const TdsReturnsTable: React.FC<{fy: string}> = ({fy}) => {
  const { user } = useUser();
  const userId = user?.id;
  const { data, isLoading } = useQuery({
    queryKey: ['tds-returns', userId, fy],
    queryFn: () => userId ? listTdsReturns(userId, fy) : Promise.resolve([]),
    enabled: !!userId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">TDS Returns ({fy})</CardTitle>
        <CardDescription>26Q (non-salary) · 24Q (salary) · 27Q (non-residents) · 27EQ (TCS)</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Form</TableHead><TableHead>Quarter</TableHead><TableHead>Due Date</TableHead>
              <TableHead>Filed Date</TableHead><TableHead>Deductees</TableHead>
              <TableHead>TDS Amount</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{r.form_type}</TableCell>
                  <TableCell>{r.quarter}</TableCell>
                  <TableCell>{r.due_date ?? '—'}</TableCell>
                  <TableCell>{r.filed_date ?? '—'}</TableCell>
                  <TableCell>{r.total_deductees}</TableCell>
                  <TableCell>{fmtINR(r.total_tds_amount)}</TableCell>
                  <TableCell><Badge variant={r.status === 'filed' ? 'default' : 'secondary'}>{r.status}</Badge></TableCell>
                </TableRow>
              ))}
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No returns prepared for {fy} yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

const TdsReconciliationView: React.FC<{fy: string}> = ({fy}) => {
  const { user } = useUser();
  const userId = user?.id;
  const [q, setQ] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['tds-recon', userId, fy, q],
    queryFn: () => userId ? fetchTdsReconciliation(userId, fy, q || null) : Promise.resolve(null),
    enabled: !!userId,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><GitMerge className="h-4 w-4"/>Books vs Challans vs Returns vs 26AS</CardTitle>
            <CardDescription>End-to-end TDS reconciliation findings.</CardDescription>
          </div>
          <Select value={q || 'all'} onValueChange={v => setQ(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All quarters</SelectItem>
              <SelectItem value="Q1">Q1</SelectItem><SelectItem value="Q2">Q2</SelectItem>
              <SelectItem value="Q3">Q3</SelectItem><SelectItem value="Q4">Q4</SelectItem>
            </SelectContent></Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? <div className="text-sm text-muted-foreground">Loading…</div> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Books" value={fmtINR(data.books)}/>
              <Kpi label="Challans" value={fmtINR(data.challans)}/>
              <Kpi label="Returns" value={fmtINR(data.returns)}/>
              <Kpi label="Form 26AS" value={fmtINR(data.form_26as)}/>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge className={data.all_reconciled ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                  {data.all_reconciled ? 'Reconciled' : `${data.findings.length} finding${data.findings.length === 1 ? '' : 's'}`}
                </Badge>
              </div>
              {data.findings.map((f: any, i: number) => (
                <div key={i} className="rounded-md border p-3 mb-2">
                  <div className="font-medium">{f.finding}</div>
                  <div className="text-sm text-muted-foreground">{f.description}</div>
                  <div className="text-xs mt-1">Diff: <span className="font-semibold">{fmtINR(Math.abs(f.diff))}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TdsEnginePanel;
