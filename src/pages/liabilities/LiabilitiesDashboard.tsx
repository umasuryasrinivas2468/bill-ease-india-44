import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IndianRupee, AlertTriangle, Calendar, Plus, ArrowRight, CalendarClock, Banknote } from 'lucide-react';
import { useLiabilities, useUpcomingEmis } from '@/hooks/useLiabilities';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'default'|'warn'|'ok'|'crit' }> = ({ icon, label, value, sub, tone = 'default' }) => {
  const toneClass = { default: 'text-foreground', warn: 'text-amber-600', ok: 'text-emerald-600', crit: 'text-red-600' }[tone];
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

const LiabilitiesDashboard: React.FC = () => {
  const { data: liabilities = [] } = useLiabilities();
  const { data: upcoming = [] } = useUpcomingEmis(60);

  const kpi = useMemo(() => {
    const active = liabilities.filter((l) => l.status === 'active' || l.status === 'defaulted');
    const totalOutstanding = active.reduce((s, l) => s + Number(l.outstanding_principal || 0), 0);
    const totalInterest = active.reduce((s, l) => s + Number(l.total_interest_paid || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const overdue = upcoming.filter((e) => e.due_date < today);
    return {
      activeCount: active.length,
      totalOutstanding,
      totalInterest,
      next30: upcoming.filter((e) => e.due_date >= today).slice(0, 30).reduce((s, e) => s + Number(e.total_emi), 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((s, e) => s + Number(e.total_emi), 0),
    };
  }, [liabilities, upcoming]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Liabilities & Loans</h1>
          <p className="text-sm text-muted-foreground">Outstanding obligations, EMI calendar, and journal-driven repayments.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/liabilities/emi-calendar"><Button variant="outline"><Calendar className="h-4 w-4 mr-2" />EMI calendar</Button></Link>
          <Link to="/liabilities/create"><Button><Plus className="h-4 w-4 mr-2" />New liability</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<Banknote className="h-5 w-5" />} label="Active liabilities" value={String(kpi.activeCount)} />
        <KpiCard icon={<IndianRupee className="h-5 w-5" />} label="Total outstanding" value={inr(kpi.totalOutstanding)} tone="warn" />
        <KpiCard icon={<CalendarClock className="h-5 w-5" />} label="Due in next 60 days" value={inr(kpi.next30)} />
        <KpiCard icon={<AlertTriangle className="h-5 w-5" />} label="Overdue EMIs" value={String(kpi.overdueCount)} sub={inr(kpi.overdueAmount)} tone={kpi.overdueCount > 0 ? 'crit' : 'ok'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Active liabilities</CardTitle>
            <Link to="/liabilities/list" className="text-xs text-primary inline-flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
          </CardHeader>
          <CardContent>
            {liabilities.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No liabilities yet. <Link to="/liabilities/create" className="text-primary underline">Add the first one</Link>.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liabilities.slice(0, 8).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs"><Link to={`/liabilities/${l.id}`} className="text-primary hover:underline">{l.liability_code}</Link></TableCell>
                      <TableCell>{l.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] capitalize">{l.liability_type.replace('_', ' ')}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{inr(l.outstanding_principal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Upcoming EMIs</CardTitle></CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No EMIs scheduled.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Due</TableHead>
                    <TableHead>Loan</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcoming.slice(0, 8).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{e.due_date}</TableCell>
                      <TableCell className="text-sm">
                        <Link to={`/liabilities/${e.liability_id}`} className="text-primary hover:underline">{e.liability_name}</Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{inr(e.principal_component)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{inr(e.interest_component)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{inr(e.total_emi)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LiabilitiesDashboard;
