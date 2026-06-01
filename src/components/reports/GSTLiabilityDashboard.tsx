import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  AlertCircle,
  Wallet,
  ReceiptText,
  Coins,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { useGSTLiability } from '@/hooks/useGSTLiability';
import { formatINR } from '@/lib/gst';
import { fetchThreeWayReconciliation, validateBooks } from '@/services/financialStatementsService';

const currentMonth = () => new Date().toISOString().slice(0, 7); // YYYY-MM

const GSTLiabilityDashboard: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const [month, setMonth] = useState<string>(currentMonth());
  const { data, isLoading, error } = useGSTLiability(month);

  // Filing readiness — combines 3-way recon + validate_books signal.
  const { data: recon } = useQuery({
    queryKey: ['filing-readiness-recon', userId, month],
    queryFn: () => userId ? fetchThreeWayReconciliation(userId, month) : Promise.resolve(null),
    enabled: !!userId,
  });
  const fy = (() => {
    const [y, m] = month.split('-').map(Number);
    const startY = m >= 4 ? y : y - 1;
    return `${startY}-${(startY + 1).toString().slice(2)}`;
  })();
  const { data: validation } = useQuery({
    queryKey: ['filing-readiness-validate', userId, fy],
    queryFn: () => userId ? validateBooks(userId, fy) : Promise.resolve(null),
    enabled: !!userId,
  });

  const readiness = (() => {
    const s = recon?.summary;
    const checksFailed = validation?.checks?.filter(c => c.passed === false).length ?? 0;
    const matchPct = s && s.total_rows > 0 ? (s.matched / s.total_rows) * 100 : 100;
    const issues = (s?.missing_in_portal ?? 0)
                 + (s?.missing_in_books ?? 0)
                 + (s?.gst_mismatch ?? 0)
                 + (s?.value_mismatch ?? 0)
                 + (s?.duplicate_invoices ?? 0)
                 + checksFailed;
    let tone: 'green' | 'amber' | 'red' = 'green';
    let label = 'Ready to file';
    if (issues > 0 && issues <= 5) { tone = 'amber'; label = 'Review recommended'; }
    if (issues > 5 || checksFailed > 0) { tone = 'red'; label = 'Not ready — fix issues first'; }
    return { tone, label, issues, matchPct, checksFailed };
  })();

  const toneStyles: Record<'green' | 'amber' | 'red', string> = {
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red:   'bg-red-50 border-red-200 text-red-800',
  };

  return (
    <div className="space-y-6">
      {/* Period picker */}
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <div className="flex-1">
            <Label htmlFor="month" className="text-xs text-muted-foreground">
              Period
            </Label>
            <Input
              id="month"
              type="month"
              value={month}
              max={currentMonth()}
              onChange={(e) => setMonth(e.target.value)}
              className="w-48"
            />
          </div>
          {data && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Net GST payable in cash</div>
              <div className="text-2xl font-bold text-orange-600">
                {formatINR(data.net_payable.total_cash)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filing Readiness */}
      <Card className={`border ${toneStyles[readiness.tone]}`}>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            {readiness.tone === 'red'
              ? <ShieldAlert className="h-6 w-6" />
              : <ShieldCheck className="h-6 w-6" />}
            <div>
              <div className="text-sm font-semibold">Filing Readiness — {readiness.label}</div>
              <div className="text-xs opacity-80">
                {readiness.issues} issue(s) detected · {readiness.matchPct.toFixed(0)}% recon matched · {readiness.checksFailed} validation check(s) failing
              </div>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] bg-background">
            Book vs Portal · FY {fy}
          </Badge>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-red-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Failed to load GST liability: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {data && !isLoading && (
        <>
          {/* ═══ Feature #13 — Output Tax Liability ═══ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Output Tax Liability
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                GST collected on sales, net of credit notes issued this period.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatBox
                  label="CGST"
                  value={data.net_output.cgst}
                  accent="blue"
                />
                <StatBox
                  label="SGST"
                  value={data.net_output.sgst}
                  accent="green"
                />
                <StatBox
                  label="IGST"
                  value={data.net_output.igst}
                  accent="purple"
                />
              </div>

              <div className="border-t pt-4 space-y-2 text-sm">
                <Row
                  label="GST on invoices"
                  value={formatINR(data.output.total)}
                />
                <Row
                  label="Less: credit notes"
                  value={`– ${formatINR(data.credit_notes.total)}`}
                  muted
                />
                <Row
                  label="Net Output Tax"
                  value={formatINR(data.net_output.total)}
                  bold
                />
              </div>
            </CardContent>
          </Card>

          {/* ═══ Feature #14 — Net GST Payable ═══ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-orange-600" />
                Net GST Payable (Monthly Summary)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Formula: Output Tax − Eligible ITC = Net GST Payable
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <FormulaBox
                  label="Output GST"
                  value={data.net_output.total}
                  icon={<TrendingUp className="h-4 w-4" />}
                  color="text-green-700 bg-green-50 border-green-200"
                />
                <FormulaBox
                  label="Eligible ITC"
                  value={data.itc.total}
                  icon={<TrendingDown className="h-4 w-4" />}
                  color="text-blue-700 bg-blue-50 border-blue-200"
                />
                <FormulaBox
                  label="Net Payable in Cash"
                  value={data.net_payable.total_cash}
                  icon={<Coins className="h-4 w-4" />}
                  color="text-orange-700 bg-orange-50 border-orange-200"
                  bold
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-blue-200 bg-blue-50/40">
                  <CardContent className="pt-4 space-y-2 text-sm">
                    <div className="font-medium text-blue-900 flex items-center gap-1">
                      <ReceiptText className="h-4 w-4" /> ITC Breakdown
                    </div>
                    <Row
                      label="From purchase bills"
                      value={formatINR(data.itc.purchase_bills)}
                    />
                    <Row
                      label="From RCM (self-assessed)"
                      value={formatINR(data.itc.rcm)}
                    />
                    <Row
                      label="Total ITC available"
                      value={formatINR(data.itc.total)}
                      bold
                    />
                  </CardContent>
                </Card>

                <Card className="border-orange-200 bg-orange-50/40">
                  <CardContent className="pt-4 space-y-2 text-sm">
                    <div className="font-medium text-orange-900 flex items-center gap-1">
                      <Wallet className="h-4 w-4" /> Net Payable Split
                    </div>
                    <Row label="CGST in cash" value={formatINR(data.net_payable.cgst)} />
                    <Row label="SGST in cash" value={formatINR(data.net_payable.sgst)} />
                    <Row label="IGST in cash" value={formatINR(data.net_payable.igst)} />
                    <Row
                      label="+ RCM liability"
                      value={formatINR(data.rcm_liability)}
                      muted
                    />
                    <Row
                      label="Total cash outflow"
                      value={formatINR(data.net_payable.total_cash)}
                      bold
                    />
                  </CardContent>
                </Card>
              </div>

              <p className="text-xs text-muted-foreground">
                Note: ITC is offset proportionally across CGST/SGST/IGST based on the output tax mix.
                Actual GSTN set-off rules allow some cross-utilisation (e.g. IGST credit can pay CGST/SGST).
                Use this as a planning estimate; refer to your GSTR-3B for the final figure.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

const StatBox: React.FC<{
  label: string;
  value: number;
  accent: 'blue' | 'green' | 'purple';
}> = ({ label, value, accent }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-800 border-blue-200',
    green: 'bg-green-50 text-green-800 border-green-200',
    purple: 'bg-purple-50 text-purple-800 border-purple-200',
  };
  return (
    <div className={`border rounded-lg p-4 ${colors[accent]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-xl font-bold mt-1">{formatINR(value)}</div>
    </div>
  );
};

const FormulaBox: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bold?: boolean;
}> = ({ label, value, icon, color, bold }) => (
  <div className={`border rounded-lg p-4 ${color}`}>
    <div className="flex items-center gap-1 text-xs uppercase tracking-wide">
      {icon}
      {label}
    </div>
    <div className={`mt-1 ${bold ? 'text-2xl font-bold' : 'text-xl font-semibold'}`}>
      {formatINR(value)}
    </div>
  </div>
);

const Row: React.FC<{
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}> = ({ label, value, bold, muted }) => (
  <div
    className={`flex justify-between ${bold ? 'font-semibold border-t pt-2 mt-1' : ''} ${
      muted ? 'text-muted-foreground' : ''
    }`}
  >
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

export default GSTLiabilityDashboard;
