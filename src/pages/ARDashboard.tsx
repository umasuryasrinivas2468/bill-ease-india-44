import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  IndianRupee, AlertTriangle, Clock, ShieldAlert, ListChecks, ArrowRight,
  CalendarClock, Wallet, Users, TrendingUp, RefreshCw,
} from 'lucide-react';
import {
  useARDashboard, useCustomerConcentration, useOpenArFraudAlerts,
  usePendingArApprovals, useCustomerProfitability,
} from '@/hooks/useARDashboard';
import { useARAgingSummary, useCashInflowForecast } from '@/hooks/useARAging';
import { useGenerateRecurringInvoices } from '@/hooks/useRecurringInvoices';

/**
 * AR Dashboard — sell-side mirror of APDashboard.
 *
 * Sources every panel from journal-backed views laid down in
 * 20260509000002_ar_views.sql:
 *   v_ar_dashboard               — KPI strip
 *   v_ar_aging_summary           — per-customer aging buckets
 *   v_cash_inflow_forecast       — week-bucketed expected receipts
 *   v_open_ar_fraud_alerts       — duplicate-invoice / suspicious-discount / credit-breach
 *   v_pending_ar_approvals       — invoices/CNs awaiting approval
 *   v_customer_concentration     — top customers by outstanding
 *   v_customer_profitability     — revenue vs COGS vs returns
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

const ARDashboard: React.FC = () => {
  const { data: kpi } = useARDashboard();
  const { data: aging = [] } = useARAgingSummary();
  const { data: forecast = [] } = useCashInflowForecast();
  const { data: fraudAlerts = [] } = useOpenArFraudAlerts();
  const { data: pendingApprovals = [] } = usePendingArApprovals();
  const { data: customerConc = [] } = useCustomerConcentration();
  const { data: profitability = [] } = useCustomerProfitability();
  const generateRecurring = useGenerateRecurringInvoices();

  const totals = useMemo(() => aging.reduce(
    (acc: any, row: any) => ({
      not_due:          acc.not_due          + Number(row.not_due          || 0),
      overdue_0_30:     acc.overdue_0_30     + Number(row.overdue_0_30     || 0),
      overdue_31_60:    acc.overdue_31_60    + Number(row.overdue_31_60    || 0),
      overdue_61_90:    acc.overdue_61_90    + Number(row.overdue_61_90    || 0),
      overdue_90_plus:  acc.overdue_90_plus  + Number(row.overdue_90_plus  || 0),
      total_outstanding: acc.total_outstanding + Number(row.total_outstanding || 0),
    }),
    { not_due: 0, overdue_0_30: 0, overdue_31_60: 0, overdue_61_90: 0, overdue_90_plus: 0, total_outstanding: 0 }
  ), [aging]);

  const maxForecast = Math.max(1, ...forecast.map((f: any) => Number(f.expected_inflow || 0)));

  const topProfit = useMemo(
    () => [...profitability].sort((a, b) => (b.gross_margin || 0) - (a.gross_margin || 0)).slice(0, 5),
    [profitability]
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Accounts Receivable</h1>
          <p className="text-muted-foreground">Total receivables, aging, expected inflow, alerts &amp; approvals.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/receivables">Receivables</Link></Button>
          <Button asChild variant="outline"><Link to="/invoices">Invoices</Link></Button>
          <Button asChild variant="outline"><Link to="/clients">Customers</Link></Button>
          <Button
            variant="outline"
            onClick={() => generateRecurring.mutate(undefined)}
            disabled={generateRecurring.isPending}
            title="Generate any recurring invoices that are due as of today"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${generateRecurring.isPending ? 'animate-spin' : ''}`} />
            Run recurring
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <KpiCard
          icon={<IndianRupee className="h-5 w-5" />}
          label="Total Receivable"
          value={inr(kpi?.total_outstanding)}
          sub={`${kpi?.open_invoice_count || 0} open invoices`}
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Overdue"
          value={inr(kpi?.total_overdue)}
          sub={`${kpi?.overdue_count || 0} invoices`}
          tone="crit"
        />
        <KpiCard
          icon={<Clock className="h-5 w-5" />}
          label="Billed (this month)"
          value={inr(kpi?.this_month_billed)}
          sub={`Collected ${inr(kpi?.this_month_collected)}`}
          tone="warn"
        />
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          label="Customer Advances"
          value={inr(kpi?.unapplied_advances)}
          sub="Unapplied"
          tone="ok"
        />
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Active Customers"
          value={String(kpi?.active_customer_count || 0)}
          sub={`${kpi?.pending_approvals || 0} approvals pending`}
        />
      </div>

      {/* Aging summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Aging Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Not yet due',  v: totals.not_due,         tone: 'text-muted-foreground' },
              { label: '0–30 days',    v: totals.overdue_0_30,    tone: 'text-muted-foreground' },
              { label: '31–60 days',   v: totals.overdue_31_60,   tone: 'text-amber-600' },
              { label: '61–90 days',   v: totals.overdue_61_90,   tone: 'text-orange-600' },
              { label: '90+ days',     v: totals.overdue_90_plus, tone: 'text-red-600' },
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
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">0–30</TableHead>
                  <TableHead className="text-right">31–60</TableHead>
                  <TableHead className="text-right">61–90</TableHead>
                  <TableHead className="text-right">90+</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aging.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No open invoices.</TableCell></TableRow>
                )}
                {aging.slice(0, 25).map((r: any) => (
                  <TableRow key={r.customer_id || r.customer_name}>
                    <TableCell className="font-medium">{r.customer_name}</TableCell>
                    <TableCell className="text-right">{r.invoice_count}</TableCell>
                    <TableCell className="text-right font-semibold">{inr(r.total_outstanding)}</TableCell>
                    <TableCell className="text-right">{inr(r.overdue_0_30)}</TableCell>
                    <TableCell className="text-right text-amber-600">{inr(r.overdue_31_60)}</TableCell>
                    <TableCell className="text-right text-orange-600">{inr(r.overdue_61_90)}</TableCell>
                    <TableCell className="text-right text-red-600 font-semibold">{inr(r.overdue_90_plus)}</TableCell>
                    <TableCell className="text-right">
                      {r.customer_id && (
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/customer-ledger?customer=${r.customer_id}`}>
                            Ledger <ArrowRight className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Cash inflow forecast */}
      <Card>
        <CardHeader>
          <CardTitle>Expected Inflow (by week)</CardTitle>
        </CardHeader>
        <CardContent>
          {forecast.length === 0 ? (
            <p className="text-muted-foreground text-sm">No upcoming receivables.</p>
          ) : (
            <div className="space-y-2">
              {forecast.map((f: any) => {
                const pct = Math.round(Number(f.expected_inflow || 0) / maxForecast * 100);
                return (
                  <div key={f.week} className="flex items-center gap-3">
                    <div className="w-28 text-sm text-muted-foreground">
                      {new Date(f.week).toLocaleDateString('en-IN', { month: 'short', day: '2-digit' })}
                    </div>
                    <div className="flex-1 h-6 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-32 text-right text-sm font-medium">{inr(f.expected_inflow)}</div>
                    <div className="w-24 text-right text-xs">
                      <span className="text-muted-foreground">{f.invoice_count} inv</span>
                      {Number(f.overdue_portion || 0) > 0 && (
                        <span className="text-red-600 ml-1">· {inr(f.overdue_portion)} overdue</span>
                      )}
                    </div>
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
              Open Alerts
              <Badge variant="outline">{fraudAlerts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fraudAlerts.length === 0 ? (
              <p className="text-muted-foreground text-sm">No open alerts. ✓</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {fraudAlerts.map((a) => (
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
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {pendingApprovals.map((p) => (
                  <div key={p.request_id} className="rounded-md border p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        {p.entity_type.replace(/_/g, ' ')} · {p.reference || '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">{p.counterparty || '—'} · {inr(p.amount)}</div>
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

      {/* Customer concentration */}
      <Card>
        <CardHeader>
          <CardTitle>Top Customers by Outstanding</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">% of total</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customerConc.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No outstanding invoices.</TableCell></TableRow>
              )}
              {customerConc.map((v) => (
                <TableRow key={v.customer_id || v.customer_name}>
                  <TableCell className="font-medium">{v.customer_name}</TableCell>
                  <TableCell className="text-right">{v.invoice_count}</TableCell>
                  <TableCell className="text-right font-semibold">{inr(v.total_outstanding)}</TableCell>
                  <TableCell className="text-right">{Number(v.pct_of_total || 0).toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-red-600">{inr(v.overdue_amount)}</TableCell>
                  <TableCell className="text-right">
                    {v.customer_id && (
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/customer-ledger?customer=${v.customer_id}`}>
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

      {/* Top profitable customers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Customer Profitability (top 5 by margin)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Returns</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topProfit.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Not enough data yet.</TableCell></TableRow>
              )}
              {topProfit.map((p) => (
                <TableRow key={p.customer_id}>
                  <TableCell className="font-medium">{p.customer_name}</TableCell>
                  <TableCell className="text-right">{inr(p.revenue)}</TableCell>
                  <TableCell className="text-right">{inr(p.cogs)}</TableCell>
                  <TableCell className="text-right">{inr(p.returns_value)}</TableCell>
                  <TableCell className="text-right font-semibold">{inr(p.gross_margin)}</TableCell>
                  <TableCell className="text-right">{(p.margin_pct || 0).toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ARDashboard;
