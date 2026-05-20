import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, ShieldCheck, Wrench, CalendarClock } from 'lucide-react';
import {
  useDueMaintenanceAlerts,
  useAmcExpiringAlerts,
  useMaintenanceRecords,
  useMaintenanceSummaries,
} from '@/hooks/useAssetMaintenance';
import { useFixedAssets } from '@/hooks/useFixedAssets';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const MaintenanceDashboard: React.FC = () => {
  const { data: due = [] } = useDueMaintenanceAlerts(14);
  const { data: amcExpiring = [] } = useAmcExpiringAlerts(30);
  const { data: records = [] } = useMaintenanceRecords();
  const { data: summaries = [] } = useMaintenanceSummaries();
  const { data: assets = [] } = useFixedAssets();

  const overdueCount = due.filter((d) => d.is_overdue).length;
  const dueSoonCount = due.length - overdueCount;
  const expiredCount = amcExpiring.filter((a) => a.is_expired).length;

  const lifetimeSpend = summaries.reduce((s, x) => s + Number(x.total_cost || 0), 0);
  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);
  const last30Iso = last30.toISOString().slice(0, 10);
  const last30Spend = records
    .filter((r) => r.status === 'completed' && r.performed_on >= last30Iso)
    .reduce((s, r) => s + Number(r.cost || 0), 0);

  const assetById = new Map(assets.map((a) => [a.id, a]));

  const topByCost = [...summaries]
    .sort((a, b) => Number(b.total_cost || 0) - Number(a.total_cost || 0))
    .slice(0, 5);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
          <p className="text-sm text-muted-foreground">
            Service schedules, AMC contracts and repair history across all assets.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Overdue services
            </div>
            <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              Due in 14 days
            </div>
            <div className="text-2xl font-bold text-amber-600">{dueSoonCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              AMCs expiring (30d)
            </div>
            <div className="text-2xl font-bold">
              {amcExpiring.length}
              {expiredCount > 0 && <span className="text-sm font-normal text-red-600 ml-2">{expiredCount} expired</span>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <Wrench className="h-3.5 w-3.5" />
              Spend (30d)
            </div>
            <div className="text-2xl font-bold">{inr(last30Spend)}</div>
            <div className="text-xs text-muted-foreground">lifetime {inr(lifetimeSpend)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Due alerts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Upcoming & overdue services</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {due.map((d) => (
                <TableRow key={d.schedule.id}>
                  <TableCell>
                    <Link to={`/assets/${d.schedule.asset_id}`} className="text-primary hover:underline">
                      <div className="font-medium">{d.asset_name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{d.asset_code}</div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {d.schedule.schedule_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{d.schedule.title}</TableCell>
                  <TableCell className="text-sm">{d.schedule.vendor_name || '—'}</TableCell>
                  <TableCell className="text-sm">{d.schedule.next_due_date}</TableCell>
                  <TableCell className="text-right">
                    {d.is_overdue ? (
                      <Badge variant="destructive" className="text-[10px]">
                        {Math.abs(d.days_until_due)}d overdue
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        in {d.days_until_due}d
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {due.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                    Nothing due in the next 14 days. ✨
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* AMC expiry */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AMC contracts expiring</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>End date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {amcExpiring.map((a) => (
                <TableRow key={a.schedule.id}>
                  <TableCell>
                    <Link to={`/assets/${a.schedule.asset_id}`} className="text-primary hover:underline">
                      <div className="font-medium">{a.asset_name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{a.asset_code}</div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{a.schedule.title}</TableCell>
                  <TableCell className="text-sm">{a.schedule.vendor_name || '—'}</TableCell>
                  <TableCell className="text-sm">{a.schedule.amc_end_date}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(a.schedule.amc_amount)}</TableCell>
                  <TableCell className="text-right">
                    {a.is_expired ? (
                      <Badge variant="destructive" className="text-[10px]">expired</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">in {a.days_until_expiry}d</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {amcExpiring.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                    No AMCs expiring in the next 30 days.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Top spenders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top maintenance spend by asset</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">Events</TableHead>
                <TableHead className="text-right">Lifetime cost</TableHead>
                <TableHead className="text-right">Repair cost</TableHead>
                <TableHead>Last service</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topByCost.map((s) => {
                const a = assetById.get(s.asset_id);
                return (
                  <TableRow key={s.asset_id}>
                    <TableCell>
                      <Link to={`/assets/${s.asset_id}`} className="text-primary hover:underline">
                        <div className="font-medium">{a?.name || s.asset_id}</div>
                        <div className="text-xs font-mono text-muted-foreground">{a?.asset_code}</div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.completed_events}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(s.total_cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(s.total_repair_cost)}</TableCell>
                    <TableCell className="text-sm">{s.last_service_on || '—'}</TableCell>
                  </TableRow>
                );
              })}
              {topByCost.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">
                    No maintenance recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default MaintenanceDashboard;
