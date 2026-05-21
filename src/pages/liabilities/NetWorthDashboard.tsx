import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, TrendingDown, Scale, PieChart as PieIcon, AlertTriangle } from 'lucide-react';
import {
  useNetWorthSnapshot,
  useClassificationRollup,
} from '@/hooks/useLiabilityExtensions';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const ratio = (n: number | null | undefined) =>
  n == null ? '—' : n.toFixed(2);

const NetWorthDashboard: React.FC = () => {
  const { data: snap, isLoading } = useNetWorthSnapshot();
  const { data: rollup } = useClassificationRollup();

  if (isLoading || !snap) return <div className="p-6 text-sm text-muted-foreground">Computing…</div>;

  // Solvency cues
  const debtToEquityWarn = (snap.debt_to_equity ?? 0) > 2;
  const currentRatioWarn = snap.current_ratio !== null && snap.current_ratio < 1;
  const leverageWarn = (snap.leverage_ratio ?? 0) > 0.7;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Net Worth & Solvency</h1>
          <p className="text-sm text-muted-foreground">
            Live snapshot of assets vs. liabilities with key solvency ratios.
          </p>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Total assets</div>
            <div className="text-2xl font-bold">{inr(snap.total_assets)}</div>
            <div className="text-xs text-muted-foreground">
              Fixed {inr(snap.fixed_assets_value)} · Current {inr(snap.current_assets)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Total liabilities</div>
            <div className="text-2xl font-bold">{inr(snap.total_debt)}</div>
            <div className="text-xs text-muted-foreground">
              Current {inr(snap.current_liabilities)} · Non-current {inr(snap.non_current_liabilities)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <Scale className="h-3.5 w-3.5" /> Net worth
            </div>
            <div className={`text-2xl font-bold ${snap.book_net_worth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {inr(snap.book_net_worth)}
            </div>
            <div className="text-xs text-muted-foreground">Assets − Liabilities</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Debt-to-Equity</div>
            <div className={`text-2xl font-bold ${debtToEquityWarn ? 'text-amber-600' : ''}`}>
              {ratio(snap.debt_to_equity)}
            </div>
            <div className="text-xs text-muted-foreground">{debtToEquityWarn ? 'Above 2.0 — high leverage' : 'Healthy'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Solvency ratios */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Current ratio</div>
            <div className={`text-xl font-bold ${currentRatioWarn ? 'text-red-600' : 'text-emerald-600'}`}>
              {ratio(snap.current_ratio)}
            </div>
            <div className="text-xs text-muted-foreground">
              {currentRatioWarn
                ? 'Below 1 — current liabilities exceed current assets'
                : 'Current assets cover short-term obligations'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Leverage ratio</div>
            <div className={`text-xl font-bold ${leverageWarn ? 'text-amber-600' : ''}`}>
              {ratio(snap.leverage_ratio)}
            </div>
            <div className="text-xs text-muted-foreground">Total liabilities / total assets</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Secured / unsecured</div>
            <div className="text-sm font-bold">
              {inr(snap.secured_debt)} · {inr(snap.unsecured_debt)}
            </div>
            <div className="text-xs text-muted-foreground">
              Statutory: {inr(snap.statutory_debt)}
            </div>
          </CardContent>
        </Card>
      </div>

      {(debtToEquityWarn || currentRatioWarn || leverageWarn) && (
        <Card className="border-amber-500/40">
          <CardContent className="pt-4 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span>
              Solvency flags:{' '}
              {[
                debtToEquityWarn && 'Debt-to-equity > 2.0',
                currentRatioWarn && 'Current ratio < 1',
                leverageWarn && 'Leverage > 70%',
              ].filter(Boolean).join(' · ')}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Liability composition */}
      {rollup && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieIcon className="h-4 w-4" /> Liability composition
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">% of total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rollup.by_type.map((row) => (
                  <TableRow key={row.liability_type}>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {row.liability_type.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(row.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rollup.total_outstanding > 0
                        ? ((row.total / rollup.total_outstanding) * 100).toFixed(1) + '%'
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {rollup.by_type.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">
                      No active liabilities.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 text-sm">
        <Link to="/liabilities/forecast" className="text-primary hover:underline">View payment forecast →</Link>
        <span className="text-muted-foreground">·</span>
        <Link to="/liabilities/covenants" className="text-primary hover:underline">View covenants →</Link>
        <span className="text-muted-foreground">·</span>
        <Link to="/liabilities" className="text-primary hover:underline">All liabilities →</Link>
      </div>
    </div>
  );
};

export default NetWorthDashboard;
