import React, { useMemo } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  IndianRupee, AlertTriangle, Clock, FileText, ShieldAlert, ListChecks, ArrowRight,
  CalendarClock, Wallet, Link2,
} from 'lucide-react';
import { useVendorLiabilitySummary } from '@/hooks/useVendorLiability';

/**
 * AP Dashboard — Brief items #10 (analytics) + #11 (aging + forecast).
 *
 * Sources every panel from journal-backed views laid down in migrations
 * 20260507000004 / _000005:
 *   v_ap_dashboard               — KPI strip (total / overdue / upcoming / advances / ITC)
 *   v_ap_aging                   — per-vendor aging buckets
 *   v_cash_outflow_forecast      — week-bucketed forecast for next 90 days
 *   v_open_fraud_alerts          — duplicate / RCM / split-payment flags
 *   v_pending_approvals          — bills awaiting approval
 *   v_vendor_concentration       — top 10 vendors by 12-month spend
 */

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'default'|'warn'|'ok'|'crit' }> = ({ icon, label, value, sub, tone = 'default' }) => {
  const toneClass = {
    default: 'text-muted-foreground',
    warn:    'text-amber-600',
    ok:      'text-emerald-600',
    crit:    'text-red-600',
  }[tone];
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
            <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
          </div>
          <div className={`rounded-md bg-muted p-2 ${toneClass}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
};

const APDashboard: React.FC = () => {
  const { user } = useUser();
  const enabled = !!user && isValidUserId(user?.id);
  const uid = user?.id ? normalizeUserId(user.id) : '';

  const { data: kpi } = useQuery({
    queryKey: ['ap-dashboard', uid],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from('v_ap_dashboard' as any).select('*').eq('user_id', uid).maybeSingle();
      return data as any;
    },
  });

  const { data: aging = [] } = useQuery({
    queryKey: ['ap-aging', uid],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from('v_ap_aging' as any).select('*').eq('user_id', uid).order('total_open', { ascending: false });
      return (data || []) as any[];
    },
  });

  const { data: forecast = [] } = useQuery({
    queryKey: ['ap-forecast', uid],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from('v_cash_outflow_forecast' as any).select('*').eq('user_id', uid).order('week_start');
      return (data || []) as any[];
    },
  });

  const { data: fraudAlerts = [] } = useQuery({
    queryKey: ['ap-fraud-open', uid],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from('v_open_fraud_alerts' as any).select('*').eq('user_id', uid).limit(20);
      return (data || []) as any[];
    },
  });

  const { data: pendingApprovals = [] } = useQuery({
    queryKey: ['ap-pending-approvals', uid],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from('v_pending_approvals' as any).select('*').eq('user_id', uid).limit(20);
      return (data || []) as any[];
    },
  });

  const { data: vendorConc = [] } = useQuery({
    queryKey: ['ap-vendor-concentration', uid],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from('v_vendor_concentration' as any).select('*').eq('user_id', uid).order('spend_12m', { ascending: false }).limit(10);
      return (data || []) as any[];
    },
  });

  const { data: vendorLiabilities = [] } = useVendorLiabilitySummary();

  const totals = useMemo(() => {
    const buckets = aging.reduce((acc: any, row: any) => ({
      not_yet_due:    acc.not_yet_due    + Number(row.not_yet_due    || 0),
      bucket_0_30:    acc.bucket_0_30    + Number(row.bucket_0_30    || 0),
      bucket_31_60:   acc.bucket_31_60   + Number(row.bucket_31_60   || 0),
      bucket_61_90:   acc.bucket_61_90   + Number(row.bucket_61_90   || 0),
      bucket_90_plus: acc.bucket_90_plus + Number(row.bucket_90_plus || 0),
      total_open:     acc.total_open     + Number(row.total_open     || 0),
    }), { not_yet_due: 0, bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0, total_open: 0 });
    return buckets;
  }, [aging]);

  const maxForecast = Math.max(1, ...forecast.map((f: any) => Number(f.forecast_amount || 0)));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Accounts Payable</h1>
          <p className="text-muted-foreground">Total exposure, aging, cash forecast, alerts &amp; approvals.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/payables">Bills view</Link></Button>
          <Button asChild variant="outline"><Link to="/vendors">Vendors</Link></Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <KpiCard
          icon={<IndianRupee className="h-5 w-5" />}
          label="Total Payable"
          value={inr(kpi?.total_payable)}
          sub={`${kpi?.open_bills || 0} open bills`}
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Overdue"
          value={inr(kpi?.overdue_amount)}
          tone="crit"
        />
        <KpiCard
          icon={<Clock className="h-5 w-5" />}
          label="Due in 30d"
          value={inr(kpi?.upcoming_30d)}
          tone="warn"
        />
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          label="Vendor Advances"
          value={inr(kpi?.unadjusted_advances)}
          sub="Unadjusted"
          tone="ok"
        />
        <KpiCard
          icon={<FileText className="h-5 w-5" />}
          label="ITC Pending"
          value={inr(kpi?.itc_pending_value)}
          sub="To claim in GSTR-3B"
        />
      </div>

      {/* Aging summary buckets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Aging Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Not yet due',  v: totals.not_yet_due,    tone: 'text-muted-foreground' },
              { label: '0–30 days',    v: totals.bucket_0_30,    tone: 'text-muted-foreground' },
              { label: '31–60 days',   v: totals.bucket_31_60,   tone: 'text-amber-600' },
              { label: '61–90 days',   v: totals.bucket_61_90,   tone: 'text-orange-600' },
              { label: '90+ days',     v: totals.bucket_90_plus, tone: 'text-red-600' },
            ].map(b => (
              <div key={b.label} className="rounded-md border p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground">{b.label}</div>
                <div className={`mt-1 text-lg font-semibold ${b.tone}`}>{inr(b.v)}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">0–30</TableHead>
                  <TableHead className="text-right">31–60</TableHead>
                  <TableHead className="text-right">61–90</TableHead>
                  <TableHead className="text-right">90+</TableHead>
                  <TableHead className="text-right">Oldest</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aging.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No open bills.</TableCell></TableRow>
                )}
                {aging.slice(0, 25).map((r: any) => (
                  <TableRow key={r.vendor_id || r.vendor_name}>
                    <TableCell className="font-medium">{r.vendor_name}</TableCell>
                    <TableCell className="text-right">{r.bill_count}</TableCell>
                    <TableCell className="text-right font-semibold">{inr(r.total_open)}</TableCell>
                    <TableCell className="text-right">{inr(r.bucket_0_30)}</TableCell>
                    <TableCell className="text-right text-amber-600">{inr(r.bucket_31_60)}</TableCell>
                    <TableCell className="text-right text-orange-600">{inr(r.bucket_61_90)}</TableCell>
                    <TableCell className="text-right text-red-600 font-semibold">{inr(r.bucket_90_plus)}</TableCell>
                    <TableCell className="text-right">{r.oldest_days != null ? `${r.oldest_days}d` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Vendor Liability Tracker — auto-tracked via PO ↔ invoice match */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Vendor Liability Tracker
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            PO commitments vs. invoiced vs. paid — updated live as invoices match POs and payments record.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Committed (PO open)</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Net Liability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendorLiabilities.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      No PO commitments or open invoices. Liabilities will appear here as invoices are matched.
                    </TableCell>
                  </TableRow>
                )}
                {vendorLiabilities.slice(0, 25).map((r) => (
                  <TableRow key={`${r.vendor_id || ''}-${r.vendor_name}`}>
                    <TableCell className="font-medium">{r.vendor_name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{inr(r.committed_open)}</TableCell>
                    <TableCell className="text-right">{inr(r.total_invoiced)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{inr(r.total_paid)}</TableCell>
                    <TableCell className="text-right font-semibold">{inr(r.total_outstanding)}</TableCell>
                    <TableCell className="text-right text-red-600">{inr(r.overdue_outstanding)}</TableCell>
                    <TableCell className="text-right font-bold">{inr(r.net_liability)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Cash forecast */}
      <Card>
        <CardHeader>
          <CardTitle>Cash Outflow Forecast (next 90 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {forecast.length === 0 ? (
            <p className="text-muted-foreground text-sm">No upcoming bills in the next 90 days.</p>
          ) : (
            <div className="space-y-2">
              {forecast.map((f: any) => {
                const pct = Math.round(Number(f.forecast_amount || 0) / maxForecast * 100);
                return (
                  <div key={f.week_start} className="flex items-center gap-3">
                    <div className="w-28 text-sm text-muted-foreground">
                      {new Date(f.week_start).toLocaleDateString('en-IN', { month: 'short', day: '2-digit' })}
                    </div>
                    <div className="flex-1 h-6 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-32 text-right text-sm font-medium">{inr(f.forecast_amount)}</div>
                    <div className="w-16 text-right text-xs text-muted-foreground">{f.bill_count} bills</div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fraud alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Open Fraud / Compliance Alerts
              <Badge variant="outline">{fraudAlerts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fraudAlerts.length === 0 ? (
              <p className="text-muted-foreground text-sm">No open alerts. ✓</p>
            ) : (
              <div className="space-y-2">
                {fraudAlerts.map((a: any) => (
                  <div key={a.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={a.severity === 'critical' || a.severity === 'high' ? 'destructive' : 'secondary'}>
                        {a.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="mt-2 text-sm font-medium">{a.alert_type.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.counterparty || '—'} · {a.reference || ''} · {inr(a.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending approvals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Pending Approvals
              <Badge variant="outline">{pendingApprovals.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingApprovals.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing waiting. ✓</p>
            ) : (
              <div className="space-y-2">
                {pendingApprovals.map((p: any) => (
                  <div key={p.request_id} className="rounded-md border p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{p.reference || '—'}</div>
                      <div className="text-xs text-muted-foreground">{p.vendor_name} · {inr(p.amount)}</div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline">L{p.current_level}/{p.required_levels}</Badge>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(p.requested_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vendor concentration */}
      <Card>
        <CardHeader>
          <CardTitle>Top Vendors (12-month spend)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Bills</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendorConc.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No vendor activity in the last 12 months.</TableCell></TableRow>
              )}
              {vendorConc.map((v: any) => (
                <TableRow key={v.vendor_id || v.vendor_name}>
                  <TableCell className="font-medium">{v.vendor_name}</TableCell>
                  <TableCell className="text-right">{v.bill_count}</TableCell>
                  <TableCell className="text-right font-semibold">{inr(v.spend_12m)}</TableCell>
                  <TableCell className="text-right">
                    {v.vendor_id && (
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/vendor-ledger?vendor=${v.vendor_id}`}>
                          Ledger <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default APDashboard;
