import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  CalendarClock, CheckCircle2, AlertTriangle, Clock, Loader2, RefreshCw, ShieldCheck,
  PlusCircle, FileText, Trash2, TrendingUp, Activity, AlertCircle,
} from 'lucide-react';
import {
  fetchComplianceCalendar, fetchHealthScore, seedStatutoryCalendar, recordFiling, deleteFiling,
  ComplianceCalendar, FinancialHealthScore, StatutoryObligation,
} from '@/services/financialStatementsService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props { financialYear: string; }

const formatINR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '';
  if (n === 0) return '-';
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return n < 0 ? `(${abs})` : abs;
};

const TYPE_GROUP: Record<string, { label: string; tone: string }> = {
  gstr1:    { label: 'GST',         tone: 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100' },
  gstr3b:   { label: 'GST',         tone: 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100' },
  gstr9:    { label: 'GST',         tone: 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100' },
  gstr9c:   { label: 'GST',         tone: 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100' },
  tds_24q:  { label: 'TDS',         tone: 'bg-purple-100 text-purple-900 dark:bg-purple-950/40 dark:text-purple-100' },
  tds_26q:  { label: 'TDS',         tone: 'bg-purple-100 text-purple-900 dark:bg-purple-950/40 dark:text-purple-100' },
  tds_27q:  { label: 'TDS',         tone: 'bg-purple-100 text-purple-900 dark:bg-purple-950/40 dark:text-purple-100' },
  advance_tax: { label: 'Income Tax', tone: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100' },
  itr_6:    { label: 'Income Tax',  tone: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100' },
  tax_audit_report_3cd: { label: 'Income Tax', tone: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100' },
  pf:       { label: 'Labour',      tone: 'bg-teal-100 text-teal-900 dark:bg-teal-950/40 dark:text-teal-100' },
  esi:      { label: 'Labour',      tone: 'bg-teal-100 text-teal-900 dark:bg-teal-950/40 dark:text-teal-100' },
  aoc_4:    { label: 'MCA',         tone: 'bg-pink-100 text-pink-900 dark:bg-pink-950/40 dark:text-pink-100' },
  aoc_4_xbrl: { label: 'MCA',       tone: 'bg-pink-100 text-pink-900 dark:bg-pink-950/40 dark:text-pink-100' },
  mgt_7:    { label: 'MCA',         tone: 'bg-pink-100 text-pink-900 dark:bg-pink-950/40 dark:text-pink-100' },
  csr_2:    { label: 'MCA',         tone: 'bg-pink-100 text-pink-900 dark:bg-pink-950/40 dark:text-pink-100' },
  dpt_3:    { label: 'MCA',         tone: 'bg-pink-100 text-pink-900 dark:bg-pink-950/40 dark:text-pink-100' },
};

const GRADE_TONE: Record<FinancialHealthScore['grade'], string> = {
  'A+': 'text-emerald-600',
  A:    'text-emerald-600',
  B:    'text-sky-600',
  C:    'text-amber-600',
  D:    'text-orange-600',
  F:    'text-red-600',
};

const ScoreGauge: React.FC<{ score: number; grade: string; size?: number }> = ({ score, grade, size = 140 }) => {
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const offset = c - (c * score / 100);
  const stroke = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor"
                strokeWidth="10" fill="none" className="text-muted/30" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={stroke}
                strokeWidth="10" fill="none" strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={offset}
                style={{ transition: 'stroke-dashoffset 0.6s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-bold tabular-nums">{score}</div>
        <div className={cn('text-sm font-semibold', GRADE_TONE[grade as keyof typeof GRADE_TONE])}>{grade}</div>
      </div>
    </div>
  );
};

const ComponentScoreBar: React.FC<{ label: string; score: number; weight: number; Icon: React.ComponentType<{ className?: string }> }> = ({ label, score, weight, Icon }) => {
  const tone = score >= 70 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground">({weight}%)</span>
        </div>
        <span className="font-mono tabular-nums">{score}/100</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full transition-all', tone)} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
};

const StatutoryComplianceDashboard: React.FC<Props> = ({ financialYear }) => {
  const { user } = useUser();
  const [calendar, setCalendar] = useState<ComplianceCalendar | null>(null);
  const [health, setHealth] = useState<FinancialHealthScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Filing dialog
  const [openFilingDialog, setOpenFilingDialog] = useState(false);
  const [filingObligation, setFilingObligation] = useState<StatutoryObligation | null>(null);
  const [filedDate, setFiledDate] = useState(new Date().toISOString().slice(0, 10));
  const [ackNumber, setAckNumber] = useState('');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [lateFeePaid, setLateFeePaid] = useState<number>(0);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [cal, hs] = await Promise.all([
      fetchComplianceCalendar(user.id, financialYear),
      fetchHealthScore(user.id, financialYear),
    ]);
    setCalendar(cal); setHealth(hs);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, financialYear]);

  const handleSeed = async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const n = await seedStatutoryCalendar(user.id, financialYear);
      toast.success(`Seeded ${n} obligations for FY ${financialYear}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to seed');
    } finally { setBusy(false); }
  };

  const startFiling = (o: StatutoryObligation) => {
    setFilingObligation(o);
    setOpenFilingDialog(true);
    setFiledDate(new Date().toISOString().slice(0, 10));
    setAckNumber(''); setAmountPaid(0);
    setLateFeePaid(o.estimated_late_fee || 0);
  };

  const handleRecordFiling = async () => {
    if (!user?.id || !filingObligation) return;
    try {
      await recordFiling(user.id, filingObligation.id, filedDate,
        ackNumber.trim() || undefined,
        amountPaid > 0 ? amountPaid : undefined,
        lateFeePaid > 0 ? lateFeePaid : undefined);
      toast.success('Filing recorded');
      setOpenFilingDialog(false);
      setFilingObligation(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to record filing');
    }
  };

  const handleDeleteFiling = async (filingId: string) => {
    if (!confirm('Delete this filing record? Obligation will return to pending.')) return;
    try { await deleteFiling(filingId); toast.success('Filing deleted'); await load(); }
    catch { toast.error('Failed to delete'); }
  };

  if (loading && !calendar && !health) {
    return (
      <Card><CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading compliance dashboard…
      </CardContent></Card>
    );
  }

  const noObligations = !calendar || calendar.total_obligations === 0;

  return (
    <div className="space-y-4">
      {/* Header with seed button if empty */}
      {noObligations && (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <CalendarClock className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <div>
              <div className="font-semibold">No compliance calendar set up for FY {financialYear}</div>
              <p className="text-sm text-muted-foreground mt-1">
                Seed the default Indian statutory calendar (GSTR-1/3B/9, TDS 24Q/26Q/27Q,
                Advance Tax, ITR-6, AOC-4, MGT-7, CSR-2, PF, ESI, etc.) — ~70 obligations per FY.
              </p>
            </div>
            <Button onClick={handleSeed} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <PlusCircle className="h-4 w-4 mr-1.5" />}
              Seed default calendar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Health Score */}
      {health && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" /> Financial Health Score
            </CardTitle>
            <CardDescription>
              Aggregates ledger integrity + compliance + risk + reporting readiness · FY {financialYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <ScoreGauge score={health.score} grade={health.grade} />
              <div className="flex-1 w-full space-y-3">
                <ComponentScoreBar label="Ledger Integrity"  score={health.components.integrity.score}  weight={health.components.integrity.weight}  Icon={Activity} />
                <ComponentScoreBar label="Compliance"        score={health.components.compliance.score} weight={health.components.compliance.weight} Icon={CalendarClock} />
                <ComponentScoreBar label="Risk Signals"      score={health.components.risk.score}       weight={health.components.risk.weight}       Icon={AlertCircle} />
                <ComponentScoreBar label="Reporting Ready"   score={health.components.reporting.score}  weight={health.components.reporting.weight}  Icon={TrendingUp} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">TB Balanced</div>
                <div className="text-base font-semibold">
                  {health.components.integrity.trial_balance_balanced
                    ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Yes</span>
                    : <span className="text-red-600 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> No</span>}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Overdue Filings</div>
                <div className={cn('text-base font-semibold tabular-nums',
                  health.components.compliance.overdue_obligations > 0 ? 'text-red-600' : 'text-emerald-600')}>
                  {health.components.compliance.overdue_obligations}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Open AI Findings</div>
                <div className={cn('text-base font-semibold tabular-nums',
                  health.components.risk.critical_findings_open > 0 ? 'text-red-600' :
                  health.components.risk.high_findings_open > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                  {health.components.risk.critical_findings_open + health.components.risk.high_findings_open}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {health.components.risk.critical_findings_open} crit · {health.components.risk.high_findings_open} high
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">MSME Overdue (45d+)</div>
                <div className={cn('text-base font-semibold tabular-nums',
                  health.components.risk.msme_overdue_45_plus > 0 ? 'text-red-600' : 'text-emerald-600')}>
                  ₹ {formatINR(health.components.risk.msme_overdue_45_plus)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar */}
      {calendar && !noObligations && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4" /> Statutory Compliance Calendar
              </CardTitle>
              <CardDescription>
                {calendar.total_obligations} obligation(s) · {calendar.filed_count} filed ·
                {' '}{calendar.overdue_count} overdue · {calendar.upcoming_30d_count} due in next 30 days
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1.5 hidden sm:inline">Refresh</span>
            </Button>
          </CardHeader>
          <CardContent>
            {calendar.total_estimated_late_fee > 0 && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 mb-3 text-sm dark:bg-red-950/20 dark:border-red-800">
                <strong>Estimated late-fee exposure:</strong> ₹ {formatINR(calendar.total_estimated_late_fee)}
                {' '}across overdue obligations. File pending items ASAP.
              </div>
            )}

            <Tabs defaultValue="upcoming">
              <TabsList>
                <TabsTrigger value="upcoming">
                  <Clock className="h-3.5 w-3.5 mr-1.5" /> Upcoming (30d)
                </TabsTrigger>
                <TabsTrigger value="overdue">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Overdue ({calendar.overdue_count})
                </TabsTrigger>
                <TabsTrigger value="filed">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Filed ({calendar.filed_count})
                </TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>

              {(['upcoming','overdue','filed','all'] as const).map(tab => {
                const filtered = calendar.obligations.filter(o => {
                  if (tab === 'upcoming') return !o.is_filed && o.days_to_due >= 0 && o.days_to_due <= 30;
                  if (tab === 'overdue')  return o.is_overdue;
                  if (tab === 'filed')    return o.is_filed;
                  return true;
                });
                return (
                  <TabsContent key={tab} value={tab} className="pt-3">
                    {filtered.length === 0 ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        {tab === 'upcoming' && 'Nothing due in the next 30 days.'}
                        {tab === 'overdue'  && '🎉 No overdue obligations.'}
                        {tab === 'filed'    && 'Nothing filed yet.'}
                        {tab === 'all'      && 'No obligations.'}
                      </div>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Type</th>
                              <th className="px-3 py-2 text-left font-medium">Obligation</th>
                              <th className="px-3 py-2 text-left font-medium">Due Date</th>
                              <th className="px-3 py-2 text-center font-medium">Status</th>
                              <th className="px-3 py-2 text-right font-medium">Late Fee Est.</th>
                              <th className="px-3 py-2 text-right font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map(o => {
                              const group = TYPE_GROUP[o.obligation_type];
                              return (
                                <tr key={o.id} className={cn(
                                  'border-t',
                                  o.is_overdue && 'bg-red-50/30 dark:bg-red-950/10',
                                  o.is_filed && 'opacity-60',
                                )}>
                                  <td className="px-3 py-1.5">
                                    {group && <Badge className={cn('text-[10px]', group.tone)}>{group.label}</Badge>}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <div className="font-medium">{o.obligation_label}</div>
                                    <div className="text-[10px] font-mono text-muted-foreground">{o.obligation_type}</div>
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <div className="text-xs">{new Date(o.due_date).toLocaleDateString('en-IN')}</div>
                                    {!o.is_filed && (
                                      o.is_overdue
                                        ? <div className="text-[10px] text-red-600">{o.days_overdue} days overdue</div>
                                        : <div className="text-[10px] text-muted-foreground">
                                            {o.days_to_due === 0 ? 'today' : `in ${o.days_to_due} days`}
                                          </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-1.5 text-center">
                                    {o.is_filed
                                      ? <Badge variant="default" className="text-[10px]">
                                          <CheckCircle2 className="h-3 w-3 mr-1" />Filed
                                        </Badge>
                                      : o.is_overdue
                                        ? <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                                        : o.days_to_due <= 7
                                          ? <Badge variant="secondary" className="text-[10px]">Due Soon</Badge>
                                          : <Badge variant="outline" className="text-[10px]">Pending</Badge>}
                                  </td>
                                  <td className={cn('px-3 py-1.5 text-right tabular-nums text-xs',
                                    o.estimated_late_fee > 0 ? 'text-red-600' : '')}>
                                    {o.estimated_late_fee > 0 ? `₹ ${formatINR(o.estimated_late_fee)}` : '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-right">
                                    {o.is_filed ? (
                                      <div className="flex justify-end gap-1">
                                        {o.filings?.[0] && (
                                          <Button size="sm" variant="ghost"
                                                  onClick={() => o.filings && handleDeleteFiling(o.filings[0].id)}
                                                  title="Delete filing record">
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    ) : (
                                      <Button size="sm" variant="outline" className="h-7"
                                              onClick={() => startFiling(o)}>
                                        <FileText className="h-3.5 w-3.5 mr-1" />Mark Filed
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>

            <Dialog open={openFilingDialog} onOpenChange={setOpenFilingDialog}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Record filing</DialogTitle>
                  <DialogDescription>
                    {filingObligation?.obligation_label}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="f-date">Filed Date *</Label>
                    <Input id="f-date" type="date" value={filedDate}
                           onChange={(e) => setFiledDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="f-ack">Acknowledgement Number</Label>
                    <Input id="f-ack" placeholder="e.g. ARN/REF/Token" value={ackNumber}
                           onChange={(e) => setAckNumber(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="f-amt">Amount Paid (₹)</Label>
                      <Input id="f-amt" type="number" min={0} step="0.01" value={amountPaid}
                             onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="f-fee">Late Fee (₹)</Label>
                      <Input id="f-fee" type="number" min={0} step="0.01" value={lateFeePaid}
                             onChange={(e) => setLateFeePaid(parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenFilingDialog(false)}>Cancel</Button>
                  <Button onClick={handleRecordFiling} disabled={!filedDate}>Record</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StatutoryComplianceDashboard;
