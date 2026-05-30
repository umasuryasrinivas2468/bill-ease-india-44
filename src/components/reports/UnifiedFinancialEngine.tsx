import React, { useMemo, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Activity, AlertTriangle, ShieldCheck, RefreshCw, Loader2, Brain, TrendingUp, TrendingDown,
  Receipt, Wallet, Users, Building2, Boxes, IndianRupee, CheckCircle2, AlertCircle, Sparkles,
  ArrowRight, Lightbulb,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchUnifiedDashboard, fetchCfoInsights, fetchOpenIntegrityFindings, runIntegrityScan,
  fetchReconciliationStatus, acknowledgeIntegrityFinding,
  refreshReconciliationStatus, fetchItcDashboard,
  UnifiedDashboard, CfoInsights, IntegrityFinding, ReconciliationRow, ItcDashboard,
} from '@/services/financialStatementsService';
import { cn } from '@/lib/utils';

interface Props { financialYear: string }

const fmtINR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '₹0';
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return n < 0 ? `(₹${abs})` : `₹${abs}`;
};

const SEVERITY_TONE: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800',
  high:     'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800',
  medium:   'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  low:      'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800',
  info:     'bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700',
};

const HEALTH_TONE: Record<string, string> = {
  perfect:  'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  good:     'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
  warning:  'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  critical: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  no_data:  'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
};

const DOMAIN_LABEL: Record<string, string> = {
  gst_2b: 'GST (Books vs 2B)',
  ar: 'Accounts Receivable',
  ap: 'Accounts Payable',
  inventory: 'Inventory (Stock vs Ledger)',
  bank: 'Bank Reconciliation',
  tds_26as: 'TDS (Books vs 26AS)',
};

const FINDING_LABEL: Record<string, string> = {
  duplicate_invoice: 'Duplicate Invoice',
  duplicate_bill: 'Duplicate Bill',
  duplicate_payment: 'Duplicate Payment',
  negative_inventory: 'Negative Inventory',
  gst_mismatch: 'GST Mismatch',
  journal_imbalance: 'Journal Imbalance',
  unposted_bill: 'Unposted Bill',
  unposted_invoice: 'Unposted Invoice',
  itc_claim_error: 'Blocked ITC Claimed',
  bs_equation_failure: 'BS Equation Failure',
  trial_balance_imbalance: 'Trial Balance Imbalance',
  orphan_payment: 'Unallocated Payment',
  unallocated_advance: 'Unallocated Advance',
  missing_classification: 'Missing Sch III Classification',
};

const HealthPanel: React.FC<{
  title: string; icon: React.ElementType; color: string;
  primary: { label: string; value: string };
  secondary?: Array<{ label: string; value: string; tone?: string }>;
  footer?: string;
}> = ({ title, icon: Icon, color, primary, secondary, footer }) => (
  <Card className="overflow-hidden">
    <CardHeader className="pb-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', `bg-${color}-100 dark:bg-${color}-950/40`)}>
            <Icon className={cn('h-4 w-4', `text-${color}-600 dark:text-${color}-400`)} />
          </div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">{primary.label}</p>
        <p className="text-2xl font-bold">{primary.value}</p>
      </div>
      {secondary && secondary.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
          {secondary.map((s, i) => (
            <div key={i}>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn('text-sm font-semibold', s.tone)}>{s.value}</p>
            </div>
          ))}
        </div>
      )}
      {footer && <p className="text-xs text-muted-foreground italic">{footer}</p>}
    </CardContent>
  </Card>
);

