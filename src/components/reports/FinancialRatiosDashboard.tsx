import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { fetchFinancialRatios, FinancialRatios } from '@/services/financialStatementsService';
import { cn } from '@/lib/utils';

interface Props { financialYear: string; }

const formatINR = (n: number) =>
  n === 0 ? '-' : Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const formatRatio = (n: number | null, dp = 2) =>
  n === null || n === undefined || isNaN(n) ? '—' : n.toFixed(dp);

const formatPct = (n: number | null) =>
  n === null || n === undefined || isNaN(n) ? '—' : `${n.toFixed(2)}%`;

interface BenchmarkProps {
  value: number | null;
  good?: (v: number) => boolean;
  warn?: (v: number) => boolean;
}
const benchTone = ({ value, good, warn }: BenchmarkProps) => {
  if (value === null || value === undefined || isNaN(value)) return 'text-muted-foreground';
  if (good && good(value)) return 'text-emerald-600';
  if (warn && warn(value)) return 'text-amber-600';
  return 'text-red-600';
};

const KPI: React.FC<{ label: string; value: string; tone?: string; sub?: string }> = ({ label, value, tone, sub }) => (
  <div className="rounded-lg border bg-muted/20 p-3">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={cn('text-lg font-semibold tabular-nums leading-tight', tone)}>{value}</div>
    {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
  </div>
);

const FinancialRatiosDashboard: React.FC<Props> = ({ financialYear }) => {
  const { user } = useUser();
  const [r, setR] = useState<FinancialRatios | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    setR(await fetchFinancialRatios(user.id, financialYear));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id, financialYear]);

  if (loading && !r) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Computing ratios…
        </CardContent>
      </Card>
    );
  }
  if (!r) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Ratio Analysis</CardTitle>
          <CardDescription>
            All ratios derived from posted journals · FY {financialYear}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1.5 hidden sm:inline">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Liquidity */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold text-sm">Liquidity</h4>
            <Badge variant="outline" className="text-[10px]">Can pay short-term obligations?</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <KPI label="Current Ratio" value={formatRatio(r.liquidity.current_ratio)}
                 tone={benchTone({ value: r.liquidity.current_ratio, good: v => v >= 1.5, warn: v => v >= 1 })}
                 sub="Healthy: > 1.5" />
            <KPI label="Quick Ratio" value={formatRatio(r.liquidity.quick_ratio)}
                 tone={benchTone({ value: r.liquidity.quick_ratio, good: v => v >= 1, warn: v => v >= 0.5 })}
                 sub="Healthy: > 1" />
            <KPI label="Cash Ratio" value={formatRatio(r.liquidity.cash_ratio)}
                 tone={benchTone({ value: r.liquidity.cash_ratio, good: v => v >= 0.5, warn: v => v >= 0.2 })}
                 sub="Healthy: > 0.5" />
            <KPI label="Working Capital" value={`₹ ${formatINR(r.liquidity.working_capital)}`}
                 tone={r.liquidity.working_capital >= 0 ? 'text-emerald-600' : 'text-red-600'}
                 sub="CA − CL" />
          </div>
        </section>

        {/* Leverage */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold text-sm">Leverage & Solvency</h4>
            <Badge variant="outline" className="text-[10px]">How much debt vs equity?</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <KPI label="Debt-to-Equity" value={formatRatio(r.leverage.debt_to_equity)}
                 tone={benchTone({ value: r.leverage.debt_to_equity, good: v => v <= 1, warn: v => v <= 2 })}
                 sub="Healthy: < 1" />
            <KPI label="LT D/E" value={formatRatio(r.leverage.lt_debt_to_equity)}
                 sub="LT debt only" />
            <KPI label="Interest Coverage" value={formatRatio(r.leverage.interest_coverage)}
                 tone={benchTone({ value: r.leverage.interest_coverage, good: v => v >= 3, warn: v => v >= 1.5 })}
                 sub="EBITDA / Finance Costs" />
            <KPI label="Net Worth" value={`₹ ${formatINR(r.leverage.net_worth)}`}
                 tone={r.leverage.net_worth >= 0 ? 'text-emerald-600' : 'text-red-600'}
                 sub="Equity + Reserves" />
          </div>
        </section>

        {/* Profitability */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold text-sm">Profitability</h4>
            <Badge variant="outline" className="text-[10px]">How much profit per ₹?</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <KPI label="Gross Margin"        value={formatPct(r.profitability.gross_profit_margin_pct)}
                 tone={benchTone({ value: r.profitability.gross_profit_margin_pct, good: v => v >= 30, warn: v => v >= 15 })} />
            <KPI label="Operating Margin"    value={formatPct(r.profitability.operating_profit_margin_pct)} />
            <KPI label="Net Margin"          value={formatPct(r.profitability.net_profit_margin_pct)}
                 tone={benchTone({ value: r.profitability.net_profit_margin_pct, good: v => v >= 10, warn: v => v >= 5 })} />
            <KPI label="ROE"                 value={formatPct(r.profitability.return_on_equity_pct)}
                 tone={benchTone({ value: r.profitability.return_on_equity_pct, good: v => v >= 15, warn: v => v >= 8 })} />
            <KPI label="ROA"                 value={formatPct(r.profitability.return_on_assets_pct)} />
            <KPI label="ROCE"                value={formatPct(r.profitability.return_on_capital_employed_pct)} />
            <KPI label="EBITDA"              value={`₹ ${formatINR(r.profitability.ebitda)}`} />
            <KPI label="PAT"                 value={`₹ ${formatINR(r.profitability.pat)}`}
                 tone={r.profitability.pat >= 0 ? 'text-emerald-600' : 'text-red-600'} />
          </div>
        </section>

        {/* Efficiency */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold text-sm">Efficiency / Cash Cycle</h4>
            <Badge variant="outline" className="text-[10px]">How fast does money move?</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <KPI label="Receivable Days"   value={formatRatio(r.efficiency.receivable_days, 0)} sub="Lower is better" />
            <KPI label="Inventory Days"    value={formatRatio(r.efficiency.inventory_days, 0)}  sub="Lower is better" />
            <KPI label="Payable Days"      value={formatRatio(r.efficiency.payable_days, 0)}    sub="Higher = more float" />
            <KPI label="Cash Conv. Cycle"  value={formatRatio(r.efficiency.cash_conversion_cycle, 0)}
                 tone={benchTone({ value: r.efficiency.cash_conversion_cycle, good: v => v <= 30, warn: v => v <= 60 })}
                 sub="Recv + Inv − Pay days" />
            <KPI label="Asset Turnover"        value={formatRatio(r.efficiency.asset_turnover)} />
            <KPI label="Receivables Turnover"  value={formatRatio(r.efficiency.receivables_turnover)} />
            <KPI label="Inventory Turnover"    value={formatRatio(r.efficiency.inventory_turnover)} />
            <KPI label="Payables Turnover"     value={formatRatio(r.efficiency.payables_turnover)} />
          </div>
        </section>
      </CardContent>
    </Card>
  );
};

export default FinancialRatiosDashboard;
