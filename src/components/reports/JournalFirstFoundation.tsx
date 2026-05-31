import React, { useMemo, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Activity, BookOpen, ShieldCheck, Receipt, CheckCircle2, XCircle, Loader2,
  TrendingUp, ArrowDownRight, ArrowUpRight, AlertTriangle, MinusCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchGeneralLedger, fetchLiveJournalDashboard, fetchGstr2bReconciliation, validateBooks,
  GeneralLedger, LiveJournalDashboard, Gstr2bReconciliation, BooksValidation,
} from '@/services/financialStatementsService';
import { cn } from '@/lib/utils';

interface Props { financialYear: string }

const fmtINR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '₹0';
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return n < 0 ? `(₹${abs})` : `₹${abs}`;
};

const KPI: React.FC<{ label: string; value: string; tone?: string; icon?: React.ElementType }> = ({
  label, value, tone, icon: Icon,
}) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </div>
      <p className={cn('text-2xl font-bold', tone)}>{value}</p>
    </CardContent>
  </Card>
);

const JournalFirstFoundation: React.FC<Props> = ({ financialYear }) => {
  const { user } = useUser();
  const uid = user?.id ?? '';
  const [tab, setTab] = useState<'live' | 'ledger' | 'gstr2b' | 'validate'>('live');

  // ── Live dashboard ──────────────────────────────────────────────────
  const liveQ = useQuery({
    queryKey: ['live-journal-dashboard', uid, financialYear],
    queryFn: () => fetchLiveJournalDashboard(uid, financialYear),
    enabled: !!uid && !!financialYear,
  });

  // ── GL drilldown ────────────────────────────────────────────────────
  const accountsQ = useQuery({
    queryKey: ['accounts-list', uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, account_code, account_name, account_type')
        .eq('user_id', uid)
        .eq('is_active', true)
        .order('account_code');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!uid,
  });
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const fyStartYear = useMemo(() => parseInt(financialYear?.slice(0, 4) || '2025', 10), [financialYear]);
  const [fromDate, setFromDate] = useState<string>(`${fyStartYear}-04-01`);
  const [toDate, setToDate] = useState<string>(`${fyStartYear + 1}-03-31`);
  const glQ = useQuery({
    queryKey: ['general-ledger', uid, selectedAccount, fromDate, toDate],
    queryFn: () => fetchGeneralLedger(uid, selectedAccount, fromDate, toDate),
    enabled: !!uid && !!selectedAccount,
  });

  // ── GSTR-2B ─────────────────────────────────────────────────────────
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const [period, setPeriod] = useState<string>(currentPeriod);
  const gstrQ = useQuery({
    queryKey: ['gstr2b-recon', uid, period],
    queryFn: () => fetchGstr2bReconciliation(uid, period),
    enabled: !!uid,
  });

  // ── Validation ──────────────────────────────────────────────────────
  const valQ = useQuery({
    queryKey: ['validate-books', uid, financialYear],
    queryFn: () => validateBooks(uid, financialYear),
    enabled: !!uid && !!financialYear,
  });

  const live = liveQ.data as LiveJournalDashboard | null;
  const gl = glQ.data as GeneralLedger | null;
  const gstr = gstrQ.data as Gstr2bReconciliation | null;
  const val = valQ.data as BooksValidation | null;

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-gradient-to-br from-sky-50 via-violet-50 to-emerald-50 dark:from-sky-950/30 dark:via-violet-950/30 dark:to-emerald-950/30">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <CardTitle>Journal-First Foundation</CardTitle>
            <Badge variant="outline" className="text-xs">Phase 28</Badge>
          </div>
          <CardDescription>
            Every metric and statement derived directly from journals — true ledger-first SSOT. General Ledger drilldown, sub-ledger reconciliation, GSTR-2B, and continuous validation.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="live" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Live Dashboard</TabsTrigger>
          <TabsTrigger value="ledger" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" /> General Ledger</TabsTrigger>
          <TabsTrigger value="gstr2b" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /> GSTR-2B</TabsTrigger>
          <TabsTrigger value="validate" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Validation
            {val && !val.all_passed && (
              <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">!</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── LIVE DASHBOARD (journals only) ───────────────────────── */}
        <TabsContent value="live" className="space-y-4 mt-4">
          {liveQ.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !live ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No data yet.</CardContent></Card>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <KPI label="Revenue" value={fmtINR(live.revenue)} icon={TrendingUp} tone="text-emerald-700 dark:text-emerald-400" />
                <KPI label="Expenses" value={fmtINR(live.expenses)} icon={ArrowDownRight} tone="text-rose-700 dark:text-rose-400" />
                <KPI label="Net Profit" value={fmtINR(live.net_profit)} icon={ArrowUpRight}
                     tone={live.net_profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'} />
                <KPI label="Cash & Bank" value={fmtINR(live.cash_balance)} />
                <KPI label="Accounts Receivable" value={fmtINR(live.ar_balance)} />
                <KPI label="Accounts Payable" value={fmtINR(live.ap_balance)} />
                <KPI label="Inventory Value" value={fmtINR(live.inventory_value)} />
                <KPI label="Net GST Liability" value={fmtINR(live.net_gst_liability)}
                     tone={live.net_gst_liability >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'} />
              </div>

              <Card className="bg-muted/40">
                <CardContent className="py-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-muted-foreground">
                      Every number above is computed from <code className="text-foreground">journal_lines → accounts</code>. No independent calculations from invoices/expenses.
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">SSOT • {live.fiscal_year}</Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Output vs Input GST</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Output GST (sales)</p>
                    <p className="text-xl font-bold">{fmtINR(live.output_gst)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Input GST (purchases)</p>
                    <p className="text-xl font-bold">{fmtINR(live.input_gst)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Net Liability</p>
                    <p className={cn('text-xl font-bold',
                      live.net_gst_liability > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                      {fmtINR(live.net_gst_liability)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── GENERAL LEDGER ───────────────────────────────────────── */}
        <TabsContent value="ledger" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" /> General Ledger
              </CardTitle>
              <CardDescription>
                Pick any account — see opening balance, debits, credits, closing, every journal entry with drilldown to source document.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3 mb-4">
                <div>
                  <Label className="text-xs">Account</Label>
                  <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger><SelectValue placeholder="Choose ledger…" /></SelectTrigger>
                    <SelectContent>
                      {(accountsQ.data ?? []).map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.account_code} — {a.account_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
              </div>

              {!selectedAccount ? (
                <p className="text-sm text-muted-foreground text-center py-8">Pick an account to view its ledger.</p>
              ) : glQ.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !gl ? (
                <p className="text-sm text-muted-foreground text-center py-8">Account not found.</p>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-4 mb-4">
                    <KPI label="Opening" value={fmtINR(gl.opening_balance)} />
                    <KPI label="Period Debits" value={fmtINR(gl.period_debit)} tone="text-sky-600" />
                    <KPI label="Period Credits" value={fmtINR(gl.period_credit)} tone="text-violet-600" />
                    <KPI label="Closing" value={fmtINR(gl.closing_balance)}
                         tone={gl.account_type === 'Asset' || gl.account_type === 'Expense'
                               ? 'text-emerald-700' : 'text-emerald-700'} />
                  </div>

                  {gl.lines.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No journal lines in this period.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Date</TableHead>
                          <TableHead className="w-[120px]">Journal #</TableHead>
                          <TableHead>Narration</TableHead>
                          <TableHead className="w-[120px]">Source</TableHead>
                          <TableHead className="text-right w-[110px]">Debit</TableHead>
                          <TableHead className="text-right w-[110px]">Credit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gl.lines.map((ln, i) => (
                          <TableRow key={`${ln.journal_id}-${i}`}>
                            <TableCell className="text-xs">{ln.journal_date}</TableCell>
                            <TableCell className="text-xs font-mono">{ln.journal_number}</TableCell>
                            <TableCell className="text-xs">{ln.narration}</TableCell>
                            <TableCell className="text-xs">
                              {ln.source_type ? (
                                <Badge variant="outline" className="text-[10px]">{ln.source_type}</Badge>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono">
                              {ln.debit > 0 ? fmtINR(ln.debit) : ''}
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono">
                              {ln.credit > 0 ? fmtINR(ln.credit) : ''}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── GSTR-2B ──────────────────────────────────────────────── */}
        <TabsContent value="gstr2b" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="h-4 w-4" /> GSTR-2B Reconciliation
                  </CardTitle>
                  <CardDescription>
                    Supplier-wise books vs portal — ITC eligibility, mismatches, vendor filing risk.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Period</Label>
                  <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
                         className="w-[150px] h-8" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {gstrQ.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !gstr ? (
                <p className="text-sm text-muted-foreground text-center py-8">No data.</p>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-4 mb-4">
                    <KPI label="Books Total" value={fmtINR(gstr.books_total)} />
                    <KPI label="Portal Total (2B)" value={fmtINR(gstr.portal_total)} />
                    <KPI label="Variance" value={fmtINR(gstr.variance)}
                         tone={Math.abs(gstr.variance) > 1 ? 'text-rose-600' : 'text-emerald-600'} />
                    <KPI label="Match %"
                         value={gstr.match_pct !== null ? `${gstr.match_pct}%` : '—'}
                         tone={(gstr.match_pct ?? 0) >= 95 ? 'text-emerald-600' :
                               (gstr.match_pct ?? 0) >= 80 ? 'text-amber-600' : 'text-rose-600'} />
                  </div>

                  {gstr.suppliers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No supplier GST data for this period.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Supplier</TableHead>
                          <TableHead className="w-[120px]">GSTIN</TableHead>
                          <TableHead className="text-right">Invoices</TableHead>
                          <TableHead className="text-right">GST in Books</TableHead>
                          <TableHead className="text-right">ITC Eligible</TableHead>
                          <TableHead className="text-right">ITC Blocked</TableHead>
                          <TableHead className="text-right">ITC Claimed</TableHead>
                          <TableHead>Match</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gstr.suppliers.map((s, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-medium">{s.supplier}</TableCell>
                            <TableCell className="text-xs font-mono">{s.gstin || '—'}</TableCell>
                            <TableCell className="text-right text-xs">{s.invoice_count}</TableCell>
                            <TableCell className="text-right text-xs font-mono">{fmtINR(s.gst_books)}</TableCell>
                            <TableCell className="text-right text-xs font-mono text-emerald-700">{fmtINR(s.itc_eligible)}</TableCell>
                            <TableCell className="text-right text-xs font-mono text-rose-700">{fmtINR(s.itc_blocked)}</TableCell>
                            <TableCell className="text-right text-xs font-mono">{fmtINR(s.itc_claimed)}</TableCell>
                            <TableCell>
                              <Badge className={cn('text-[10px] uppercase',
                                s.match_status === 'matched'   ? 'bg-emerald-100 text-emerald-900' :
                                s.match_status === 'blocked'   ? 'bg-rose-100 text-rose-900' :
                                                                 'bg-amber-100 text-amber-900')}>
                                {s.match_status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── VALIDATION ───────────────────────────────────────────── */}
        <TabsContent value="validate" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Books Validation
                {val && (
                  val.all_passed
                    ? <Badge className="bg-emerald-100 text-emerald-900 text-[10px]">ALL PASS</Badge>
                    : <Badge variant="destructive" className="text-[10px]">ISSUES</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Five continuous checks: TB balance, journal balance, AR/AP sub-ledger ↔ control, inventory ↔ stock ledger.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {valQ.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !val ? (
                <p className="text-sm text-muted-foreground text-center py-8">No data.</p>
              ) : (
                <div className="space-y-2">
                  {val.checks.map((c, i) => (
                    <div key={i} className={cn('flex items-start gap-3 p-3 rounded-lg border',
                      c.passed === true  ? 'bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900' :
                      c.passed === false ? 'bg-rose-50/40    border-rose-200    dark:bg-rose-950/20    dark:border-rose-900' :
                                           'bg-muted/30')}>
                      {c.passed === true  ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" /> :
                       c.passed === false ? <XCircle      className="h-4 w-4 text-rose-600 mt-0.5" /> :
                                            <MinusCircle  className="h-4 w-4 text-muted-foreground mt-0.5" />}
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{c.label}</p>
                        <pre className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap font-mono">
                          {JSON.stringify(c.details, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default JournalFirstFoundation;