const UnifiedFinancialEngine: React.FC<Props> = ({ financialYear }) => {
  const { user } = useUser();
  const uid = user?.id ?? '';
  const qc = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'itc' | 'integrity' | 'recon' | 'insights'>('overview');

  const dashboardQ = useQuery({
    queryKey: ['unified-dashboard', uid, financialYear],
    queryFn: () => fetchUnifiedDashboard(uid, financialYear),
    enabled: !!uid && !!financialYear,
  });
  const insightsQ = useQuery({
    queryKey: ['cfo-insights', uid, financialYear],
    queryFn: () => fetchCfoInsights(uid, financialYear),
    enabled: !!uid && !!financialYear,
  });
  const findingsQ = useQuery({
    queryKey: ['integrity-findings', uid, financialYear],
    queryFn: () => fetchOpenIntegrityFindings(uid, financialYear),
    enabled: !!uid && !!financialYear,
  });
  const reconQ = useQuery({
    queryKey: ['recon-status', uid],
    queryFn: () => fetchReconciliationStatus(uid),
    enabled: !!uid,
  });
  const itcQ = useQuery({
    queryKey: ['itc-dashboard', uid, financialYear],
    queryFn: () => fetchItcDashboard(uid, financialYear),
    enabled: !!uid && !!financialYear,
  });

  const reconRefreshMut = useMutation({
    mutationFn: () => refreshReconciliationStatus(uid),
    onSuccess: (res) => {
      toast.success(`Refreshed ${res?.domains_refreshed ?? 0} reconciliation domains`);
      qc.invalidateQueries({ queryKey: ['recon-status'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Reconciliation refresh failed'),
  });

  const scanMut = useMutation({
    mutationFn: () => runIntegrityScan(uid, financialYear),
    onSuccess: (res) => {
      toast.success(
        `Scan complete: ${res?.total ?? 0} findings (${res?.critical ?? 0} critical, ${res?.high ?? 0} high)`,
      );
      qc.invalidateQueries({ queryKey: ['integrity-findings'] });
      qc.invalidateQueries({ queryKey: ['unified-dashboard'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Integrity scan failed'),
  });

  const ackMut = useMutation({
    mutationFn: (args: { id: string; status: 'acknowledged' | 'resolved' | 'dismissed' }) =>
      acknowledgeIntegrityFinding(args.id, args.status),
    onSuccess: () => {
      toast.success('Finding updated');
      qc.invalidateQueries({ queryKey: ['integrity-findings'] });
      qc.invalidateQueries({ queryKey: ['unified-dashboard'] });
    },
  });

  const d = dashboardQ.data as UnifiedDashboard | null;
  const ins = insightsQ.data as CfoInsights | null;
  const findings = findingsQ.data as IntegrityFinding[] | undefined;
  const recon = reconQ.data as ReconciliationRow[] | undefined;
  const itc = itcQ.data as ItcDashboard | null;

  const healthScore = useMemo(() => {
    if (!d) return null;
    let score = 100;
    score -= Math.min(d.integrity.critical * 15, 45);
    score -= Math.min(Math.max(d.integrity.open_findings - d.integrity.critical, 0) * 3, 20);
    if (d.financial.revenue > 0 && d.financial.margin_pct < 0) score -= 15;
    if (d.gst.itc_leakage > 0 && d.gst.input_tax > 0) {
      score -= Math.min(Math.round((d.gst.itc_leakage / Math.max(d.gst.input_tax, 1)) * 20), 15);
    }
    if (d.ar.total > 0 && d.ar.collection_efficiency_pct < 70) score -= 10;
    return Math.max(0, Math.min(100, score));
  }, [d]);

  // ── Loading state ─────────────────────────────────────────────────
  if (dashboardQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">Loading unified engine…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <Card className="border-primary/30 bg-gradient-to-br from-violet-50 via-blue-50 to-emerald-50 dark:from-violet-950/30 dark:via-blue-950/30 dark:to-emerald-950/30">
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                <CardTitle>Unified Financial Engine</CardTitle>
                <Badge variant="outline" className="text-xs">Phase 26</Badge>
              </div>
              <CardDescription>
                One ecosystem — AP, AR, GST, ITC, Inventory, Fixed Assets, Liabilities, COA, Journals & Reports all derive from the same journal-first source of truth.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {healthScore !== null && (
                <div className="text-center">
                  <div className={cn(
                    'text-3xl font-bold',
                    healthScore >= 80 ? 'text-emerald-600' : healthScore >= 60 ? 'text-amber-600' : 'text-rose-600',
                  )}>{healthScore}</div>
                  <div className="text-xs text-muted-foreground">Engine Health</div>
                </div>
              )}
              <Button
                onClick={() => scanMut.mutate()}
                disabled={scanMut.isPending || !uid}
                size="sm"
              >
                {scanMut.isPending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Scanning…</>
                  : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Run Integrity Scan</>}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="overview" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="itc" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /> ITC</TabsTrigger>
          <TabsTrigger value="integrity" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Integrity
            {d && d.integrity.open_findings > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{d.integrity.open_findings}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="recon" className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Reconciliation</TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5"><Brain className="h-3.5 w-3.5" /> CFO Insights</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW: 6 health panels ─────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {!d ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No data yet.</CardContent></Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <HealthPanel
                  title="Financial Health" icon={IndianRupee} color="emerald"
                  primary={{ label: 'Net Profit', value: fmtINR(d.financial.profit) }}
                  secondary={[
                    { label: 'Revenue', value: fmtINR(d.financial.revenue) },
                    { label: 'Expenses', value: fmtINR(d.financial.expenses) },
                    { label: 'Cash & Bank', value: fmtINR(d.financial.cash) },
                    { label: 'Margin', value: `${d.financial.margin_pct}%`,
                      tone: d.financial.margin_pct >= 0 ? 'text-emerald-600' : 'text-rose-600' },
                  ]}
                />
                <HealthPanel
                  title="GST Health" icon={Receipt} color="blue"
                  primary={{ label: 'Net GST Liability', value: fmtINR(d.gst.net_liability) }}
                  secondary={[
                    { label: 'Output Tax', value: fmtINR(d.gst.output_tax) },
                    { label: 'Input Tax', value: fmtINR(d.gst.input_tax) },
                    { label: 'ITC Eligible', value: fmtINR(d.gst.itc_eligible), tone: 'text-emerald-600' },
                    { label: 'ITC Blocked', value: fmtINR(d.gst.itc_blocked), tone: 'text-rose-600' },
                  ]}
                  footer={d.gst.itc_leakage > 0
                    ? `⚠ ITC leakage: ${fmtINR(d.gst.itc_leakage)} unclaimed`
                    : 'No ITC leakage detected'}
                />
                <HealthPanel
                  title="AP Health" icon={Wallet} color="amber"
                  primary={{ label: 'Outstanding Payables', value: fmtINR(d.ap.total) }}
                  secondary={[
                    { label: 'Overdue', value: fmtINR(d.ap.overdue),
                      tone: d.ap.overdue > 0 ? 'text-rose-600' : 'text-emerald-600' },
                    { label: 'Current',  value: fmtINR(Math.max(d.ap.total - d.ap.overdue, 0)) },
                  ]}
                />
                <HealthPanel
                  title="AR Health" icon={Users} color="violet"
                  primary={{ label: 'Outstanding Receivables', value: fmtINR(d.ar.total) }}
                  secondary={[
                    { label: 'Overdue', value: fmtINR(d.ar.overdue),
                      tone: d.ar.overdue > 0 ? 'text-rose-600' : 'text-emerald-600' },
                    { label: 'Collection Eff.', value: `${d.ar.collection_efficiency_pct}%`,
                      tone: d.ar.collection_efficiency_pct >= 80 ? 'text-emerald-600' : 'text-amber-600' },
                  ]}
                />
                <HealthPanel
                  title="Asset Health" icon={Building2} color="sky"
                  primary={{ label: 'Net Block', value: fmtINR(d.assets.net_book_value) }}
                  secondary={[
                    { label: 'Gross Value', value: fmtINR(d.assets.value) },
                    { label: 'Accum. Dep.', value: fmtINR(d.assets.accumulated_depreciation) },
                  ]}
                />
                <HealthPanel
                  title="Liability Health" icon={Boxes} color="rose"
                  primary={{ label: 'Outstanding Loans', value: fmtINR(d.liabilities.outstanding) }}
                  secondary={[
                    { label: 'Next-month EMI', value: fmtINR(d.liabilities.next_month_emi) },
                  ]}
                />
              </div>

              {/* SSOT confirmation strip */}
              <Card className="bg-muted/40">
                <CardContent className="py-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-muted-foreground">
                      Every panel above is derived from <code className="text-foreground">journals → journal_lines → accounts</code>. Single source of truth — no independent calculations.
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">FY {d.fiscal_year}</Badge>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── ITC DASHBOARD ─────────────────────────────────────────── */}
        <TabsContent value="itc" className="space-y-4 mt-4">
          {!itc ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              {itcQ.isLoading ? 'Loading ITC dashboard…' : 'No ITC data yet — auto-classify your bills to populate.'}
            </CardContent></Card>
          ) : (
            <>
              {/* Top-line ITC KPIs */}
              <div className="grid gap-3 md:grid-cols-4">
                <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20">
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground">Total Available ITC</p>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{fmtINR(itc.total_available)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground">Claimed</p>
                    <p className="text-2xl font-bold">{fmtINR(itc.claimed)}</p>
                  </CardContent>
                </Card>
                <Card className={cn(itc.leakage > 0 && 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20')}>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground">Unclaimed / Leakage</p>
                    <p className={cn('text-2xl font-bold', itc.leakage > 0 ? 'text-amber-700 dark:text-amber-400' : '')}>
                      {fmtINR(itc.leakage)}
                    </p>
                  </CardContent>
                </Card>
                <Card className={cn(itc.blocked > 0 && 'border-rose-200 bg-rose-50/40 dark:bg-rose-950/20')}>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground">Blocked ITC (§17(5))</p>
                    <p className={cn('text-2xl font-bold', itc.blocked > 0 ? 'text-rose-700 dark:text-rose-400' : '')}>
                      {fmtINR(itc.blocked)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* By component */}
              {itc.by_component.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">ITC by GST Component</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Component</TableHead>
                          <TableHead className="text-right">Eligible</TableHead>
                          <TableHead className="text-right">Claimed</TableHead>
                          <TableHead className="text-right">Blocked</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itc.by_component.map((r) => (
                          <TableRow key={r.component}>
                            <TableCell className="text-xs font-medium uppercase">{r.component}</TableCell>
                            <TableCell className="text-right text-xs font-mono">{fmtINR(r.eligible)}</TableCell>
                            <TableCell className="text-right text-xs font-mono">{fmtINR(r.claimed)}</TableCell>
                            <TableCell className="text-right text-xs font-mono text-rose-600">{fmtINR(r.blocked)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Vendor filing risk */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" /> Vendor Filing Risk
                  </CardTitle>
                  <CardDescription>
                    Vendors with unclaimed ITC. Older the bill, higher the risk that GSTR-2A/2B won't match.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {itc.vendor_risk.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No vendor filing risk detected.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendor</TableHead>
                          <TableHead className="text-right">Bills</TableHead>
                          <TableHead className="text-right">Unclaimed ITC</TableHead>
                          <TableHead className="text-right">Oldest (days)</TableHead>
                          <TableHead>Risk</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itc.vendor_risk.map((v, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-medium">{v.vendor}</TableCell>
                            <TableCell className="text-right text-xs">{v.bill_count}</TableCell>
                            <TableCell className="text-right text-xs font-mono">{fmtINR(v.unclaimed_itc)}</TableCell>
                            <TableCell className="text-right text-xs">{v.oldest_days}</TableCell>
                            <TableCell>
                              <Badge className={cn('text-[10px] uppercase', SEVERITY_TONE[v.risk_level])}>
                                {v.risk_level}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── INTEGRITY ─────────────────────────────────────────────── */}
        <TabsContent value="integrity" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Financial Integrity Findings
              </CardTitle>
              <CardDescription>
                Automatic detection: duplicates, negative inventory, GST mismatches, journal/TB imbalance, unposted documents, blocked-ITC claims, missing Schedule III classification.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!findings || findings.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm font-semibold">No open findings for FY {financialYear}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scanMut.isPending ? 'Scanning…' : 'Click "Run Integrity Scan" above to refresh.'}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Severity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Detail</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[180px] text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {findings.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell>
                          <Badge className={cn('text-[10px] uppercase font-semibold', SEVERITY_TONE[f.severity])}>
                            {f.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{FINDING_LABEL[f.finding_type] ?? f.finding_type}</TableCell>
                        <TableCell className="text-xs">
                          <div>{f.message}</div>
                          {f.entity_ref && <div className="text-muted-foreground mt-0.5">Ref: {f.entity_ref}</div>}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">{fmtINR(Number(f.amount))}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-[10px]"
                              onClick={() => ackMut.mutate({ id: f.id, status: 'resolved' })}>
                              Resolve
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px]"
                              onClick={() => ackMut.mutate({ id: f.id, status: 'dismissed' })}>
                              Dismiss
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── RECONCILIATION ────────────────────────────────────────── */}
        <TabsContent value="recon" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> Reconciliation Engine
                  </CardTitle>
                  <CardDescription>
                    Continuous validation: Books vs GSTR-2B, AR Invoices vs Receipts, AP Bills vs Payments, Stock vs Inventory Ledger, Books vs Bank Statement, Books vs 26AS.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reconRefreshMut.mutate()}
                  disabled={reconRefreshMut.isPending || !uid}
                >
                  {reconRefreshMut.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Refreshing…</>
                    : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh all domains</>}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!recon || recon.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  No reconciliation runs yet. Click <strong>Refresh all domains</strong> above to populate
                  Books vs 2B / AR / AP / Inventory / Bank / 26AS in one shot.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Books</TableHead>
                      <TableHead className="text-right">External</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead className="text-right">Match %</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                      <TableHead>Health</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recon.map((r, i) => (
                      <TableRow key={`${r.domain}-${r.period}-${i}`}>
                        <TableCell className="text-xs font-medium">{DOMAIN_LABEL[r.domain] ?? r.domain}</TableCell>
                        <TableCell className="text-xs">{r.period}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{fmtINR(r.books_amount)}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{fmtINR(r.external_amount)}</TableCell>
                        <TableCell className={cn('text-right text-xs font-mono',
                          Math.abs(r.variance) > 1 ? 'text-rose-600 font-semibold' : 'text-emerald-600')}>
                          {fmtINR(r.variance)}
                        </TableCell>
                        <TableCell className="text-right text-xs">{r.match_pct !== null ? `${r.match_pct}%` : '—'}</TableCell>
                        <TableCell className="text-right text-xs">{r.open_items}</TableCell>
                        <TableCell>
                          <Badge className={cn('text-[10px] uppercase', HEALTH_TONE[r.health])}>{r.health}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CFO INSIGHTS ──────────────────────────────────────────── */}
        <TabsContent value="insights" className="space-y-4 mt-4">
          {!ins ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Generating insights…</CardContent></Card>
          ) : (
            <>
              {/* Recommendations */}
              {ins.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" /> Recommended Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {ins.recommendations.map((r, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                        <Badge variant={r.priority === 'high' || r.priority === 'critical' ? 'destructive' : 'secondary'}
                          className="text-[10px] uppercase mt-0.5">{r.priority}</Badge>
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{r.action}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{r.detail}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground mt-1" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Variance insights */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="h-4 w-4" /> Why These Numbers Changed
                  </CardTitle>
                  <CardDescription>Deterministic month-over-month explanations.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ins.insights.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">Not enough history yet for variance analysis.</p>
                  ) : ins.insights.map((it, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                      {it.direction === 'up' && <TrendingUp className="h-4 w-4 text-emerald-600 mt-0.5" />}
                      {it.direction === 'down' && <TrendingDown className="h-4 w-4 text-rose-600 mt-0.5" />}
                      {it.direction === 'opportunity' && <Sparkles className="h-4 w-4 text-violet-600 mt-0.5" />}
                      {it.direction === 'flat' && <AlertCircle className="h-4 w-4 text-slate-500 mt-0.5" />}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{it.metric}</span>
                          {it.change_pct !== undefined && (
                            <Badge variant="outline" className="text-[10px]">{it.change_pct >= 0 ? '+' : ''}{it.change_pct}%</Badge>
                          )}
                        </div>
                        <p className="text-sm mt-1">{it.message}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Risky vendors + slow customers */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" /> Risky Vendors
                    </CardTitle>
                    <CardDescription>Top vendors where ITC isn't claimed yet (filing risk).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {ins.risky_vendors.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">No vendor risk detected.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Vendor</TableHead>
                            <TableHead className="text-right">Bills</TableHead>
                            <TableHead className="text-right">GST at Risk</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ins.risky_vendors.map((v, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-medium">{v.vendor_name}</TableCell>
                              <TableCell className="text-right text-xs">{v.bill_count}</TableCell>
                              <TableCell className="text-right text-xs font-mono text-rose-600">{fmtINR(v.gst_at_risk)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-violet-600" /> Slow-Paying Customers
                    </CardTitle>
                    <CardDescription>Customers delaying payments — highest cash impact first.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {ins.slow_customers.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">All customers paying on time.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                            <TableHead className="text-right">Days Overdue</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ins.slow_customers.map((c, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-medium">{c.customer}</TableCell>
                              <TableCell className="text-right text-xs font-mono">{fmtINR(c.outstanding)}</TableCell>
                              <TableCell className="text-right text-xs">{c.avg_days_overdue}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UnifiedFinancialEngine;
