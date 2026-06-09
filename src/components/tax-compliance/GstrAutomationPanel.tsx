import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Sparkles, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import {
  generateGstr1, generateGstr3b, validateGstr1,
} from '@/services/taxComplianceService';
import { toast } from '@/hooks/use-toast';

const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const currentPeriod = () => new Date().toISOString().slice(0, 7);

const GstrAutomationPanel: React.FC = () => {
  const [period, setPeriod] = useState(currentPeriod());

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4"/>GSTR Automation</CardTitle>
              <CardDescription>GSTR-1 + GSTR-3B auto-derived from your live accounting data — no manual entries.</CardDescription>
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1"><Label className="text-xs">Period</Label>
                <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="w-40"/></div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="gstr1">
        <TabsList>
          <TabsTrigger value="gstr1" className="gap-1.5"><FileText className="h-3.5 w-3.5"/>GSTR-1</TabsTrigger>
          <TabsTrigger value="gstr3b" className="gap-1.5"><FileText className="h-3.5 w-3.5"/>GSTR-3B</TabsTrigger>
          <TabsTrigger value="validate" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5"/>Validate</TabsTrigger>
        </TabsList>

        <TabsContent value="gstr1" className="mt-4"><Gstr1View period={period}/></TabsContent>
        <TabsContent value="gstr3b" className="mt-4"><Gstr3bView period={period}/></TabsContent>
        <TabsContent value="validate" className="mt-4"><Gstr1ValidationView period={period}/></TabsContent>
      </Tabs>
    </div>
  );
};

