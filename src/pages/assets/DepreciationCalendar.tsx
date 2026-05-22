import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CalendarClock, ChevronLeft, ChevronRight, TrendingDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { supabase } from '@/lib/supabase';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const monthLabel = (d: Date) =>
  d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

interface ScheduleRow {
  id: string;
  asset_id: string;
  period_start: string;
  period_end: string;
  depreciation_amount: number;
  status: 'planned' | 'posted' | 'skipped' | 'adjusted';
  fixed_assets?: { asset_code: string; name: string };
}

const DepreciationCalendar: React.FC = () => {
  const { user } = useUser();
  const uid = user && isValidUserId(user.id) ? normalizeUserId(user.id) : null;

  // Look-back / forward bounds — default 3 months back + 12 months forward.
  const [anchorMonth, setAnchorMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const rangeStart = useMemo(() => {
    const d = new Date(anchorMonth);
    d.setMonth(d.getMonth() - 3);
    return d;
  }, [anchorMonth]);

  const rangeEnd = useMemo(() => {
    const d = new Date(anchorMonth);
    d.setMonth(d.getMonth() + 12);
    return d;
  }, [anchorMonth]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['depreciation-calendar', uid, monthKey(rangeStart), monthKey(rangeEnd)],
    enabled: !!uid,
    queryFn: async (): Promise<ScheduleRow[]> => {
      const { data, error } = await supabase
        .from('asset_depreciation_schedule')
        .select('id, asset_id, period_start, period_end, depreciation_amount, status, fixed_assets!inner(asset_code, name)')
        .eq('user_id', uid!)
        .gte('period_end', rangeStart.toISOString().slice(0, 10))
        .lte('period_start', rangeEnd.toISOString().slice(0, 10))
        .order('period_end');
      if (error) throw error;
      return (data || []) as unknown as ScheduleRow[];
    },
  });

  // Build the 15-month strip (anchorMonth - 3 to anchorMonth + 12)
  const months = useMemo(() => {
    const arr: Date[] = [];
    for (let i = -3; i < 12; i++) {
      const d = new Date(anchorMonth);
      d.setMonth(d.getMonth() + i);
      arr.push(d);
    }
    return arr;
  }, [anchorMonth]);

  // Per-month rollup: { 'YYYY-MM': { planned, posted, assets } }
  const monthly = useMemo(() => {
    const map = new Map<string, {
      planned: number;
      posted: number;
      adjusted: number;
      skipped: number;
      assetCount: number;
      rows: ScheduleRow[];
    }>();
    for (const r of rows) {
      const k = monthKey(new Date(r.period_end));
      const slot = map.get(k) || { planned: 0, posted: 0, adjusted: 0, skipped: 0, assetCount: 0, rows: [] };
      const amt = Number(r.depreciation_amount || 0);
      if (r.status === 'planned')  slot.planned += amt;
      if (r.status === 'posted')   slot.posted += amt;
      if (r.status === 'adjusted') slot.adjusted += amt;
      if (r.status === 'skipped')  slot.skipped += amt;
      slot.rows.push(r);
      map.set(k, slot);
    }
    for (const [k, slot] of map.entries()) {
      slot.assetCount = new Set(slot.rows.map(r => r.asset_id)).size;
      map.set(k, slot);
    }
    return map;
  }, [rows]);

  const maxMonthly = useMemo(() => {
    let max = 0;
    for (const m of monthly.values()) {
      const total = m.planned + m.posted + m.adjusted;
      if (total > max) max = total;
    }
    return max;
  }, [monthly]);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const selectedRows = selectedMonth
    ? (monthly.get(selectedMonth)?.rows || []).sort(
        (a, b) => Number(b.depreciation_amount || 0) - Number(a.depreciation_amount || 0),
      )
    : [];

  const todayKey = monthKey(new Date());

  // Totals
  const totalPlanned   = Array.from(monthly.values()).reduce((s, m) => s + m.planned, 0);
  const totalPosted    = Array.from(monthly.values()).reduce((s, m) => s + m.posted, 0);
  const nextMonthSlot  = monthly.get(monthKey(new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() + 1, 1)));

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Depreciation Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Monthly forecast across all assets — planned vs posted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => {
            const d = new Date(anchorMonth);
            d.setMonth(d.getMonth() - 12);
            setAnchorMonth(d);
          }}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            const d = new Date();
            d.setDate(1);
            setAnchorMonth(d);
          }}>
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            const d = new Date(anchorMonth);
            d.setMonth(d.getMonth() + 12);
            setAnchorMonth(d);
          }}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Link to="/assets/depreciation"><Button size="sm"><CalendarClock className="h-4 w-4 mr-2" />Run depreciation</Button></Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-5">
          <div className="text-xs uppercase text-muted-foreground">Planned (15-mo window)</div>
          <div className="text-2xl font-bold">{inr(totalPlanned)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-xs uppercase text-muted-foreground">Posted (15-mo window)</div>
          <div className="text-2xl font-bold text-emerald-600">{inr(totalPosted)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-xs uppercase text-muted-foreground">Next month</div>
          <div className="text-2xl font-bold">{inr((nextMonthSlot?.planned || 0) + (nextMonthSlot?.posted || 0))}</div>
          <div className="text-[10px] text-muted-foreground">{nextMonthSlot?.assetCount || 0} assets</div>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-xs uppercase text-muted-foreground">Rows in range</div>
          <div className="text-2xl font-bold">{rows.length}</div>
        </CardContent></Card>
      </div>

      {/* Monthly heatmap strip */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Monthly depreciation — 15 month view
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="overflow-x-auto pb-2">
              <div className="grid grid-flow-col auto-cols-[minmax(80px,1fr)] gap-1.5 min-w-max">
                {months.map((m) => {
                  const k = monthKey(m);
                  const slot = monthly.get(k);
                  const total = (slot?.planned || 0) + (slot?.posted || 0) + (slot?.adjusted || 0);
                  const heatPct = maxMonthly > 0 ? (total / maxMonthly) : 0;
                  const isCurrentMonth = k === todayKey;
                  const isSelected = k === selectedMonth;
                  const isPast = m < new Date(new Date().getFullYear(), new Date().getMonth(), 1);

                  return (
                    <button
                      key={k}
                      onClick={() => setSelectedMonth(isSelected ? null : k)}
                      className={`text-left rounded-md border p-2 transition hover:border-primary/60 ${
                        isSelected ? 'border-primary ring-2 ring-primary/20' :
                        isCurrentMonth ? 'border-blue-400' : 'border-border'
                      } ${isPast ? 'opacity-70' : ''}`}
                    >
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center justify-between">
                        <span>{monthLabel(m)}</span>
                        {isCurrentMonth && <Badge variant="outline" className="text-[8px] px-1 py-0">Now</Badge>}
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${isPast ? 'bg-emerald-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.max(2, heatPct * 100)}%` }}
                        />
                      </div>
                      <div className="text-xs font-semibold mt-1 tabular-nums">
                        {total > 0 ? inr(total) : <span className="text-muted-foreground font-normal">—</span>}
                      </div>
                      {slot && slot.assetCount > 0 && (
                        <div className="text-[10px] text-muted-foreground">{slot.assetCount} asset{slot.assetCount === 1 ? '' : 's'}</div>
                      )}
                      {slot && slot.posted > 0 && (
                        <div className="text-[10px] text-emerald-700">{inr(slot.posted)} posted</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground mt-3 pt-3 border-t">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Past / posted</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />Planned</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full border border-blue-400" />Current month</span>
            <span className="ml-auto">Click any month to see the per-asset breakdown.</span>
          </div>
        </CardContent>
      </Card>

      {/* Drill-down */}
      {selectedMonth && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedMonth} — {selectedRows.length} period{selectedRows.length === 1 ? '' : 's'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Depreciation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link to={`/assets/${r.asset_id}`} className="text-primary hover:underline">
                        <span className="font-mono text-[10px] text-muted-foreground mr-2">{r.fixed_assets?.asset_code}</span>
                        {r.fixed_assets?.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.period_start} → {r.period_end}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === 'posted'   ? 'default' :
                          r.status === 'planned'  ? 'outline' :
                          r.status === 'adjusted' ? 'secondary' : 'destructive'
                        }
                        className="capitalize text-[10px]"
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {inr(r.depreciation_amount)}
                    </TableCell>
                  </TableRow>
                ))}
                {selectedRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                      No scheduled depreciation in this month.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DepreciationCalendar;
