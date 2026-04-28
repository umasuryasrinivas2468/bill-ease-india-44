import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { useExpenses } from '@/hooks/useExpenses';
import { formatINR } from '@/lib/gst';

const TRACKED_CATS = ['Office Rent','Travel & Accommodation','Salaries & Wages','Software & Subscriptions','Advertising & Marketing'];

// #25 Monthly Variance Engine — this month vs last month.
// Revenue +12%, Rent same, Travel +40%, Collection slower by 9 days, etc.
const MonthlyVarianceEngine: React.FC = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: expenses = [] } = useExpenses();

  const ym = (d: Date) => d.toISOString().slice(0, 7);
  const today = new Date();
  const thisMonth = ym(today);
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonth = ym(lastMonthDate);

  const variance = useMemo(() => {
    const revThis = invoices
      .filter((i: any) => (i.invoice_date || '').startsWith(thisMonth))
      .reduce((s, i: any) => s + Number(i.total_amount || 0), 0);
    const revLast = invoices
      .filter((i: any) => (i.invoice_date || '').startsWith(lastMonth))
      .reduce((s, i: any) => s + Number(i.total_amount || 0), 0);

    const expByCat = (target: string) => {
      const map = new Map<string, number>();
      expenses
        .filter((e: any) => (e.expense_date || '').startsWith(target))
        .forEach((e: any) => {
          map.set(e.category_name, (map.get(e.category_name) || 0) + Number(e.total_amount || 0));
        });
      return map;
    };
    const expThis = expByCat(thisMonth);
    const expLast = expByCat(lastMonth);

    const collectThis = (() => {
      const paid = invoices.filter((i: any) =>
        i.status === 'paid' && (i.updated_at || '').startsWith(thisMonth));
      if (!paid.length) return null;
      return paid.reduce((s, i: any) => {
        const inv = new Date(i.invoice_date);
        const upd = new Date(i.updated_at);
        return s + Math.max(0, Math.ceil((upd.getTime() - inv.getTime()) / 86400000));
      }, 0) / paid.length;
    })();
    const collectLast = (() => {
      const paid = invoices.filter((i: any) =>
        i.status === 'paid' && (i.updated_at || '').startsWith(lastMonth));
      if (!paid.length) return null;
      return paid.reduce((s, i: any) => {
        const inv = new Date(i.invoice_date);
        const upd = new Date(i.updated_at);
        return s + Math.max(0, Math.ceil((upd.getTime() - inv.getTime()) / 86400000));
      }, 0) / paid.length;
    })();

    const lines: { label: string; thisM: number | null; lastM: number | null; unit: 'inr' | 'days'; }[] = [
      { label: 'Revenue', thisM: revThis, lastM: revLast, unit: 'inr' },
      ...TRACKED_CATS.map((c) => ({
        label: c,
        thisM: expThis.get(c) || 0,
        lastM: expLast.get(c) || 0,
        unit: 'inr' as const,
      })),
      { label: 'Collection cycle (days)', thisM: collectThis, lastM: collectLast, unit: 'days' },
    ];

    return lines.map((l) => {
      let pct = 0;
      if (l.lastM && l.lastM !== 0 && l.thisM !== null) pct = ((l.thisM - l.lastM) / l.lastM) * 100;
      return { ...l, pct };
    });
  }, [invoices, expenses, thisMonth, lastMonth]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Variance Engine</CardTitle>
        <CardDescription>
          {thisMonth} vs {lastMonth} — what got better, what got worse.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">{thisMonth}</TableHead>
                <TableHead className="text-right">{lastMonth}</TableHead>
                <TableHead className="text-right">Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variance.map((v) => {
                const fmt = (n: number | null) =>
                  n === null ? '—' : v.unit === 'days' ? `${n.toFixed(1)}d` : formatINR(n);
                const goodWhenDown = v.unit === 'days' || v.label !== 'Revenue';
                const isBad = goodWhenDown ? v.pct > 5 : v.pct < -5;
                const isGood = goodWhenDown ? v.pct < -5 : v.pct > 5;
                return (
                  <TableRow key={v.label}>
                    <TableCell>{v.label}</TableCell>
                    <TableCell className="text-right">{fmt(v.thisM)}</TableCell>
                    <TableCell className="text-right">{fmt(v.lastM)}</TableCell>
                    <TableCell className="text-right">
                      {v.lastM ? (
                        <Badge variant={isBad ? 'destructive' : isGood ? 'default' : 'outline'} className="gap-1">
                          {v.pct > 0 ? <TrendingUp className="h-3 w-3" />
                           : v.pct < 0 ? <TrendingDown className="h-3 w-3" />
                           : <Minus className="h-3 w-3" />}
                          {v.pct > 0 ? '+' : ''}{v.pct.toFixed(0)}%
                        </Badge>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default MonthlyVarianceEngine;
