import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calculator, CheckCircle2, AlertTriangle, Lock, Building2, FileWarning, Sparkles } from 'lucide-react';
import {
  fetchItcIntelligenceSummary, classifyItcPurchase, listItcClassifications,
} from '@/services/taxComplianceService';
import { toast } from '@/hooks/use-toast';

const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const CLASSIFICATION_TONE: Record<string, string> = {
  eligible:       'bg-emerald-100 text-emerald-800 border-emerald-200',
  blocked:        'bg-red-100 text-red-800 border-red-200',
  capital_goods:  'bg-blue-100 text-blue-800 border-blue-200',
  input_services: 'bg-violet-100 text-violet-800 border-violet-200',
  rcm:            'bg-orange-100 text-orange-800 border-orange-200',
  ineligible:     'bg-slate-100 text-slate-800 border-slate-200',
};

interface Props { fy: string; }

const ItcCenterPanel: React.FC<Props> = ({ fy }) => {
  const { user } = useUser();
  const userId = user?.id;
  const [period, setPeriod] = useState<string>('');                              // YYYY-MM, empty = FY

  const summary = useQuery({
    queryKey: ['itc-summary', userId, period || 'fy'],
    queryFn: () => userId ? fetchItcIntelligenceSummary(userId, period || undefined) : Promise.resolve(null),
    enabled: !!userId,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Period (YYYY-MM, empty = full FY)</Label>
          <Input value={period} onChange={e => setPeriod(e.target.value)} placeholder="2025-04" className="w-40"/>
        </div>
      </div>

      {summary.isLoading || !summary.data ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <>
          {/* Top KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Kpi icon={CheckCircle2} tone="emerald" label="Eligible ITC" value={fmtINR(summary.data.eligible_itc)}/>
            <Kpi icon={Lock} tone="red" label="Blocked ITC" value={fmtINR(summary.data.blocked_itc)}/>
            <Kpi icon={Building2} tone="blue" label="Capital Goods" value={fmtINR(summary.data.capital_goods)}/>
            <Kpi icon={Sparkles} tone="violet" label="Input Services" value={fmtINR(summary.data.input_services)}/>
            <Kpi icon={AlertTriangle} tone="orange" label="RCM ITC" value={fmtINR(summary.data.rcm_itc)}/>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Claimed" value={fmtINR(summary.data.claimed_itc)}/>
            <Kpi label="Pending" value={fmtINR(summary.data.pending_itc)} tone="amber"/>
            <Kpi label="Reversed" value={fmtINR(summary.data.reversed_itc)}/>
            <Kpi label="Lost (Leakage)" value={fmtINR(summary.data.lost_itc)} tone="red"/>
          </div>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-600"/>ITC Intelligence Recommendations</CardTitle>
              <CardDescription>Auto-derived actions to maximise claim and prevent leakage.</CardDescription>
            </CardHeader>
            <CardContent>
              {(summary.data.recommendations ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600"/>No recommendations — ITC posture is healthy.
                </div>
              ) : (
                <div className="space-y-2">
                  {summary.data.recommendations.map((r, i) => (
                    <div key={i} className="rounded-md border p-3 flex items-start gap-3">
                      <Badge className={
                        r.severity === 'high' ? 'bg-red-100 text-red-800' :
                        r.severity === 'medium' ? 'bg-amber-100 text-amber-800' :
                        'bg-blue-100 text-blue-800'
                      }>{r.severity}</Badge>
                      <div className="flex-1">
                        <div className="font-medium">{r.type.replace(/_/g, ' ')}</div>
                        <div className="text-sm text-muted-foreground">{r.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="classifier">
            <TabsList>
              <TabsTrigger value="classifier" className="gap-1.5"><Calculator className="h-3.5 w-3.5"/>Classifier</TabsTrigger>
              <TabsTrigger value="ledger" className="gap-1.5"><FileWarning className="h-3.5 w-3.5"/>ITC Ledger</TabsTrigger>
            </TabsList>

            <TabsContent value="classifier" className="mt-4"><ItcClassifierWidget/></TabsContent>
            <TabsContent value="ledger" className="mt-4"><ItcLedgerTable period={period}/></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

const Kpi: React.FC<{label: string; value: string; tone?: string; icon?: any}> = ({label, value, tone, icon: Icon}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardDescription className="flex items-center gap-1.5">
        {Icon && <Icon className={`h-3.5 w-3.5 text-${tone ?? 'slate'}-600`}/>}
        {label}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className={`text-xl font-semibold ${
        tone === 'red' ? 'text-red-700' :
        tone === 'amber' ? 'text-amber-700' :
        tone === 'emerald' ? 'text-emerald-700' :
        tone === 'blue' ? 'text-blue-700' :
        tone === 'violet' ? 'text-violet-700' :
        tone === 'orange' ? 'text-orange-700' : ''
      }`}>{value}</div>
    </CardContent>
  </Card>
);

const ItcClassifierWidget: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const [form, setForm] = useState({ amount: 100000, hsn: '', vendorId: '', isCapital: false, isService: false });
  const [result, setResult] = useState<any>(null);

  const classify = useMutation({
    mutationFn: async () => userId ? classifyItcPurchase(userId, form.amount, {
      hsn: form.hsn || null, vendorId: form.vendorId || null,
      isCapital: form.isCapital, isService: form.isService,
    }) : null,
    onSuccess: r => setResult(r),
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ITC Eligibility Auto-Classifier</CardTitle>
        <CardDescription>
          Given a purchase, classifies as eligible / blocked (17(5)) / capital goods / input services / RCM.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5"><Label>Amount</Label>
            <Input type="number" value={form.amount} onChange={e => setForm({...form, amount: parseFloat(e.target.value) || 0})}/></div>
          <div className="space-y-1.5"><Label>HSN (optional)</Label>
            <Input value={form.hsn} onChange={e => setForm({...form, hsn: e.target.value})} placeholder="8703 / 2204 / 9961…"/></div>
          <div className="space-y-1.5"><Label>Vendor ID (optional)</Label>
            <Input value={form.vendorId} onChange={e => setForm({...form, vendorId: e.target.value})}/></div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isCapital} onChange={e => setForm({...form, isCapital: e.target.checked})}/>
            Capital goods
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isService} onChange={e => setForm({...form, isService: e.target.checked})}/>
            Input services
          </label>
        </div>
        <Button onClick={() => classify.mutate()} disabled={classify.isPending}>
          {classify.isPending ? 'Classifying…' : 'Classify'}
        </Button>
        {result && (
          <div className="rounded-md border p-4 bg-slate-50 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={CLASSIFICATION_TONE[result.classification] ?? CLASSIFICATION_TONE.eligible}>
                {result.classification}
              </Badge>
              {result.blocked && <Badge variant="outline" className="border-red-200 text-red-700">17(5): {result.block_reason}</Badge>}
              {result.rcm_applicable && <Badge variant="outline" className="border-orange-200 text-orange-700">RCM applies</Badge>}
              <Badge variant="outline">Reason: {result.reason_code}</Badge>
            </div>
            {result.vendor_gstin && <div className="text-xs text-muted-foreground">Vendor GSTIN: {result.vendor_gstin}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ItcLedgerTable: React.FC<{period: string}> = ({period}) => {
  const { user } = useUser();
  const userId = user?.id;
  const { data, isLoading } = useQuery({
    queryKey: ['itc-ledger', userId, period],
    queryFn: () => userId ? listItcClassifications(userId, period || undefined) : Promise.resolve([]),
    enabled: !!userId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ITC Ledger (recent 500)</CardTitle>
        <CardDescription>Per-purchase ITC classification + claim status.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Invoice Date</TableHead><TableHead>Invoice No</TableHead>
              <TableHead>GSTIN</TableHead><TableHead>HSN</TableHead>
              <TableHead>Taxable</TableHead><TableHead>Total Tax</TableHead>
              <TableHead>Classification</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.invoice_date ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{r.invoice_no ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{r.gstin ?? '—'}</TableCell>
                  <TableCell>{r.hsn ?? '—'}</TableCell>
                  <TableCell>{fmtINR(r.taxable_value)}</TableCell>
                  <TableCell>{fmtINR((r.cgst_amount ?? 0) + (r.sgst_amount ?? 0) + (r.igst_amount ?? 0) + (r.cess_amount ?? 0))}</TableCell>
                  <TableCell>
                    <Badge className={CLASSIFICATION_TONE[r.itc_eligibility] ?? CLASSIFICATION_TONE.eligible}>
                      {r.itc_eligibility}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.claim_status === 'claimed' ? 'default' : 'secondary'}>{r.claim_status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                No ITC classifications yet. Use the classifier above or import from purchase bills.
              </TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default ItcCenterPanel;
