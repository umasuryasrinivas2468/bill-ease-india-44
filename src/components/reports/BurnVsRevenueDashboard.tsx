import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Flame } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { useExpenses } from '@/hooks/useExpenses';
import { formatINR } from '@/lib/gst';

const FIXED_CATEGORIES = [
  'Office Rent','Salaries & Wages','Software & Subscriptions',
  'Insurance','Utilities','Communication','Provident Fund',
];

// #24 Burn vs Revenue Dashboard — for startups / agencies. Monthly fixed
// costs vs incoming revenue. Shows runway-style health.
const BurnVsRevenueDashboard: React.FC = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: expenses = [] } = useExpenses();

  const months = useMemo(() => {
    const map = new Map<string, { revenue: number; fixed: number; variable: number }>();
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      map.set(d.toISOString().slice(0, 7), { revenue: 0, fixed: 0, variable: 0 });
    }
    invoices.forEach((i: any) => {
      const ym = (i.invoice_date || '').slice(0, 7);
      if (!map.has(ym)) return;
      map.get(ym)!.revenue += Number(i.total_amount || 0);
    });
    expenses.forEach((e: any) => {
      const ym = (e.expense_date || '').slice(0, 7);
      if (!map.has(ym)) return;
      const amt = Number(e.total_amount || 0);
      if (FIXED_CATEGORIES.includes(e.category_name)) map.get(ym)!.fixed += amt;
      else map.get(ym)!.variable += amt;
    });
    return Array.from(map.entries()).map(([ym, m]) => ({
      month: ym,
      revenue: m.revenue,
      fixed: m.fixed,
      variable: m.variable,
      burn: m.fixed + m.variable,
      net: m.revenue - (m.fixed + m.variable),
    }));
  }, [invoices, expenses]);

  const lastMonth = months[months.length - 1] || { revenue: 0, fixed: 0, burn: 0, net: 0 };
  const avgBurn = months.length ? months.reduce((s, m) => s + m.burn, 0) / months.length : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" /> Burn vs Revenue
        </CardTitle>
        <CardDescription>
          Monthly fixed + variable costs against incoming revenue. Last 6 months.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">This month revenue</div>
            <div className="text-lg font-semibold">{formatINR(lastMonth.revenue)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">This month burn</div>
            <div className="text-lg font-semibold text-orange-600">{formatINR(lastMonth.burn)}</div>
          </CardContent></Card>
          <Card className={lastMonth.net >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Net</div>
              <div className={`text-lg font-semibold ${lastMonth.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatINR(lastMonth.net)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-2">
          {months.map((m) => {
            const max = Math.max(m.revenue, m.burn, 1);
            const revPct = (m.revenue / max) * 100;
            const burnPct = (m.burn / max) * 100;
            return (
              <div key={m.month}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{m.month}</span>
                  <span className={m.net >= 0 ? 'text-green-700' : 'text-red-700'}>
                    Net {formatINR(m.net)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-right text-muted-foreground">Rev</span>
                  <div className="flex-1 bg-muted rounded h-3 overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${revPct}%` }} />
                  </div>
                  <span className="w-24 text-right">{formatINR(m.revenue)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs mt-1">
                  <span className="w-12 text-right text-muted-foreground">Burn</span>
                  <div className="flex-1 bg-muted rounded h-3 overflow-hidden">
                    <div className="h-full bg-orange-500" style={{ width: `${burnPct}%` }} />
                  </div>
                  <span className="w-24 text-right">{formatINR(m.burn)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 text-sm text-muted-foreground">
          Average monthly burn (6mo): <b>{formatINR(avgBurn)}</b>.
        </div>
      </CardContent>
    </Card>
  );
};

export default BurnVsRevenueDashboard;
