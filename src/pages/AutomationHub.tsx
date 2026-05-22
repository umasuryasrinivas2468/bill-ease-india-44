import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle, Bell, CalendarClock, Wrench, ShieldCheck, FileWarning,
  IndianRupee, Activity, Copy, CheckCircle2,
} from 'lucide-react';
import { useBusinessAlerts } from '@/hooks/useAutomationHub';
import { summarizeAlerts, type AlertCategory, type AlertSeverity, type BusinessAlert } from '@/services/automationHubService';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

const CATEGORY_META: Record<AlertCategory, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  maintenance: { label: 'Maintenance', icon: Wrench },
  amc:         { label: 'AMC',         icon: ShieldCheck },
  warranty:    { label: 'Warranty',    icon: ShieldCheck },
  policy:      { label: 'Insurance',   icon: ShieldCheck },
  emi:         { label: 'EMI',         icon: IndianRupee },
  covenant:    { label: 'Covenants',   icon: FileWarning },
  idle:        { label: 'Idle assets', icon: Activity },
  duplicate:   { label: 'Duplicates',  icon: Copy },
};

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  warning:  'bg-amber-100 text-amber-800 border-amber-200',
  info:     'bg-blue-50  text-blue-700  border-blue-200',
};

const AutomationHub: React.FC = () => {
  const [withinDays, setWithinDays] = useState(30);
  const [idleThresholdDays, setIdleThresholdDays] = useState(180);
  const [activeCategory, setActiveCategory] = useState<AlertCategory | 'all'>('all');
  const [activeSeverity, setActiveSeverity] = useState<AlertSeverity | 'all'>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const { data: alerts = [], isLoading, refetch, isFetching } = useBusinessAlerts({
    withinDays,
    idleThresholdDays,
  });

  const counts = useMemo(() => summarizeAlerts(alerts), [alerts]);

  const visible = useMemo(() => {
    return alerts.filter((a) => {
      if (activeCategory !== 'all' && a.category !== activeCategory) return false;
      if (activeSeverity !== 'all' && a.severity !== activeSeverity) return false;
      if (overdueOnly && !a.is_overdue) return false;
      return true;
    });
  }, [alerts, activeCategory, activeSeverity, overdueOnly]);

  const renderAlertRow = (a: BusinessAlert) => {
    const Cat = CATEGORY_META[a.category].icon;
    return (
      <TableRow key={a.id} className={a.is_overdue ? 'bg-red-50/40' : undefined}>
        <TableCell>
          <Badge variant="outline" className={`text-[10px] ${SEVERITY_STYLE[a.severity]}`}>
            {a.is_overdue ? 'OVERDUE' : a.severity.toUpperCase()}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Cat className="h-3.5 w-3.5" />
            {CATEGORY_META[a.category].label}
          </div>
        </TableCell>
        <TableCell className="font-medium">{a.title}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{a.description}</TableCell>
        <TableCell className="whitespace-nowrap">{fmtDate(a.due_date)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {a.amount != null ? inr(a.amount) : '—'}
        </TableCell>
        <TableCell className="text-right">
          {a.link && (
            <Link to={a.link}>
              <Button size="sm" variant="ghost">View</Button>
            </Link>
          )}
        </TableCell>
      </TableRow>
    );
  };

  const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; tone?: AlertSeverity }> = ({ icon, label, value, tone }) => (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
          {icon}{label}
        </div>
        <div className={`text-2xl font-bold ${tone === 'critical' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Automation Hub</h1>
          <p className="text-sm text-muted-foreground">
            Single inbox for everything that needs attention across assets and liabilities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">Look-ahead</div>
          <Input
            type="number"
            min={1}
            max={365}
            className="w-20"
            value={withinDays}
            onChange={(e) => setWithinDays(Math.max(1, Number(e.target.value) || 30))}
          />
          <div className="text-xs text-muted-foreground">days</div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Severity KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Critical" value={counts.critical} tone="critical" />
        <KpiCard icon={<Bell className="h-3.5 w-3.5" />}          label="Warning"  value={counts.warning}  tone="warning" />
        <KpiCard icon={<CalendarClock className="h-3.5 w-3.5" />} label="Info"     value={counts.info} />
        <KpiCard icon={<Bell className="h-3.5 w-3.5" />}          label="Total alerts" value={counts.total} />
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={activeCategory === 'all' ? 'default' : 'outline'}
          onClick={() => setActiveCategory('all')}
        >
          All ({counts.total})
        </Button>
        {(Object.entries(CATEGORY_META) as Array<[AlertCategory, typeof CATEGORY_META[AlertCategory]]>).map(([cat, meta]) => {
          const n = counts.by_category[cat];
          const Cat = meta.icon;
          return (
            <Button
              key={cat}
              size="sm"
              variant={activeCategory === cat ? 'default' : 'outline'}
              onClick={() => setActiveCategory(cat)}
              disabled={n === 0}
            >
              <Cat className="h-3.5 w-3.5 mr-1.5" />
              {meta.label} ({n})
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Severity:</span>
          {(['all', 'critical', 'warning', 'info'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={activeSeverity === s ? 'default' : 'ghost'}
              className="h-7 px-2 text-xs capitalize"
              onClick={() => setActiveSeverity(s)}
            >
              {s}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="overdue-only"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="h-4 w-4"
          />
          <label htmlFor="overdue-only" className="text-xs cursor-pointer">Overdue only</label>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">Idle ≥</span>
          <Input
            type="number"
            min={30}
            max={730}
            className="w-20 h-7"
            value={idleThresholdDays}
            onChange={(e) => setIdleThresholdDays(Math.max(30, Number(e.target.value) || 180))}
          />
          <span className="text-xs text-muted-foreground">days</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {activeCategory === 'all'
              ? `${visible.length} alert${visible.length === 1 ? '' : 's'}`
              : `${CATEGORY_META[activeCategory].label} (${visible.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : visible.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-emerald-600" />
              All clear — no alerts match these filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Severity</TableHead>
                  <TableHead className="w-32">Category</TableHead>
                  <TableHead>Alert</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-28">Due</TableHead>
                  <TableHead className="text-right w-28">Amount</TableHead>
                  <TableHead className="text-right w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(renderAlertRow)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AutomationHub;