const Gstr1View: React.FC<{period: string}> = ({period}) => {
  const { user } = useUser();
  const userId = user?.id;
  const [data, setData] = useState<any>(null);

  const gen = useMutation({
    mutationFn: async () => userId ? generateGstr1(userId, period) : null,
    onSuccess: r => setData(r),
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  React.useEffect(() => { setData(null); }, [period]);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <div>
            <CardTitle className="text-base">GSTR-1 Auto-Generation</CardTitle>
            <CardDescription>B2B · B2C-Large · B2C-Small · Exports · Credit/Debit Notes · HSN Summary</CardDescription>
          </div>
          <Button onClick={() => gen.mutate()} disabled={gen.isPending} className="gap-2">
            <Sparkles className="h-4 w-4"/>{gen.isPending ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!data ? <div className="text-sm text-muted-foreground">Click Generate to derive GSTR-1 from invoices for {period}.</div> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryStat label="Total Invoices" value={data.summary?.total_invoices ?? 0}/>
              <SummaryStat label="Total Value" value={fmtINR(data.summary?.total_value)}/>
              <SummaryStat label="Total Tax" value={fmtINR(data.summary?.total_tax)}/>
              <SummaryStat label="B2B / B2C-L / B2C-S" value={`${data.summary?.b2b_count ?? 0} / ${data.summary?.b2c_large_count ?? 0} / ${data.summary?.b2c_small_count ?? 0}`}/>
            </div>

            <Tabs defaultValue="b2b">
              <TabsList>
                <TabsTrigger value="b2b">B2B</TabsTrigger>
                <TabsTrigger value="b2c_large">B2C-Large</TabsTrigger>
                <TabsTrigger value="b2c_small">B2C-Small</TabsTrigger>
              </TabsList>
              <TabsContent value="b2b" className="mt-4"><GstrInvoiceTable rows={data.b2b}/></TabsContent>
              <TabsContent value="b2c_large" className="mt-4"><GstrInvoiceTable rows={data.b2c_large}/></TabsContent>
              <TabsContent value="b2c_small" className="mt-4"><GstrInvoiceTable rows={data.b2c_small}/></TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const GstrInvoiceTable: React.FC<{rows: any[]}> = ({rows}) => {
  if (!rows || rows.length === 0) return <div className="text-sm text-muted-foreground py-4">No invoices in this section.</div>;
  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>Invoice No</TableHead><TableHead>Date</TableHead>
        <TableHead>Customer</TableHead><TableHead>GSTIN</TableHead>
        <TableHead className="text-right">Value</TableHead><TableHead className="text-right">Tax</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-xs">{r.invoice_no}</TableCell>
            <TableCell>{r.invoice_date}</TableCell>
            <TableCell>{r.customer_name ?? '—'}</TableCell>
            <TableCell className="font-mono text-xs">{r.gstin ?? '—'}</TableCell>
            <TableCell className="text-right">{fmtINR(r.value)}</TableCell>
            <TableCell className="text-right">{fmtINR(r.tax)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

const Gstr3bView: React.FC<{period: string}> = ({period}) => {
  const { user } = useUser();
  const userId = user?.id;
  const [data, setData] = useState<any>(null);

  const gen = useMutation({
    mutationFn: async () => userId ? generateGstr3b(userId, period) : null,
    onSuccess: r => setData(r),
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  React.useEffect(() => { setData(null); }, [period]);

  const downloadJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gstr3b-${period}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <div>
            <CardTitle className="text-base">GSTR-3B Auto-Generation</CardTitle>
            <CardDescription>Derived from journal_lines.tax_type for {period}.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => gen.mutate()} disabled={gen.isPending} className="gap-2">
              <Sparkles className="h-4 w-4"/>{gen.isPending ? 'Generating…' : 'Generate'}
            </Button>
            {data && <Button variant="outline" onClick={downloadJson} className="gap-2"><Download className="h-4 w-4"/>Export</Button>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!data ? <div className="text-sm text-muted-foreground">Click Generate to derive GSTR-3B.</div> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <SummaryStat label="Tax Liability" value={fmtINR(data.tax_liability)} tone="amber"/>
              <SummaryStat label="Eligible ITC" value={fmtINR(data.eligible_itc)} tone="emerald"/>
              <SummaryStat label="Net Payable" value={fmtINR(data.net_payable)} tone="red"/>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Table 3.1 — Outward Supplies (Output GST)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Component</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    <TableRow><TableCell>CGST</TableCell><TableCell className="text-right">{fmtINR(data.table_3_1?.outward_taxable_supplies?.cgst)}</TableCell></TableRow>
                    <TableRow><TableCell>SGST</TableCell><TableCell className="text-right">{fmtINR(data.table_3_1?.outward_taxable_supplies?.sgst)}</TableCell></TableRow>
                    <TableRow><TableCell>IGST</TableCell><TableCell className="text-right">{fmtINR(data.table_3_1?.outward_taxable_supplies?.igst)}</TableCell></TableRow>
                    <TableRow><TableCell>Cess</TableCell><TableCell className="text-right">{fmtINR(data.table_3_1?.outward_taxable_supplies?.cess)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Table 4 — ITC Available</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Component</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    <TableRow><TableCell>CGST</TableCell><TableCell className="text-right">{fmtINR(data.table_4?.itc_available?.cgst)}</TableCell></TableRow>
                    <TableRow><TableCell>SGST</TableCell><TableCell className="text-right">{fmtINR(data.table_4?.itc_available?.sgst)}</TableCell></TableRow>
                    <TableRow><TableCell>IGST</TableCell><TableCell className="text-right">{fmtINR(data.table_4?.itc_available?.igst)}</TableCell></TableRow>
                    <TableRow><TableCell>Cess</TableCell><TableCell className="text-right">{fmtINR(data.table_4?.itc_available?.cess)}</TableCell></TableRow>
                    <TableRow><TableCell className="font-semibold">Total ITC</TableCell><TableCell className="text-right font-semibold">{fmtINR(data.table_4?.itc_available?.total)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {(data.rcm_input || data.rcm_output) && (
              <Card>
                <CardHeader><CardTitle className="text-base">RCM</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <SummaryStat label="RCM Input" value={fmtINR(data.rcm_input)}/>
                    <SummaryStat label="RCM Output" value={fmtINR(data.rcm_output)}/>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Gstr1ValidationView: React.FC<{period: string}> = ({period}) => {
  const { user } = useUser();
  const userId = user?.id;
  const [data, setData] = useState<any>(null);

  const validate = useMutation({
    mutationFn: async () => userId ? validateGstr1(userId, period) : null,
    onSuccess: r => setData(r),
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  React.useEffect(() => { setData(null); }, [period]);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <div>
            <CardTitle className="text-base">Pre-Filing Validation</CardTitle>
            <CardDescription>Detects missing GSTIN, duplicate invoice numbers, invalid POS, missing tax, negative values.</CardDescription>
          </div>
          <Button onClick={() => validate.mutate()} disabled={validate.isPending} className="gap-2">
            <CheckCircle2 className="h-4 w-4"/>{validate.isPending ? 'Validating…' : 'Validate'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!data ? <div className="text-sm text-muted-foreground">Click Validate to run pre-filing checks.</div> : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge className={data.is_valid ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                {data.is_valid ? 'Ready to file' : `${(data.findings ?? []).length} issue${data.findings.length === 1 ? '' : 's'}`}
              </Badge>
              <Badge variant="outline">{data.total_invoices} invoices · {fmtINR(data.total_value)} value · {fmtINR(data.total_tax)} tax</Badge>
            </div>
            {(data.findings ?? []).map((f: any, i: number) => (
              <div key={i} className="rounded-md border p-3 flex items-start gap-3">
                <AlertTriangle className={`h-4 w-4 mt-0.5 ${f.severity === 'high' ? 'text-red-600' : 'text-amber-600'}`}/>
                <div className="flex-1">
                  <div className="font-medium">{f.finding}</div>
                  <div className="text-sm text-muted-foreground">{f.description}</div>
                </div>
                <Badge variant={f.severity === 'high' ? 'destructive' : 'secondary'}>{f.severity}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const SummaryStat: React.FC<{label: string; value: any; tone?: string}> = ({label, value, tone}) => (
  <Card>
    <CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader>
    <CardContent>
      <div className={`text-xl font-semibold ${
        tone === 'amber' ? 'text-amber-700' :
        tone === 'red' ? 'text-red-700' :
        tone === 'emerald' ? 'text-emerald-700' : ''
      }`}>{value}</div>
    </CardContent>
  </Card>
);

export default GstrAutomationPanel;
