import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { GitBranch, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { useInvoices } from '@/hooks/useInvoices';
import { useQuotations } from '@/hooks/useQuotations';
import { normalizeUserId } from '@/lib/userUtils';
import { formatINR } from '@/lib/gst';

// #9 Invoice Conversion Funnel — Quotation → Sales Order → Invoice → Payment
// with drop-off counts at each stage. Uses live tables, not the SQL view,
// so it works even if the user hasn't run the migration yet.
const ConversionFunnel: React.FC = () => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;

  const { data: quotations = [] } = useQuotations();
  const { data: invoices = [] } = useInvoices();

  const { data: salesOrders = [] } = useQuery({
    queryKey: ['sales-orders-funnel', uid],
    queryFn: async () => {
      if (!uid) return [];
      const { data, error } = await supabase
        .from('sales_orders' as any)
        .select('id,total_amount')
        .eq('user_id', uid);
      if (error) return [];
      return data as any[];
    },
    enabled: !!uid,
  });

  const stages = useMemo(() => {
    const sumQ = quotations.reduce((s: number, q: any) => s + Number(q.total_amount || q.amount || 0), 0);
    const sumSO = salesOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
    const sumInv = invoices.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
    const sumPaid = invoices
      .filter((i: any) => i.status === 'paid')
      .reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);

    return [
      { label: 'Quotations', count: quotations.length, value: sumQ },
      { label: 'Sales Orders', count: salesOrders.length, value: sumSO },
      { label: 'Invoices', count: invoices.length, value: sumInv },
      { label: 'Paid', count: invoices.filter((i: any) => i.status === 'paid').length, value: sumPaid },
    ];
  }, [quotations, salesOrders, invoices]);

  const top = Math.max(stages[0].count, 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" /> Invoice Conversion Funnel
        </CardTitle>
        <CardDescription>
          Quotation → Sales Order → Invoice → Payment, with drop-offs at each stage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {stages.map((s, idx) => {
            const prev = idx > 0 ? stages[idx - 1] : null;
            const dropoff = prev && prev.count > 0 ? Math.round((1 - s.count / prev.count) * 100) : 0;
            const pct = (s.count / top) * 100;
            return (
              <div key={s.label}>
                <div className="flex items-center justify-between mb-1 text-sm">
                  <div className="flex items-center gap-2">
                    {idx > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-medium">{s.label}</span>
                    <span className="text-muted-foreground">— {s.count} • {formatINR(s.value)}</span>
                  </div>
                  {prev && (
                    <span className={`text-xs ${dropoff > 50 ? 'text-red-600' : dropoff > 20 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {dropoff > 0 ? `↓ ${dropoff}% drop-off` : '✓ no drop-off'}
                    </span>
                  )}
                </div>
                <Progress value={pct} className="h-3" />
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-3 rounded-md bg-blue-50 border border-blue-200 text-sm">
          {stages[0].count > 0 ? (
            <>
              Overall quotation→paid conversion:&nbsp;
              <b>{((stages[3].count / Math.max(1, stages[0].count)) * 100).toFixed(1)}%</b>
            </>
          ) : 'Add quotations to see conversion metrics.'}
        </div>
      </CardContent>
    </Card>
  );
};

export default ConversionFunnel;
