import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle, CheckCircle2, ShieldCheck, Activity, RefreshCw,
  TrendingUp, Calculator, FileText, Receipt,
} from 'lucide-react';
import {
  fetchTaxComplianceCenterOverview, runTaxIntelligenceScan, updateTaxAlertStatus,
  currentFy,
} from '@/services/taxComplianceService';
import { toast } from '@/hooks/use-toast';

const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const SCORE_TONE = (score: number) =>
  score >= 80 ? 'text-emerald-600' :
  score >= 60 ? 'text-amber-600' :
  'text-red-600';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high:     'bg-orange-100 text-orange-800 border-orange-200',
  medium:   'bg-amber-100 text-amber-800 border-amber-200',
  low:      'bg-blue-100 text-blue-800 border-blue-200',
  info:     'bg-slate-100 text-slate-800 border-slate-200',
};

interface Props { fy: string; onNavigate?: (tab: string) => void; }

const TaxComplianceOverview: React.FC<Props> = ({ fy, onNavigate }) => {
  const { user } = useUser();
  const userId = user?.id;
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tax-compliance-overview', userId, fy],
    queryFn: () => userId ? fetchTaxComplianceCenterOverview(userId, fy) : Promise.resolve(null),
    enabled: !!userId,
  });

  const scan = useMutation({
    mutationFn: async () => userId ? runTaxIntelligenceScan(userId, fy) : null,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-compliance-overview'] });
      toast({ title: 'Intelligence scan complete', description: 'Fresh alerts surfaced.' });
    },
    onError: (e: any) => toast({ title: 'Scan failed', description: e.message, variant: 'destructive' }),
  });

  const resolveAlert = useMutation({
    mutationFn: async (id: string) => updateTaxAlertStatus(id, 'resolved'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tax-compliance-overview'] }),
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading compliance dashboard…</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">No data yet. Run an intelligence scan to populate.</div>;

  const score = data.score?.overall_score ?? 0;
  const grade = data.score?.grade ?? '—';

  return (
    <div className="space-y-6">
      {/* Score Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Tax Compliance Score — FY {fy}
              </CardTitle>
              <CardDescription>
                Real-time signal across TDS, ITC, GST, ITR, and compliance calendar.
              </CardDescription>
            </div>
            <Button onClick={() => scan.mutate()} disabled={scan.isPending} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${scan.isPending ? 'animate-spin' : ''}`} />
              Run Intelligence Scan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
            <div className="col-span-2">
              <div className={`text-5xl font-bold ${SCORE_TONE(score)}`}>{score}<span className="text-xl text-muted-foreground">/100</span></div>
              <div className="text-sm text-muted-foreground">Grade <span className="font-semibold">{grade}</span></div>
              <Progress value={score} className="mt-2 h-2" />
            </div>
            {[
              { key: 'tds_score', label: 'TDS', icon: Receipt },
              { key: 'itc_score', label: 'ITC', icon: Calculator },
              { key: 'gst_score', label: 'GST', icon: FileText },
              { key: 'itr_score', label: 'ITR', icon: TrendingUp },
              { key: 'calendar_score', label: 'Calendar', icon: Activity },
            ].map(({ key, label, icon: Icon }) => {
              const sub = (data.score?.breakdown as any)?.[key] ?? 0;
              return (
                <div key={key} className="rounded-md border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </div>
                  <div className={`text-2xl font-semibold ${SCORE_TONE(sub)}`}>{sub}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow transition" onClick={() => onNavigate?.('tds')}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5" /> TDS Payable</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtINR(data.tds?.payable)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Deducted: {fmtINR(data.tds?.total_deducted)} · Paid: {fmtINR(data.tds?.total_paid)}
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow transition" onClick={() => onNavigate?.('itc')}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Calculator className="h-3.5 w-3.5" /> Eligible ITC</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtINR(data.itc?.eligible_itc)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Pending: {fmtINR(data.itc?.pending_itc)} · Lost: {fmtINR(data.itc?.lost_itc)}
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow transition" onClick={() => onNavigate?.('itc')}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Vendor Risk</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.itc?.vendor_risk_count ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Vendors missing PAN/GSTIN</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow transition" onClick={() => onNavigate?.('calendar')}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Open Alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.alerts?.length ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Critical/High items to action</div>
          </CardContent>
        </Card>
      </div>

      {/* Filing Readiness */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filing Readiness</CardTitle>
          <CardDescription>Per-filing readiness across TDS quarters and ITR.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(data.readiness?.filings ?? []).map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-44 text-sm font-medium">{f.filing}</div>
                <Progress value={f.readiness_pct} className="flex-1 h-2" />
                <Badge variant="outline" className={
                  f.status === 'ready' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' :
                  'border-amber-200 text-amber-700 bg-amber-50'
                }>
                  {f.readiness_pct}% · {f.status}
                </Badge>
              </div>
            ))}
            {(data.readiness?.filings ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground">No filings tracked yet.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Smart Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Smart Tax Intelligence
          </CardTitle>
          <CardDescription>Active alerts requiring your attention.</CardDescription>
        </CardHeader>
        <CardContent>
          {(data.alerts ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> No open alerts — you're compliant.
            </div>
          ) : (
            <div className="space-y-3">
              {data.alerts.map((a) => (
                <div key={a.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={SEVERITY_BADGE[a.severity] ?? SEVERITY_BADGE.info}>{a.severity}</Badge>
                      <span className="font-medium">{a.title}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">{a.description}</div>
                    {a.recommended_action && (
                      <div className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">Action: </span>{a.recommended_action}
                      </div>
                    )}
                    {a.monetary_impact != null && a.monetary_impact > 0 && (
                      <div className="text-xs mt-1">Impact: <span className="font-semibold">{fmtINR(a.monetary_impact)}</span></div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => resolveAlert.mutate(a.id)}>
                    Resolve
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TaxComplianceOverview;
