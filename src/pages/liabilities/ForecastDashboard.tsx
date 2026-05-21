import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, AlertTriangle, TrendingDown } from 'lucide-react';
import {
  useUpcomingEmis,
  useForecastSummary,
  useAccrueAllMonthEnd,
} from '@/hooks/useLiabilityExtensions';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const ForecastDashboard: React.FC = () => {
  const [horizon, setHorizon] = useState(90);
  const [threshold, setThreshold] = useState<number>(0);
  const { data: emis = [] } = useUpcomingEmis(horizon);
  const { data: summary } = useForecastSummary(horizon, threshold > 0 ? threshold : undefined);
  const accrueAll = useAccrueAllMonthEnd();

  const overdueEmis = emis.filter((e) => e.is_overdue);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Liability Forecast</h1>
          <p className="text-sm text-muted-foreground">
            Upcoming EMIs and projected interest accruals over the next {horizon} days.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Next 30 days</SelectItem>
              <SelectItem value="60">Next 60 days</SelectItem>
              <SelectItem value="90">Next 90 days</SelectItem>
              <SelectItem value="180">Next 6 months</SelectItem>
              <SelectItem value="365">Next 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => accrueAll.mutate(undefined)}
            disabled={accrueAll.isPending}
            title="Post month-end interest accrual journals for every active interest-bearing liability"
          >
            {accrueAll.isPending ? 'Running…' : 'Run month-end accrual'}
          </Button>
        </div>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs uppercase text-muted-foreground">Total outflow</div>
                <div className="text-2xl font-bold">{inr(summary.total_emi_due + summary.projected_interest_accrual)}</div>
                <div className="text-xs text-muted-foreground">EMIs + projected accruals</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs uppercase text-muted-foreground">Principal due</div>
                <div className="text-xl font-bold">{inr(summary.total_principal_due)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs uppercase text-muted-foreground">Interest due (in EMIs)</div>
                <div className="text-xl font-bold">{inr(summary.total_interest_due)}</div>
                <div className="text-xs text-muted-foreground">+ accruals {inr(summary.projected_interest_accrual)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Overdue
                </div>
                <div className="text-2xl font-bold text-red-600">{inr(summary.overdue_emi_amount)}</div>
                <div className="text-xs text-muted-foreground">{overdueEmis.length} EMIs</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Liquidity warning</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <Label>Threshold (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="1000"
                    value={threshold || ''}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    placeholder="e.g. 500000"
                  />
                </div>
              </div>
              {summary.liquidity_warning ? (
                <div className="text-sm text-red-600 flex items-start gap-2">
                  <TrendingDown className="h-4 w-4 mt-0.5" />
                  {summary.liquidity_warning}
                </div>
              ) : threshold > 0 ? (
                <div className="text-xs text-emerald-600">
                  ✓ Forecast outflow is within the threshold of {inr(threshold)}.
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Set a threshold to receive a warning when forecast outflow exceeds it.
                </div>
              )}
            </CardContent>
          </Card>

          {summary.by_month.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By month</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Principal</TableHead>
                      <TableHead className="text-right">Interest</TableHead>
                      <TableHead className="text-right">Total EMI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.by_month.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell className="text-sm">{m.month}</TableCell>
                        <TableCell className="text-right tabular-nums">{inr(m.principal)}</TableCell>
                        <TableCell className="text-right tabular-nums">{inr(m.interest)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{inr(m.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Upcoming EMIs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Liability</TableHead>
                <TableHead>Lender</TableHead>
                <TableHead>EMI #</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emis.map((e) => (
                <TableRow key={`${e.liability_id}-${e.emi_number}`}>
                  <TableCell>
                    <Link to={`/liabilities/${e.liability_id}`} className="text-primary hover:underline">
                      <div className="font-medium text-sm">{e.liability_name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{e.liability_code}</div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{e.lender_name || '—'}</TableCell>
                  <TableCell className="text-xs">{e.emi_number}</TableCell>
                  <TableCell className="text-xs">{e.due_date}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(e.principal_component)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(e.interest_component)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{inr(e.total_emi)}</TableCell>
                  <TableCell className="text-right">
                    {e.is_overdue ? (
                      <Badge variant="destructive" className="text-[10px]">{Math.abs(e.days_until_due)}d overdue</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">in {e.days_until_due}d</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {emis.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                    No EMIs due in the next {horizon} days.
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

export default ForecastDashboard;
