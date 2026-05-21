import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Brain, Building2, AlertTriangle, TrendingUp, TrendingDown, Scale,
  ShieldCheck, Wrench, Shield, Briefcase, HardHat,
} from 'lucide-react';
import { useCfoIntelligence } from '@/hooks/useMis';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const CfoSnapshot: React.FC = () => {
  const { data, isLoading } = useCfoIntelligence();

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Computing CFO snapshot…</div>;
  }

  const netWorthPositive = data.estimated_net_worth >= 0;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="h-6 w-6" /> CFO Snapshot
        </h1>
        <p className="text-sm text-muted-foreground">
          Consolidated view across assets, liabilities, leases, CWIP, covenants and cash flow obligations.
        </p>
      </div>

      {data.risk_flags.length > 0 && (
        <Card className="border-red-500/40 bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-red-700 dark:text-red-400">
                  {data.risk_flags.length} risk flag{data.risk_flags.length > 1 ? 's' : ''} detected
                </div>
                <ul className="text-sm mt-1 space-y-0.5">
                  {data.risk_flags.map((f, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-red-600 mt-0.5">•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top-line financials */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Total assets</div>
            <div className="text-2xl font-bold">{inr(data.total_assets_book)}</div>
            <div className="text-xs text-muted-foreground">Books</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Total liabilities</div>
            <div className="text-2xl font-bold">{inr(data.total_liabilities_book)}</div>
            <div className="text-xs text-muted-foreground">Loans + Leases + AP + Interest</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <Scale className="h-3.5 w-3.5" /> Estimated net worth
            </div>
            <div className={`text-2xl font-bold ${netWorthPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {inr(data.estimated_net_worth)}
            </div>
            <div className="text-xs text-muted-foreground">Assets − Liabilities</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3.5 w-3.5" /> 30-day cash outflow
            </div>
            <div className="text-2xl font-bold text-amber-600">{inr(data.emi_outflow_30d)}</div>
            <div className="text-xs text-muted-foreground">{data.emis_due_30d} EMI{data.emis_due_30d === 1 ? '' : 's'} due</div>
          </CardContent>
        </Card>
      </div>

      {/* Asset composition */}
      <div>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Asset side</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" /> Fixed assets
              </div>
              <div className="text-xl font-bold">{inr(data.fixed_assets_value)}</div>
              <div className="text-xs text-muted-foreground">{data.active_assets} active</div>
              <Link to="/assets" className="text-xs text-primary hover:underline mt-2 inline-block">View →</Link>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                <HardHat className="h-3.5 w-3.5" /> CWIP balance
              </div>
              <div className="text-xl font-bold">{inr(data.cwip_balance)}</div>
              <div className="text-xs text-muted-foreground">{data.active_cwip_count} projects</div>
              <Link to="/assets/cwip" className="text-xs text-primary hover:underline mt-2 inline-block">View →</Link>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" /> ROU asset (leases)
              </div>
              <div className="text-xl font-bold">{inr(data.rou_asset_value)}</div>
              <div className="text-xs text-muted-foreground">{data.active_lease_count} active leases</div>
              <Link to="/leases" className="text-xs text-primary hover:underline mt-2 inline-block">View →</Link>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs uppercase text-muted-foreground">Lifetime depreciation</div>
              <div className="text-xl font-bold text-amber-600">{inr(data.lifetime_depreciation)}</div>
              <div className="text-xs text-muted-foreground">Accumulated</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Liability composition */}
      <div>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Liability side</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs uppercase text-muted-foreground">Loans outstanding</div>
              <div className="text-xl font-bold text-red-600">{inr(data.loan_outstanding)}</div>
              <div className="text-xs text-muted-foreground">{data.active_loan_count} active</div>
              <Link to="/liabilities" className="text-xs text-primary hover:underline mt-2 inline-block">View →</Link>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs uppercase text-muted-foreground">Interest payable</div>
              <div className="text-xl font-bold">{inr(data.interest_payable)}</div>
              <div className="text-xs text-muted-foreground">Accrued − paid</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs uppercase text-muted-foreground">Lease liability</div>
              <div className="text-xl font-bold">{inr(data.lease_liability)}</div>
              <div className="text-xs text-muted-foreground">Finance leases</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Covenants
              </div>
              <div className="text-xl font-bold">
                {data.active_covenants}
                {data.breached_covenants > 0 && <span className="text-red-600 text-sm ml-2">{data.breached_covenants} breached</span>}
              </div>
              <div className="text-xs text-muted-foreground">{data.overdue_covenants} overdue check{data.overdue_covenants === 1 ? '' : 's'}</div>
              <Link to="/liabilities/covenants" className="text-xs text-primary hover:underline mt-2 inline-block">View →</Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Operating cash flow signals */}
      <div>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Recent operating activity</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                <Wrench className="h-3.5 w-3.5" /> Maintenance spend (30d)
              </div>
              <div className="text-xl font-bold">{inr(data.maintenance_spend_30d)}</div>
              <Link to="/assets/maintenance" className="text-xs text-primary hover:underline mt-2 inline-block">View →</Link>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                <TrendingDown className="h-3.5 w-3.5" /> EMIs due (next 30d)
              </div>
              <div className="text-xl font-bold text-amber-600">{inr(data.emi_outflow_30d)}</div>
              <div className="text-xs text-muted-foreground">{data.emis_due_30d} scheduled</div>
              <Link to="/liabilities/forecast" className="text-xs text-primary hover:underline mt-2 inline-block">View forecast →</Link>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" /> Insurance &amp; warranty
              </div>
              <div className="text-sm">
                <Link to="/assets/coverage" className="text-primary hover:underline">Manage policies →</Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cross-links */}
      <div className="text-xs text-muted-foreground space-x-2 border-t pt-3">
        Drill into:
        <Link to="/reports/asset-liability-mis" className="text-primary hover:underline">MIS rollups</Link>
        ·
        <Link to="/liabilities/health" className="text-primary hover:underline">Net worth & solvency</Link>
        ·
        <Link to="/accounting/financial-statements" className="text-primary hover:underline">Financial statements</Link>
        ·
        <Link to="/aczen-cfo" className="text-primary hover:underline">Aczen CFO AI</Link>
      </div>
    </div>
  );
};

export default CfoSnapshot;
