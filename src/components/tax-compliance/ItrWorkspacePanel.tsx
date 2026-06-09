import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Sparkles, CheckCircle2, AlertTriangle, Calculator } from 'lucide-react';
import {
  autopopulateItr, validateItr, listItrWorkspaces, type ItrAutoPopulate,
} from '@/services/taxComplianceService';
import { toast } from '@/hooks/use-toast';

const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const ENTITY_TYPES = [
  { value: 'proprietorship',  label: 'Proprietorship',  itr: 'ITR-3' },
  { value: 'partnership',     label: 'Partnership Firm',itr: 'ITR-5' },
  { value: 'llp',             label: 'LLP',             itr: 'ITR-5' },
  { value: 'private_limited', label: 'Private Limited', itr: 'ITR-6' },
  { value: 'huf',             label: 'HUF',             itr: 'ITR-2' },
  { value: 'aop',             label: 'AOP / BOI',       itr: 'ITR-5' },
  { value: 'trust',           label: 'Trust',           itr: 'ITR-7' },
];

interface Props { fy: string; }

const ItrWorkspacePanel: React.FC<Props> = ({ fy }) => {
  const { user } = useUser();
  const userId = user?.id;
  const qc = useQueryClient();
  const [entityType, setEntityType] = useState<string>('private_limited');
  const [result, setResult] = useState<ItrAutoPopulate | null>(null);
  const [validation, setValidation] = useState<any>(null);

  const workspaces = useQuery({
    queryKey: ['itr-workspaces', userId],
    queryFn: () => userId ? listItrWorkspaces(userId) : Promise.resolve([]),
    enabled: !!userId,
  });

  const autopop = useMutation({
    mutationFn: async () => userId ? autopopulateItr(userId, fy, entityType) : null,
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['itr-workspaces'] });
      toast({ title: 'ITR auto-populated', description: 'Snapshot of P&L, BS, GST, TDS, FA pulled into the workspace.' });
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const validate = useMutation({
    mutationFn: async () => userId ? validateItr(userId, fy) : null,
    onSuccess: r => setValidation(r),
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const itrForm = ENTITY_TYPES.find(e => e.value === entityType)?.itr ?? 'ITR-6';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4"/>ITR Preparation Workspace
          </CardTitle>
          <CardDescription>
            Pulls every number from the journals, GST, TDS, fixed assets, depreciation, and liabilities — no manual re-entry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5"><Label>Fiscal Year</Label>
              <Badge variant="outline" className="text-sm font-mono">{fy}</Badge></div>
            <div className="space-y-1.5"><Label>Entity Type</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{ENTITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>ITR Form</Label>
              <Badge className="text-sm">{itrForm}</Badge></div>
            <div className="flex gap-2">
              <Button onClick={() => autopop.mutate()} disabled={autopop.isPending} className="gap-2">
                <Sparkles className="h-4 w-4"/>{autopop.isPending ? 'Pulling…' : 'Auto-Populate'}
              </Button>
              <Button variant="outline" onClick={() => validate.mutate()} disabled={validate.isPending} className="gap-2">
                <CheckCircle2 className="h-4 w-4"/>{validate.isPending ? 'Validating…' : 'Validate'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Tabs defaultValue="computation">
          <TabsList>
            <TabsTrigger value="computation" className="gap-1.5"><Calculator className="h-3.5 w-3.5"/>Tax Computation</TabsTrigger>
            <TabsTrigger value="pnl">P&L</TabsTrigger>
            <TabsTrigger value="tds">TDS Summary</TabsTrigger>
            <TabsTrigger value="gst">GST Summary</TabsTrigger>
            <TabsTrigger value="assets">Fixed Assets</TabsTrigger>
            <TabsTrigger value="liab">Liabilities</TabsTrigger>
          </TabsList>

          <TabsContent value="computation" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Tax Computation — {result.itr_form}</CardTitle>
                <CardDescription>AY {result.assessment_year} · {entityType.replace('_', ' ')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    <TaxRow label="Gross Revenue" value={result.tax_computation.gross_revenue}/>
                    <TaxRow label="Total Expenses" value={-result.tax_computation.total_expenses}/>
                    <TaxRow label="Net Profit" value={result.tax_computation.net_profit} bold/>
                    <TaxRow label={`Tax @ ${(result.tax_computation.tax_rate * 100).toFixed(0)}%`} value={result.tax_computation.tax_payable}/>
                    <TaxRow label="Less: TDS Credit" value={-result.tax_computation.tds_credit}/>
                    <TaxRow label="Net Tax Liability" value={result.tax_computation.net_tax_liability} bold tone="amber"/>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pnl" className="mt-4">
            <JsonSnapshot data={result.pnl}/>
          </TabsContent>
          <TabsContent value="tds" className="mt-4">
            <JsonSnapshot data={result.tds}/>
          </TabsContent>
          <TabsContent value="gst" className="mt-4">
            <JsonSnapshot data={result.gst}/>
          </TabsContent>
          <TabsContent value="assets" className="mt-4">
            <JsonSnapshot data={result.assets}/>
          </TabsContent>
          <TabsContent value="liab" className="mt-4">
            <JsonSnapshot data={result.liabilities}/>
          </TabsContent>
        </Tabs>
      )}

      {validation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {validation.all_passed
                ? <><CheckCircle2 className="h-4 w-4 text-emerald-600"/>All Checks Passed</>
                : <><AlertTriangle className="h-4 w-4 text-amber-600"/>Validation Findings</>}
            </CardTitle>
            <CardDescription>Pre-filing consistency layer.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(validation.findings ?? []).map((f: any, i: number) => (
                <div key={i} className="rounded-md border p-3 flex items-start gap-3">
                  {f.passed
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5"/>
                    : <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5"/>}
                  <div className="flex-1">
                    <div className="font-medium">{f.check}</div>
                    <div className="text-sm text-muted-foreground">{f.description}</div>
                  </div>
                  <Badge variant={f.passed ? 'default' : 'destructive'}>{f.passed ? 'PASS' : 'FAIL'}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Saved ITR Workspaces</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>FY</TableHead><TableHead>AY</TableHead><TableHead>Entity</TableHead>
              <TableHead>Form</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(workspaces.data ?? []).map((w: any) => (
                <TableRow key={w.id}>
                  <TableCell>{w.fiscal_year}</TableCell>
                  <TableCell>{w.assessment_year}</TableCell>
                  <TableCell>{w.entity_type}</TableCell>
                  <TableCell>{w.itr_form}</TableCell>
                  <TableCell><Badge>{w.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(w.updated_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {(workspaces.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                No workspaces yet. Click Auto-Populate to create one.
              </TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

const TaxRow: React.FC<{label: string; value: number; bold?: boolean; tone?: string}> = ({label, value, bold, tone}) => (
  <TableRow>
    <TableCell className={bold ? 'font-semibold' : ''}>{label}</TableCell>
    <TableCell className={`text-right font-mono ${bold ? 'font-semibold' : ''} ${tone === 'amber' ? 'text-amber-700' : ''}`}>{fmtINR(value)}</TableCell>
  </TableRow>
);

const JsonSnapshot: React.FC<{data: any}> = ({data}) => (
  <Card>
    <CardContent className="pt-4">
      <pre className="text-xs bg-slate-50 p-3 rounded-md overflow-auto max-h-96">
        {JSON.stringify(data, null, 2)}
      </pre>
    </CardContent>
  </Card>
);

export default ItrWorkspacePanel;
