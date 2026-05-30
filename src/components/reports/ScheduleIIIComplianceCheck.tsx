import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

interface Integrity {
  trial_balance_balanced: boolean;
  trial_balance_debit: number;
  trial_balance_credit: number;
  trial_balance_diff: number;
  unclassified_accounts: number;
  all_accounts_classified: boolean;
  total_assets: number;
  total_equity_and_liab: number;
  bs_equation_holds: boolean;
  bs_equation_diff: number;
  validated_at: string;
}

const formatINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const Row = ({
  label, ok, detail,
}: { label: string; ok: boolean; detail?: string }) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b last:border-b-0">
    <div className="flex items-start gap-2 min-w-0">
      {ok
        ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
        : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />}
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {detail && <div className="text-xs text-muted-foreground break-words">{detail}</div>}
      </div>
    </div>
    <Badge variant={ok ? 'default' : 'destructive'} className="shrink-0">
      {ok ? 'OK' : 'Issue'}
    </Badge>
  </div>
);

export default function ScheduleIIIComplianceCheck() {
  const { user } = useUser();
  const [data, setData] = useState<Integrity | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data: res, error } = await supabase.rpc('validate_schedule_iii_integrity', { p_user_id: user.id });
    if (error) console.error('[ScheduleIIIComplianceCheck]', error);
    setData((res as Integrity) ?? null);
    setLoading(false);
  };

  useEffect(() => { run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  if (!data && !loading) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            Schedule III Compliance Check
          </CardTitle>
          <CardDescription>Ledger-first integrity checks for audit readiness</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1.5 hidden sm:inline">Re-check</span>
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Running compliance validation…
          </div>
        ) : data ? (
          <div className="space-y-0.5">
            <Row
              label="Trial Balance balanced (Σ Dr = Σ Cr)"
              ok={data.trial_balance_balanced}
              detail={`Dr ${formatINR(data.trial_balance_debit)} · Cr ${formatINR(data.trial_balance_credit)}`
                + (!data.trial_balance_balanced ? ` · Diff ${formatINR(data.trial_balance_diff)}` : '')}
            />
            <Row
              label="All accounts classified under Schedule III"
              ok={data.all_accounts_classified}
              detail={data.all_accounts_classified
                ? 'Every active account has a Schedule III line code.'
                : `${data.unclassified_accounts} account(s) need classification.`}
            />
            <Row
              label="Balance Sheet equation (Assets = Equity + Liabilities)"
              ok={data.bs_equation_holds}
              detail={`Assets ${formatINR(data.total_assets)} · Equity+Liab ${formatINR(data.total_equity_and_liab)}`
                + (!data.bs_equation_holds ? ` · Diff ${formatINR(data.bs_equation_diff)}` : '')}
            />
            {data.validated_at && (
              <div className="pt-2 text-[11px] text-muted-foreground">
                Validated {new Date(data.validated_at).toLocaleString('en-IN')}
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
